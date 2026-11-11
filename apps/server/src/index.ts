import { createServer } from "node:http";
import { Server } from "socket.io";
import { fromNodeHeaders } from "better-auth/node";
import { GameError, type ClientEvents, type ServerEvents } from "@cabo/shared";
import { createApp, logger } from "./app.js";
import { db } from "./db.js";
import { auth } from "./auth.js";
import { config, origins } from "./config.js";
import {
  command,
  roomView,
  ServiceError,
  tickRoom,
  setOnlineLookup,
} from "./game-service.js";
import { setPublisher } from "./api.js";
import { setNotificationEmitter, notify } from "./notifications.js";
const http = createServer(createApp());
const io = new Server<ClientEvents, ServerEvents>(http, {
  cors: { origin: origins, credentials: true },
  maxHttpBufferSize: 65536,
  pingTimeout: 20000,
});
const sockets = new Map<string, Set<string>>();
setOnlineLookup((userId) => !!sockets.get(userId)?.size);
const turnNotifications = new Map<string, string>();
async function publish(roomId: string) {
  const members = await db.roomMember.findMany({ where: { roomId } });
  for (const m of members) {
    const ids = sockets.get(m.userId);
    if (!ids?.size) continue;
    const view = await roomView(roomId, m.userId);
    for (const id of ids) {
      io.to(id).emit("room:changed", { roomId });
      if (view.game) io.to(id).emit("game:state", { ...view.game, roomId });
    }
  }
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (room?.status === "playing" && room.activeMatchId) {
    const snap = await db.gameSnapshot.findUnique({
      where: { matchId: room.activeMatchId },
    });
    if (snap) {
      const g = snap.state as unknown as import("@cabo/shared").Game;
      const key = `${room.activeMatchId}:${g.round}:${g.turn}:${g.deadline}`;
      if (
        g.phase === "turn" &&
        !g.pausedAt &&
        turnNotifications.get(roomId) !== key
      ) {
        turnNotifications.set(roomId, key);
        const userId = g.players[g.turn].id;
        if (!sockets.get(userId)?.size)
          await notify(
            userId,
            "your_turn",
            "It’s your turn at the table.",
            roomId,
          ).catch((err) => logger.error({ err }, "Turn notification failed"));
      }
    }
  }
}
setPublisher(publish);
setNotificationEmitter((userId, n) => {
  for (const id of sockets.get(userId) || []) io.to(id).emit("notification", n);
});
io.use(async (socket, next) => {
  try {
    // Native clients send the SecureStore cookie in the TLS handshake auth object.
    const headers = fromNodeHeaders(socket.request.headers);
    if (typeof socket.handshake.auth.cookie === "string")
      headers.set("cookie", socket.handshake.auth.cookie);
    const session = await auth.api.getSession({ headers });
    if (!session) {
      next(new Error("UNAUTHENTICATED"));
      return;
    }
    socket.data.userId = session.user.id;
    next();
  } catch {
    next(new Error("UNAUTHENTICATED"));
  }
});
io.on("connection", (socket) => {
  const userId = socket.data.userId as string;
  const set = sockets.get(userId) || new Set<string>();
  set.add(socket.id);
  sockets.set(userId, set);
  void db.profile
    .updateMany({
      where: { userId },
      data: { online: true, lastSeen: new Date() },
    })
    .catch((err) => logger.error({ err }, "Presence update failed"));
  void db.roomMember
    .updateMany({
      where: { userId },
      data: { connectedAt: new Date(), disconnectedAt: null },
    })
    .catch((err) => logger.error({ err }, "Presence update failed"));
  const validateSession = async () => {
    const headers = fromNodeHeaders(socket.request.headers);
    if (typeof socket.handshake.auth.cookie === "string")
      headers.set("cookie", socket.handshake.auth.cookie);
    const session = await auth.api.getSession({ headers });
    if (session?.user.id !== userId)
      throw new ServiceError("SESSION_REVOKED", 401);
  };
  let window = Date.now(),
    count = 0;
  const allowed = () => {
    if (Date.now() - window > 10000) {
      window = Date.now();
      count = 0;
    }
    return ++count <= 40;
  };
  socket.on("room:sync", async (roomId, ack) => {
    if (typeof ack !== "function") return;
    try {
      if (!allowed() || typeof roomId !== "string" || roomId.length > 100)
        throw new ServiceError("RATE_LIMIT");
      await validateSession();
      ack({ ok: true, data: await roomView(roomId, userId) });
    } catch (e) {
      ack({
        ok: false,
        error: e instanceof ServiceError ? e.code : "SYNC_FAILED",
      });
    }
  });
  socket.on("game:command", async (input, ack) => {
    if (typeof ack !== "function") return;
    try {
      if (!allowed()) throw new ServiceError("RATE_LIMIT");
      await validateSession();
      const view = await command(userId, input);
      ack({ ok: true, data: view });
      await publish(input.roomId);
    } catch (e) {
      ack({
        ok: false,
        error:
          e instanceof ServiceError || e instanceof GameError
            ? e.code
            : "COMMAND_FAILED",
      });
    }
  });
  socket.on("disconnect", () => {
    const ids = sockets.get(userId);
    ids?.delete(socket.id);
    if (!ids?.size) {
      sockets.delete(userId);
      void db.profile
        .updateMany({
          where: { userId },
          data: { online: false, lastSeen: new Date() },
        })
        .catch((err) => logger.error({ err }, "Presence update failed"));
      void db.roomMember
        .updateMany({ where: { userId }, data: { disconnectedAt: new Date() } })
        .catch((err) => logger.error({ err }, "Disconnect update failed"));
    }
  });
});
// Recover deadlines from PostgreSQL; scheduler never rebuilds or reshuffles active hands.
await db.profile.updateMany({ data: { online: false } });
await db.roomMember.updateMany({
  where: { room: { status: "playing" } },
  data: { disconnectedAt: new Date() },
});
let ticking = false;
const interval = setInterval(async () => {
  if (ticking) return;
  ticking = true;
  try {
    const rooms = await db.room.findMany({
      where: { status: "playing" },
      select: { id: true },
    });
    for (const r of rooms) if (await tickRoom(r.id)) await publish(r.id);
  } catch (err) {
    logger.error({ err }, "Scheduler failed");
  } finally {
    ticking = false;
  }
}, 1000);
http.listen(config.PORT, "0.0.0.0", () =>
  logger.info({ port: config.PORT }, "CABO listening"),
);
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(interval);
  const force = setTimeout(() => process.exit(1), 10000);
  force.unref();
  io.close();
  http.close(async () => {
    await db.$disconnect();
    clearTimeout(force);
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

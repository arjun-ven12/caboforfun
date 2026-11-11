import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  envelopeSchema,
  matchWinners,
  expire,
  playerView,
  startGame,
  transition,
  type Game,
  type Rules,
  type Envelope,
} from "@cabo/shared";
import { db, json } from "./db.js";
let isOnline: (userId: string) => boolean = () => false;
export function setOnlineLookup(fn: (userId: string) => boolean) {
  isOnline = fn;
}
export class ServiceError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export function check(ok: unknown, code: string, status = 400): asserts ok {
  if (!ok) throw new ServiceError(code, status);
}
export async function locked<T>(
  roomId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      const found = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM "Room" WHERE id=${roomId} FOR UPDATE`;
      check(found.length, "ROOM_NOT_FOUND", 404);
      return fn(tx);
    },
    { maxWait: 10000, timeout: 15000 },
  );
}
export async function member(
  tx: Prisma.TransactionClient,
  roomId: string,
  userId: string,
) {
  const m = await tx.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  check(m, "NOT_MEMBER", 403);
  return m;
}
export async function roomView(roomId: string, userId: string) {
  await member(db, roomId, userId);
  const room = await db.room.findUniqueOrThrow({
    where: { id: roomId },
    include: {
      members: {
        orderBy: { seat: "asc" },
        include: { user: { select: { name: true, profile: true } } },
      },
    },
  });
  const snap = room.activeMatchId
    ? await db.gameSnapshot.findUnique({
        where: { matchId: room.activeMatchId },
      })
    : null;
  return {
    ...room,
    members: room.members.map(({ user, ...m }) => ({
      ...m,
      name: user.profile?.displayName || user.name,
    })),
    game: snap ? playerView(snap.state as unknown as Game, userId) : null,
  };
}
async function saveState(
  tx: Prisma.TransactionClient,
  matchId: string,
  roomId: string,
  g: Game,
) {
  await tx.gameSnapshot.update({
    where: { matchId },
    data: { state: json(g), version: g.version },
  });
  if (g.scores.length) {
    await tx.round.upsert({
      where: { matchId_number: { matchId, number: g.round } },
      create: { matchId, number: g.round, scores: json(g.scores) },
      update: { scores: json(g.scores) },
    });
  }
  if (g.phase === "matchOver") {
    await tx.match.update({
      where: { id: matchId },
      data: { completedAt: new Date() },
    });
    await tx.room.update({
      where: { id: roomId },
      data: { status: "finished" },
    });
    const winners = matchWinners(g);
    for (const p of g.players)
      await tx.matchParticipant.update({
        where: { matchId_userId: { matchId, userId: p.id } },
        data: {
          total: g.totals[p.id],
          winner: winners.includes(p.id),
        },
      });
  }
}
export async function command(userId: string, input: Envelope) {
  const e = envelopeSchema.parse(input);
  return locked(e.roomId, async (tx) => {
    await member(tx, e.roomId, userId);
    const room = await tx.room.findUniqueOrThrow({ where: { id: e.roomId } });
    check(room.activeMatchId, "NO_MATCH");
    const snap = await tx.gameSnapshot.findUniqueOrThrow({
      where: { matchId: room.activeMatchId },
    });
    const g = snap.state as unknown as Game;
    const old = await tx.gameAction.findUnique({
      where: { userId_actionId: { userId, actionId: e.actionId } },
    });
    if (old) {
      check(old.matchId === room.activeMatchId, "ACTION_ID_REUSED");
      return playerView(g, userId);
    }
    check(g.version === e.version, "STALE_VERSION", 409);
    const next = transition(g, userId, e.command, randomInt, Date.now());
    await saveState(tx, room.activeMatchId, e.roomId, next);
    await tx.gameAction.create({
      data: {
        matchId: room.activeMatchId,
        userId,
        actionId: e.actionId,
        version: next.version,
        type: e.command.type,
      },
    });
    return playerView(next, userId);
  });
}
export async function startMatch(
  roomId: string,
  userId: string,
  rematch = false,
) {
  return locked(roomId, async (tx) => {
    const room = await tx.room.findUniqueOrThrow({
      where: { id: roomId },
      include: { members: { orderBy: { seat: "asc" } } },
    });
    check(room.hostId === userId, "HOST_ONLY", 403);
    check(
      rematch ? room.status === "finished" : room.status === "lobby",
      "WRONG_ROOM_STATE",
    );
    check(
      room.members.every((m) => (rematch ? m.rematch : m.ready)),
      "ALL_PLAYERS_MUST_ACCEPT",
    );
    const g = startGame(
      room.members.map((m) => m.userId),
      room.rules as unknown as Rules,
      randomInt,
      Date.now(),
    );
    const match = await tx.match.create({
      data: {
        roomId,
        rules: room.rules as Prisma.InputJsonValue,
        previousId: rematch ? room.activeMatchId : undefined,
        snapshot: { create: { state: json(g), version: g.version } },
        participants: {
          create: room.members.map((m) => ({ userId: m.userId })),
        },
      },
    });
    await tx.room.update({
      where: { id: roomId },
      data: { status: "playing", activeMatchId: match.id },
    });
    await tx.roomMember.updateMany({
      where: { roomId },
      data: { rematch: false },
    });
    for (const m of room.members)
      await tx.roomMember.update({
        where: { id: m.id },
        data: { disconnectedAt: isOnline(m.userId) ? null : new Date() },
      });
    return match.id;
  });
}
export async function tickRoom(roomId: string) {
  return locked(roomId, async (tx) => {
    const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
    if (room.status !== "playing" || !room.activeMatchId) return false;
    const snap = await tx.gameSnapshot.findUniqueOrThrow({
      where: { matchId: room.activeMatchId },
    });
    let g = snap.state as unknown as Game;
    const now = Date.now();
    let next = g;
    const absent = await tx.roomMember.findMany({
      where: {
        roomId,
        disconnectedAt: {
          lt: new Date(now - g.rules.disconnectSeconds * 1000),
        },
      },
    });
    if (absent.length && g.rules.disconnectPolicy === "pause") {
      if (g.pausedAt) return false;
      next = { ...g, pausedAt: now, version: g.version + 1 };
      await saveState(tx, room.activeMatchId, roomId, next);
      return true;
    }
    if (g.pausedAt && !absent.length) {
      next = {
        ...g,
        deadline: g.deadline + (now - g.pausedAt),
        version: g.version + 1,
      };
      delete next.pausedAt;
      await saveState(tx, room.activeMatchId, roomId, next);
      return true;
    }
    next = expire(g, randomInt, now);
    // Extended absence ends the match explicitly; all remaining players win by forfeit.
    if (absent.length && g.phase !== "matchOver") {
      await tx.match.update({
        where: { id: room.activeMatchId },
        data: { completedAt: new Date() },
      });
      await tx.room.update({
        where: { id: roomId },
        data: { status: "finished" },
      });
      const forfeited = absent.map((m) => m.userId);
      for (const p of g.players)
        await tx.matchParticipant.update({
          where: {
            matchId_userId: { matchId: room.activeMatchId, userId: p.id },
          },
          data: { total: g.totals[p.id], winner: !forfeited.includes(p.id) },
        });
      next = {
        ...g,
        phase: "matchOver",
        forfeit: forfeited,
        scores: [],
        version: g.version + 1,
      };
      if (next.drawn) next.discard.push(next.drawn.card);
      delete next.drawn;
      delete next.reveal;
      delete next.publicReveal;
      await tx.gameSnapshot.update({
        where: { matchId: room.activeMatchId },
        data: { state: json(next), version: next.version },
      });
      return true;
    }
    if (next.version !== g.version) {
      await saveState(tx, room.activeMatchId, roomId, next);
      return true;
    }
    return false;
  });
}

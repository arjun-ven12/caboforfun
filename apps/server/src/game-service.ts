import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  envelopeSchema,
  rulesSchema,
  matchWinners,
  expire,
  playerView,
  startGame,
  transition,
  botConfigSchema,
  type PublicIdentity,
  type Game,
  type Rules,
  type Envelope,
  type AuthorizedGameView,
} from "@cabo/shared";
import { observeAgents, type AgentMap } from "./bot-state.js";
import { identities } from "./identity.js";
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
async function authorizedView(
  tx: Prisma.TransactionClient,
  g: Game,
  userId: string,
  matchId: string,
): Promise<AuthorizedGameView> {
  const match = await tx.match.findUniqueOrThrow({
    where: { id: matchId },
    select: {
      createdAt: true,
      participants: { select: { userId: true, identity: true } },
    },
  });
  return {
    ...playerView(g, userId),
    matchId,
    matchStartedAt: match.createdAt.getTime(),
    identities: {
      ...(await identities(
        g.players.map((p) => p.id),
        tx,
      )),
      ...Object.fromEntries(
        match.participants
          .filter((p) => p.identity)
          .map((p) => [p.userId, p.identity as unknown as PublicIdentity]),
      ),
    },
  };
}
export async function roomView(roomId: string, userId: string) {
  await member(db, roomId, userId);
  const room = await db.room.findUniqueOrThrow({
    where: { id: roomId },
    include: {
      bots: { orderBy: { seat: "asc" } },
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
    rules: rulesSchema.parse(room.rules),
    members: [
      ...room.members.map(({ user, ...m }) => ({
        ...m,
        name: user.profile?.displayName || user.name,
        displayName: user.profile?.displayName || user.name,
        username: user.profile?.username ?? null,
        kind: "human",
      })),
      ...room.bots.map((b) => ({
        id: b.id,
        userId: `bot:${b.id}`,
        name: b.name,
        displayName: b.name,
        username: null,
        seat: b.seat,
        kind: "bot",
        ready: true,
        rematch: true,
        config: b.config,
        difficulty: botConfigSchema.parse(b.config).difficulty,
        personality: botConfigSchema.parse(b.config).personality,
      })),
    ].sort((a, b) => a.seat - b.seat),
    serverTime: Date.now(),
    game: snap
      ? await authorizedView(
          db,
          snap.state as unknown as Game,
          userId,
          snap.matchId,
        )
      : null,
  };
}
export async function saveState(
  tx: Prisma.TransactionClient,
  matchId: string,
  roomId: string,
  g: Game,
  agents?: AgentMap,
) {
  const previous =
    agents ??
    ((await tx.gameSnapshot.findUniqueOrThrow({ where: { matchId } }))
      .botState as unknown as AgentMap);
  await tx.gameSnapshot.update({
    where: { matchId },
    data: {
      state: json(g),
      version: g.version,
      botState: json(observeAgents(g, previous)),
    },
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
      return {
        view: await authorizedView(tx, g, userId, room.activeMatchId),
        events: [],
        matchId: room.activeMatchId,
      };
    }
    check(!room.soloPausedAt, "GAME_PAUSED");
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
        round: g.round,
      },
    });
    return {
      view: await authorizedView(tx, next, userId, room.activeMatchId),
      events: (next.swapHistory ?? []).filter(
        (e) => e.version === next.version,
      ),
      matchId: room.activeMatchId,
    };
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
      include: {
        members: { orderBy: { seat: "asc" } },
        bots: { orderBy: { seat: "asc" } },
      },
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
    const seats = [
      ...room.members.map((m) => ({ id: m.userId, seat: m.seat })),
      ...room.bots.map((b) => ({ id: `bot:${b.id}`, seat: b.seat })),
    ].sort((a, b) =>
      a.id === room.hostId ? -1 : b.id === room.hostId ? 1 : a.seat - b.seat,
    );
    const agents: AgentMap = Object.fromEntries(
      room.bots.map((b, index) => [
        `bot:${b.id}`,
        {
          config: botConfigSchema.parse(b.config),
          identity: {
            userId: `bot:${b.id}`,
            displayName: b.name,
            username: null,
            kind: "bot",
            difficulty: botConfigSchema.parse(b.config).difficulty,
            personality: botConfigSchema.parse(b.config).personality,
            avatar: b.seat,
          },
          seed: randomInt(0x100000000),
        },
      ]),
    );
    const g = startGame(
      seats.map((s) => s.id),
      room.rules as unknown as Rules,
      randomInt,
      Date.now(),
    );
    const match = await tx.match.create({
      data: {
        roomId,
        kind: room.bots.length
          ? room.members.length === 1
            ? "solo"
            : "mixed"
          : "human",
        rules: room.rules as Prisma.InputJsonValue,
        previousId: rematch ? room.activeMatchId : undefined,
        snapshot: {
          create: {
            state: json(g),
            version: g.version,
            botState: json(observeAgents(g, agents)),
          },
        },
        participants: {
          create: seats.map((s) => ({
            userId: s.id,
            ...(agents[s.id]
              ? {
                  identity: json(agents[s.id].identity),
                  botConfig: json(agents[s.id].config),
                }
              : {}),
          })),
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
    if (room.soloPausedAt) return false;
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
      delete next.activeAbility;
      next.bonusQueue = [];
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

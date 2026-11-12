import { rateLimit } from "express-rate-limit";
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { randomBytes, createHash, randomInt } from "node:crypto";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import {
  customRules,
  presets,
  rulesSchema,
  botSeatSchema,
  botConfigSchema,
  botPresets,
  decide,
  botObservation,
  playerView,
  type Game,
} from "@cabo/shared";
import { auth } from "./auth.js";
import { db, json } from "./db.js";
import { check, locked, member, roomView, startMatch } from "./game-service.js";
import { blocked, requestFriend, respondFriend, blockUser } from "./social.js";
import { notify } from "./notifications.js";
import { saveState } from "./game-service.js";
import type { AgentMap } from "./bot-state.js";
import { identities, publishIdentity } from "./identity.js";
import { config } from "./config.js";
export const api = Router();
export const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const idSchema = z.string().min(1).max(100);
export type Publish = (roomId: string) => Promise<void>;
let publish: Publish = async () => {};
export function setPublisher(fn: Publish) {
  publish = fn;
}
api.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    check(session, "UNAUTHENTICATED", 401);
    res.locals.userId = session.user.id;
    next();
  } catch (e) {
    next(e);
  }
});
const uid = (res: Response) => res.locals.userId as string;
const param = (req: Request, name = "id") => idSchema.parse(req.params[name]);
api.use(
  "/friends/requests",
  rateLimit({
    windowMs: 60000,
    limit: 20,
    keyGenerator: (_req, res) => uid(res),
    handler: (_req, res) => res.status(429).json({ error: "RATE_LIMIT" }),
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
api.get("/me", async (_req, res) =>
  res.json(
    await db.user.findUnique({
      where: { id: uid(res) },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        image: true,
        profile: true,
      },
    }),
  ),
);
api.put("/profile", async (req, res) => {
  const v = z
    .object({
      username: z.string().regex(/^[a-z0-9_]{3,24}$/),
      displayName: z.string().trim().min(1).max(40),
      presenceVisible: z.boolean().default(true),
    })
    .parse(req.body);
  const profile = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('cabo-profile-username-allocation'))`;
    const owner = await tx.profile.findUnique({
      where: { username: v.username },
    });
    check(!owner || owner.userId === uid(res), "USERNAME_TAKEN", 409);
    return tx.profile.upsert({
      where: { userId: uid(res) },
      create: { userId: uid(res), ...v, online: true },
      update: { ...v, online: true, lastSeen: new Date() },
    });
  });
  await publishIdentity(uid(res));
  res.json(profile);
});
api.get("/users", async (req, res) => {
  const q = z.string().min(2).max(24).parse(req.query.q);
  const blocks = await db.socialEdge.findMany({
    where: { kind: "block", OR: [{ fromId: uid(res) }, { toId: uid(res) }] },
  });
  const excluded = blocks.flatMap((b) => [b.fromId, b.toId]);
  res.json(
    await db.profile.findMany({
      where: {
        username: { contains: q.toLowerCase() },
        userId: { notIn: [uid(res), ...excluded] },
      },
      select: { userId: true, username: true, displayName: true },
      take: 20,
    }),
  );
});
api.get("/friends", async (_req, res) => {
  const edges = await db.socialEdge.findMany({
    where: {
      OR: [{ fromId: uid(res) }, { toId: uid(res) }],
      kind: { in: ["friend", "request", "block"] },
    },
  });
  const ids = [...new Set(edges.flatMap((e) => [e.fromId, e.toId]))];
  const rows = await db.profile.findMany({ where: { userId: { in: ids } } });
  const playing = await db.roomMember.findMany({
    where: { userId: { in: ids }, room: { status: "playing" } },
  });
  const profiles = rows.map(({ online, lastSeen, ...p }) => ({
    ...p,
    status:
      p.presenceVisible && online
        ? playing.some((m) => m.userId === p.userId)
          ? "In a Game"
          : "Online"
        : "Offline",
  }));
  res.json({ edges, profiles });
});
api.post("/friends/requests", async (req, res) => {
  const to = idSchema.parse(req.body.userId);
  res.json(await requestFriend(uid(res), to));
  void notify(
    to,
    "friend_request",
    "You have a new friend request.",
    undefined,
    uid(res),
  ).catch(() => {});
});
api.post("/friends/requests/:id", async (req, res) => {
  await respondFriend(uid(res), param(req), z.boolean().parse(req.body.accept));
  res.json({ ok: true });
});
api.delete("/friends/:id", async (req, res) => {
  const other = param(req);
  await db.socialEdge.deleteMany({
    where: {
      kind: { in: ["friend", "request"] },
      OR: [
        { fromId: uid(res), toId: other },
        { fromId: other, toId: uid(res) },
      ],
    },
  });
  res.json({ ok: true });
});
api.post("/friends/:id/block", async (req, res) => {
  await blockUser(uid(res), param(req));
  res.json({ ok: true });
});
api.delete("/friends/:id/block", async (req, res) => {
  await db.socialEdge.deleteMany({
    where: { fromId: uid(res), toId: param(req), kind: "block" },
  });
  res.json({ ok: true });
});
api.get("/rules", async (_req, res) =>
  res.json({
    builtIn: presets,
    saved: (
      await db.rulePreset.findMany({
        where: { userId: uid(res) },
        include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
      })
    ).map((p) => ({
      ...p,
      versions: p.versions.map((v) => ({
        ...v,
        rules: rulesSchema.parse(v.rules),
      })),
    })),
  }),
);
api.post("/rules", async (req, res) => {
  const rules = rulesSchema.parse(req.body);
  res.json(
    await db.rulePreset.create({
      data: {
        userId: uid(res),
        name: rules.name,
        versions: { create: { rules: json(rules) } },
      },
    }),
  );
});
api.put("/rules/:id", async (req, res) => {
  const rules = rulesSchema.parse(req.body);
  const preset = await db.rulePreset.findUnique({ where: { id: param(req) } });
  check(preset?.userId === uid(res), "NOT_FOUND", 404);
  res.json(
    await db.rulePreset.update({
      where: { id: preset.id },
      data: { name: rules.name, versions: { create: { rules: json(rules) } } },
    }),
  );
});
api.delete("/rules/:id", async (req, res) => {
  await db.rulePreset.deleteMany({
    where: { id: param(req), userId: uid(res) },
  });
  res.json({ ok: true });
});
api.get("/rooms", async (_req, res) =>
  res.json(
    await db.room.findMany({
      where: { members: { some: { userId: uid(res) } } },
      select: { id: true, code: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ),
);
api.post("/rooms", async (req, res) => {
  const rules = rulesSchema.parse(req.body.rules || customRules);
  const code = Array.from(
    { length: 6 },
    () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(32)],
  ).join("");
  const room = await db.room.create({
    data: {
      code,
      hostId: uid(res),
      rules: json(rules),
      members: { create: { userId: uid(res), seat: 0 } },
    },
  });
  res.json({ id: room.id, code: room.code });
});
api.post("/rooms/solo", async (req, res) => {
  const input = z
    .object({
      rules: rulesSchema,
      bots: z.array(botSeatSchema).min(1).max(4),
      options: z.object({
        fast: z.boolean(),
        practice: z.boolean(),
        animationSpeed: z.number().min(0.5).max(2),
      }),
    })
    .parse(req.body);
  check(
    input.bots.length + 1 >= input.rules.minPlayers &&
      input.bots.length + 1 <= input.rules.maxPlayers,
    "PLAYER_COUNT",
  );
  const code = Array.from(
    { length: 6 },
    () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(32)],
  ).join("");
  const room = await db.room.create({
    data: {
      code,
      hostId: uid(res),
      rules: json(input.rules),
      botOptions: json(input.options),
      members: { create: { userId: uid(res), seat: 0 } },
      bots: {
        create: input.bots.map((b, i) => ({
          seat: i + 1,
          name: b.name,
          config: json(b.config),
        })),
      },
    },
  });
  res.json({ id: room.id, code });
});
api.post("/rooms/join", async (req, res) => {
  const input = z
    .object({
      code: z.string().max(100).optional(),
      token: z.string().max(100).optional(),
    })
    .refine((v) => !!v.code !== !!v.token)
    .parse(req.body);
  let roomId: string;
  if (input.token) {
    const invite = await db.invitation.findUnique({
      where: { tokenHash: hash(input.token) },
    });
    check(
      invite && !invite.revoked && invite.expiresAt > new Date(),
      "INVITE_EXPIRED",
      410,
    );
    check(!invite.toId || invite.toId === uid(res), "INVITE_NOT_FOR_YOU", 403);
    roomId = invite.roomId;
  } else {
    const room = await db.room.findUnique({
      where: { code: input.code!.toUpperCase() },
    });
    check(room, "ROOM_NOT_FOUND", 404);
    roomId = room.id;
  }
  const newlyJoined = await locked(roomId, async (tx) => {
    const room = await tx.room.findUniqueOrThrow({
      where: { id: roomId },
      include: { members: true, bots: true },
    });
    if (input.token) {
      const current = await tx.invitation.findUnique({
        where: { tokenHash: hash(input.token) },
      });
      check(
        current && !current.revoked && current.expiresAt > new Date(),
        "INVITE_EXPIRED",
        410,
      );
      check(
        !current.toId || current.toId === uid(res),
        "INVITE_NOT_FOR_YOU",
        403,
      );
    }
    const existing = room.members.some((m) => m.userId === uid(res));
    if (existing) return false;
    check(room.status === "lobby", "GAME_ALREADY_STARTED");
    check(!(room.botOptions as any).practice, "PRACTICE_SOLO_ONLY");
    check(
      room.hostId && !(await blocked(uid(res), room.hostId)),
      "NOT_AVAILABLE",
      403,
    );
    const rules = rulesSchema.parse(room.rules);
    check(
      room.members.length + room.bots.length < rules.maxPlayers,
      "ROOM_FULL",
    );
    const seat = Array.from({ length: 5 }, (_, i) => i).find(
      (i) =>
        !room.members.some((m) => m.seat === i) &&
        !room.bots.some((b) => b.seat === i),
    )!;
    await tx.roomMember.create({ data: { roomId, userId: uid(res), seat } });
    return true;
  });
  await publish(roomId);
  const joinedRoom = await db.room.findUnique({ where: { id: roomId } });
  if (newlyJoined && joinedRoom?.hostId && joinedRoom.hostId !== uid(res))
    void notify(
      joinedRoom.hostId,
      "invitation_accepted",
      "A player joined your table.",
      roomId,
      uid(res),
    ).catch(() => {});
  res.json({ id: roomId });
});
api.get("/bots/presets", async (_req, res) =>
  res.json({
    builtIn: botPresets,
    saved: await db.botPreset.findMany({ where: { userId: uid(res) } }),
  }),
);
api.post("/bots/presets", async (req, res) => {
  const name = z.string().trim().min(1).max(40).parse(req.body.name),
    config = botConfigSchema.parse(req.body.config);
  res.json(
    await db.botPreset.create({
      data: { userId: uid(res), name, config: json(config) },
    }),
  );
});
api.delete("/bots/presets/:id", async (req, res) => {
  await db.botPreset.deleteMany({
    where: { id: param(req), userId: uid(res) },
  });
  res.json({ ok: true });
});
api.post("/rooms/:id/bots", async (req, res) => {
  const roomId = param(req),
    input = botSeatSchema.parse(req.body);
  const bot = await locked(roomId, async (tx) => {
    const room = await tx.room.findUniqueOrThrow({
      where: { id: roomId },
      include: { members: true, bots: true },
    });
    check(room.hostId === uid(res), "HOST_ONLY", 403);
    check(
      room.status === "lobby" || room.status === "finished",
      "RULES_LOCKED",
    );
    const rules = rulesSchema.parse(room.rules);
    check(
      room.members.length + room.bots.length < rules.maxPlayers,
      "ROOM_FULL",
    );
    const seat = Array.from({ length: 5 }, (_, i) => i).find(
      (i) => ![...room.members, ...room.bots].some((m) => m.seat === i),
    )!;
    const added = await tx.roomBot.create({
      data: { roomId, seat, name: input.name, config: json(input.config) },
    });
    await tx.roomMember.updateMany({
      where: { roomId },
      data: { ready: false, rematch: false },
    });
    return added;
  });
  await publish(roomId);
  res.json(bot);
});
api.put("/rooms/:id/bots/:botId", async (req, res) => {
  const roomId = param(req),
    input = botSeatSchema.parse(req.body);
  await locked(roomId, async (tx) => {
    const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
    check(room.hostId === uid(res), "HOST_ONLY", 403);
    check(
      room.status === "lobby" || room.status === "finished",
      "RULES_LOCKED",
    );
    check(
      (
        await tx.roomBot.updateMany({
          where: { id: param(req, "botId"), roomId },
          data: { name: input.name, config: json(input.config) },
        })
      ).count,
      "NOT_FOUND",
      404,
    );
    await tx.roomMember.updateMany({
      where: { roomId },
      data: { ready: false, rematch: false },
    });
  });
  await publish(roomId);
  res.json({ ok: true });
});
api.delete("/rooms/:id/bots/:botId", async (req, res) => {
  const roomId = param(req);
  await locked(roomId, async (tx) => {
    const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
    check(room.hostId === uid(res), "HOST_ONLY", 403);
    check(
      room.status === "lobby" || room.status === "finished",
      "RULES_LOCKED",
    );
    await tx.roomBot.deleteMany({ where: { id: param(req, "botId"), roomId } });
    await tx.roomMember.updateMany({
      where: { roomId },
      data: { ready: false, rematch: false },
    });
  });
  await publish(roomId);
  res.json({ ok: true });
});
api.put("/rooms/:id/bot-options", async (req, res) => {
  const roomId = param(req),
    options = z
      .object({
        fast: z.boolean(),
        practice: z.boolean(),
        animationSpeed: z.number().min(0.5).max(2),
      })
      .parse(req.body);
  await locked(roomId, async (tx) => {
    const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
    check(room.hostId === uid(res), "HOST_ONLY", 403);
    const humans = await tx.roomMember.count({ where: { roomId } });
    check(!options.practice || humans === 1, "SOLO_ONLY");
    await tx.room.update({
      where: { id: roomId },
      data: { botOptions: json(options) },
    });
    if (options.fast && room.status === "playing" && room.activeMatchId) {
      const snapshot = await tx.gameSnapshot.findUniqueOrThrow({
          where: { matchId: room.activeMatchId },
        }),
        agents = snapshot.botState as unknown as AgentMap;
      for (const agent of Object.values(agents))
        if (agent.dueAt !== undefined)
          agent.dueAt = Math.min(agent.dueAt, Date.now() + 20);
      await tx.gameSnapshot.update({
        where: { matchId: room.activeMatchId },
        data: { botState: json(agents) },
      });
    }
  });
  await publish(roomId);
  res.json({ ok: true });
});
api.post("/rooms/:id/solo", async (req, res) => {
  const roomId = param(req),
    action = z
      .enum(["pause", "resume", "restart", "abandon", "lobby"])
      .parse(req.body.action);
  await locked(roomId, async (tx) => {
    const room = await tx.room.findUniqueOrThrow({
      where: { id: roomId },
      include: { members: true, bots: true },
    });
    check(room.hostId === uid(res), "HOST_ONLY", 403);
    check(room.members.length === 1 && room.bots.length > 0, "SOLO_ONLY");
    check(room.activeMatchId, "NO_MATCH");
    const snapshot = await tx.gameSnapshot.findUniqueOrThrow({
        where: { matchId: room.activeMatchId },
      }),
      g = snapshot.state as unknown as Game,
      now = Date.now();
    if (action === "pause") {
      check(room.status === "playing", "WRONG_ROOM_STATE");
      if (room.soloPausedAt) return;
      g.pausedAt ??= now;
      g.version++;
      await tx.room.update({
        where: { id: roomId },
        data: { soloPausedAt: new Date(now) },
      });
      await saveState(tx, room.activeMatchId, roomId, g);
    } else if (action === "resume") {
      check(room.soloPausedAt, "NOT_PAUSED");
      g.deadline += now - (g.pausedAt ?? now);
      delete g.pausedAt;
      g.version++;
      await tx.room.update({
        where: { id: roomId },
        data: { soloPausedAt: null },
      });
      await saveState(tx, room.activeMatchId, roomId, g);
    } else {
      check(
        action === "lobby"
          ? room.status === "finished"
          : room.status === "playing",
        "WRONG_ROOM_STATE",
      );
      if (room.status === "playing") {
        // Abandoned games are recorded as losses rather than farming solo wins through restart.
        g.phase = "matchOver";
        g.forfeit = [uid(res)];
        g.scores = [];
        g.version++;
        delete g.pausedAt;
        if (g.drawn) g.discard.push(g.drawn.card);
        delete g.drawn;
        delete g.reveal;
        delete g.activeAbility;
        g.bonusQueue = [];
        await saveState(tx, room.activeMatchId, roomId, g);
      }
      await tx.room.update({
        where: { id: roomId },
        data: {
          status: action === "abandon" ? "cancelled" : "lobby",
          activeMatchId: null,
          soloPausedAt: null,
        },
      });
      await tx.roomMember.updateMany({
        where: { roomId },
        data: { ready: false, rematch: false },
      });
    }
  });
  await publish(roomId);
  res.json({ ok: true });
});
api.get("/rooms/:id/practice", async (req, res) => {
  const roomId = param(req);
  await member(db, roomId, uid(res));
  const room = await db.room.findUniqueOrThrow({
    where: { id: roomId },
    include: { members: true, bots: true },
  });
  check(
    room.members.length === 1 &&
      room.bots.length > 0 &&
      (room.botOptions as any).practice,
    "PRACTICE_DISABLED",
    403,
  );
  check(room.activeMatchId, "NO_MATCH");
  const snap = await db.gameSnapshot.findUniqueOrThrow({
    where: { matchId: room.activeMatchId },
  });
  const g = snap.state as unknown as Game;
  // Stateless hints use only the human's current authorized view, never bot memories or hidden hands.
  const view = playerView(g, uid(res));
  const { remember } = await import("@cabo/shared");
  const memory = remember(
    view,
    uid(res),
    undefined,
    botPresets.master,
    () => 0.5,
  );
  const o = botObservation(view, uid(res), memory, Date.now());
  const d = decide(o, botPresets.master, () => 0.5);
  res.json({
    suggestion: d?.command,
    suggestionLabel: (() => {
      const a = d?.command;
      if (!a) return undefined;
      switch (a.type) {
        case "draw":
          return a.source === "deck"
            ? "Consider drawing from the deck."
            : "Consider taking the visible discard.";
        case "replace":
          return `Consider replacing your card positions ${a.indices.map((i) => i + 1).join(", ")}.`;
        case "cabo":
          return "Consider calling Cabo.";
        case "discard":
          return "Consider discarding this draw.";
        case "activate":
          return "Consider using this card’s ability.";
        case "inspect":
          return `Inspect ${g.rules.initialPeek} starting cards.`;
        case "ready":
          return "Turn your inspected cards over when ready.";
        case "target":
          return `Consider card ${a.index + 1} ${a.owner === uid(res) ? "in your hand" : `belonging to ${room.bots.find((b) => `bot:${b.id}` === a.owner)?.name ?? "your opponent"}`}${a.ownIndex !== undefined ? ` and your card ${a.ownIndex + 1}` : ""}.`;
        case "resolveSwap":
          return a.ownIndex === undefined
            ? "Keep both hands as they are."
            : `Consider swapping your card ${a.ownIndex + 1}.`;
        case "finishAbility":
          return "Finish your private peek.";
        case "nextRound":
          return "Deal the next round when ready.";
        case "finishMatch":
          return "Finish this match when ready.";
      }
    })(),
    hint:
      d?.reason ??
      "Use private peeks to remember cards. Public swaps move physical cards; invalidate old positions when replacement is uncertain.",
    roundReview: ["roundOver", "matchOver"].includes(g.phase)
      ? g.scores.map((s) => ({
          id: s.id,
          raw: s.raw,
          penalty: s.penalty,
          tip: s.penalty
            ? "A failed Cabo call added a penalty. Consider uncertain cards before calling."
            : "Compare raw hand points with the revealed lowest hand.",
        }))
      : undefined,
  });
});
api.get("/rooms/:id", async (req, res) =>
  res.json(await roomView(param(req), uid(res))),
);
api.put("/rooms/:id/rules", async (req, res) => {
  const roomId = param(req),
    rules = rulesSchema.parse(req.body);
  await locked(roomId, async (tx) => {
    const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
    check(room.hostId === uid(res), "HOST_ONLY", 403);
    check(room.status === "lobby", "RULES_LOCKED");
    const count = await tx.roomMember.count({ where: { roomId } });
    check(
      count + (await tx.roomBot.count({ where: { roomId } })) <=
        rules.maxPlayers,
      "TOO_MANY_MEMBERS",
    );
    await tx.room.update({
      where: { id: roomId },
      data: { rules: json(rules) },
    });
    await tx.roomMember.updateMany({
      where: { roomId },
      data: { ready: false },
    });
  });
  await publish(roomId);
  res.json({ ok: true });
});
api.post("/rooms/:id/ready", async (req, res) => {
  const roomId = param(req);
  await locked(roomId, async (tx) => {
    const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
    check(
      room.status === "lobby" || room.status === "finished",
      "WRONG_ROOM_STATE",
    );
    await member(tx, roomId, uid(res));
    const ready = z.boolean().parse(req.body.ready);
    await tx.roomMember.update({
      where: { roomId_userId: { roomId, userId: uid(res) } },
      data: room.status === "finished" ? { rematch: ready } : { ready },
    });
  });
  await publish(roomId);
  if (req.body.ready === true) {
    const room = await db.room.findUniqueOrThrow({
      where: { id: roomId },
      include: { members: true },
    });
    const targets =
      room.status === "finished"
        ? room.members.filter((m) => m.userId !== uid(res)).map((m) => m.userId)
        : room.hostId && room.hostId !== uid(res)
          ? [room.hostId]
          : [];
    for (const target of targets)
      void notify(
        target,
        room.status === "finished" ? "rematch_request" : "lobby_ready",
        room.status === "finished"
          ? "A player would like to play again."
          : "A player is ready at your table.",
        roomId,
        uid(res),
      ).catch(() => {});
  }

  res.json({ ok: true });
});
api.post("/rooms/:id/start", async (req, res) => {
  const roomId = param(req);
  await startMatch(roomId, uid(res), req.body.rematch === true);
  await publish(roomId);
  res.json({ ok: true });
});
api.delete("/rooms/:id/membership", async (req, res) => {
  const roomId = param(req);
  await locked(roomId, async (tx) => {
    const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
    check(room.status !== "playing", "MATCH_ACTIVE");
    await tx.roomMember.deleteMany({ where: { roomId, userId: uid(res) } });
    if (room.hostId === uid(res)) {
      const next = await tx.roomMember.findFirst({
        where: { roomId },
        orderBy: { seat: "asc" },
      });
      await tx.room.update({
        where: { id: roomId },
        data: next ? { hostId: next.userId } : { status: "cancelled" },
      });
    }
  });
  await publish(roomId);
  res.json({ ok: true });
});
api.post("/rooms/:id/invites", async (req, res) => {
  const roomId = param(req);
  const toId = req.body.userId ? idSchema.parse(req.body.userId) : undefined;
  const token = randomBytes(32).toString("base64url");
  const invite = await locked(roomId, async (tx) => {
    await member(tx, roomId, uid(res));
    const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
    check(room.status === "lobby", "GAME_ALREADY_STARTED");
    if (toId) {
      check(!(await blocked(uid(res), toId)), "NOT_AVAILABLE", 403);
      check(
        await tx.socialEdge.findUnique({
          where: {
            fromId_toId_kind: { fromId: uid(res), toId, kind: "friend" },
          },
        }),
        "FRIENDS_ONLY",
        403,
      );
      check(
        !(await tx.invitation.findFirst({
          where: {
            roomId,
            toId,
            revoked: false,
            expiresAt: { gt: new Date() },
          },
        })),
        "INVITATION_EXISTS",
        409,
      );
    }
    return tx.invitation.create({
      data: {
        roomId,
        fromId: uid(res),
        toId,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
  });
  if (toId)
    void notify(
      toId,
      "challenge",
      "You have been invited to a CABO game.",
      roomId,
      uid(res),
    ).catch(() => {});
  res.json({
    id: invite.id,
    url: `${config.APP_DOMAIN}/join/${token}`,
    token,
    expiresAt: invite.expiresAt,
  });
});
api.get("/invites", async (_req, res) =>
  res.json(
    await db.invitation.findMany({
      where: {
        toId: uid(res),
        revoked: false,
        expiresAt: { gt: new Date() },
        room: { status: "lobby" },
      },
      select: {
        id: true,
        roomId: true,
        fromId: true,
        from: {
          select: {
            id: true,
            name: true,
            profile: { select: { username: true, displayName: true } },
          },
        },
        expiresAt: true,
        room: { select: { code: true } },
      },
    }),
  ),
);
api.post("/invites/:id/respond", async (req, res) => {
  const invite = await db.invitation.findUnique({ where: { id: param(req) } });
  check(invite?.toId === uid(res), "NOT_FOUND", 404);
  await db.invitation.update({
    where: { id: invite.id },
    data: { revoked: true },
  });
  res.json({ ok: true });
});
api.delete("/invites/:id", async (req, res) => {
  const invite = await db.invitation.findUnique({
    where: { id: param(req) },
    include: { room: true },
  });
  check(
    invite && (invite.fromId === uid(res) || invite.room.hostId === uid(res)),
    "NOT_FOUND",
    404,
  );
  await db.invitation.update({
    where: { id: invite.id },
    data: { revoked: true },
  });
  res.json({ ok: true });
});
api.get("/matches", async (_req, res) => {
  const rows = await db.matchParticipant.findMany({
    where: { userId: uid(res), match: { completedAt: { not: null } } },
    include: {
      match: {
        include: {
          rounds: true,
          participants: {
            select: { userId: true, identity: true, botConfig: true },
          },
        },
      },
    },
    orderBy: { match: { createdAt: "desc" } },
    take: 50,
  });
  const people = await identities(
    rows.flatMap((r) => r.match.participants.map((p) => p.userId)),
  );
  res.json(
    rows.map((r) => ({
      ...r,
      match: {
        ...r.match,
        identities: {
          ...people,
          ...Object.fromEntries(
            r.match.participants
              .filter((p) => p.identity)
              .map((p) => [p.userId, p.identity]),
          ),
        },
      },
    })),
  );
});
api.get("/stats", async (_req, res) => {
  const rows = await db.matchParticipant.findMany({
    where: { userId: uid(res), match: { completedAt: { not: null } } },
    include: { match: { include: { rounds: true, participants: true } } },
    orderBy: { match: { completedAt: "asc" } },
  });
  function summary(matches: typeof rows) {
    const wins = matches.filter((m) => m.winner).length,
      raw = matches.flatMap((m) =>
        m.match.rounds.flatMap((r) =>
          (r.scores as unknown as { id: string; raw: number }[])
            .filter((s) => s.id === uid(res))
            .map((s) => s.raw),
        ),
      );
    return {
      games: matches.length,
      wins,
      losses: matches.length - wins,
      winRate: matches.length ? wins / matches.length : 0,
      averageHand: raw.length ? raw.reduce((a, b) => a + b, 0) / raw.length : 0,
      bestHand: raw.length ? Math.min(...raw) : null,
    };
  }
  const human = rows.filter((m) => m.match.kind === "human"),
    solo = rows.filter((m) => m.match.kind === "solo"),
    mixed = rows.filter((m) => m.match.kind === "mixed");
  const calls = await db.gameAction.findMany({
    where: {
      userId: uid(res),
      type: "cabo",
      match: { kind: "solo", completedAt: { not: null } },
    },
  });
  const successful = calls.filter((a) => {
    const round = solo
      .find((m) => m.matchId === a.matchId)
      ?.match.rounds.find((r) => r.number === a.round);
    const scores = (round?.scores ?? []) as unknown as {
      id: string;
      raw: number;
      penalty: number;
      winner: boolean;
    }[];
    const me = scores.find((s) => s.id === uid(res));
    return me?.winner === true;
  }).length;
  let streak = 0,
    longest = 0;
  for (const m of solo) {
    streak = m.winner ? streak + 1 : 0;
    longest = Math.max(longest, streak);
  }
  const byDifficulty = Object.fromEntries(
    [...Object.keys(botPresets), "custom"].map((key) => [
      key,
      summary(
        solo.filter((m) =>
          m.match.participants.some(
            (p) => (p.botConfig as any)?.difficulty === key,
          ),
        ),
      ),
    ]),
  );
  const ruleNames = [
    ...new Set(solo.map((m) => (m.match.rules as any).name as string)),
  ];
  res.json({
    ...summary(human),
    solo: {
      ...summary(solo),
      caboCalls: calls.length,
      successfulCaboCalls: successful,
      longestStreak: longest,
      byDifficulty,
      byRules: Object.fromEntries(
        ruleNames.map((name) => [
          name,
          summary(solo.filter((m) => (m.match.rules as any).name === name)),
        ]),
      ),
    },
    mixed: summary(mixed),
  });
});
api.delete("/notifications/token", async (req, res) => {
  const token = z.string().max(200).parse(req.body.token);
  await db.pushToken.deleteMany({ where: { token, userId: uid(res) } });
  res.json({ ok: true });
});
api.get("/notifications", async (_req, res) =>
  res.json(
    await db.notification.findMany({
      where: { userId: uid(res) },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            profile: { select: { username: true, displayName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ),
);
api.post("/notifications/read", async (_req, res) => {
  await db.notification.updateMany({
    where: { userId: uid(res) },
    data: { read: true },
  });
  res.json({ ok: true });
});
api.post("/notifications/token", async (req, res) => {
  const token = z
    .string()
    .regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/)
    .parse(req.body.token);
  await db.pushToken.upsert({
    where: { token },
    create: { token, userId: uid(res) },
    update: { userId: uid(res) },
  });
  res.json({ ok: true });
});

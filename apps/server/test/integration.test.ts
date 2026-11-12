import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { io, type Socket } from "socket.io-client";
import { PrismaClient } from "@prisma/client";
import {
  createDeck,
  customRules,
  type Game,
  type PlayerView,
} from "@cabo/shared";
const enabled = !!process.env.TEST_DATABASE_URL;
const base = "http://127.0.0.1:3097";
let server: ChildProcess;
const clients: Socket[] = [];
let cookies: string[] = [],
  users: string[] = [],
  roomId = "",
  code = "";
async function http(path: string, who = 0, body?: unknown, method?: string) {
  const r = await fetch(base + path, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      ...(cookies[who] ? { cookie: cookies[who] } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  };
}
async function sync(i = 0) {
  return (await http(`/api/rooms/${roomId}`, i)).data;
}
async function cmd(
  who: number,
  command: unknown,
  version: number,
  actionId = randomUUID(),
) {
  return new Promise<any>((resolve, reject) =>
    clients[who]
      .timeout(5000)
      .emit(
        "game:command",
        { roomId, actionId, version, command },
        (err: any, r: any) => (err ? reject(err) : resolve(r)),
      ),
  );
}
async function startBackend() {
  server = spawn(
    process.execPath,
    process.env.TEST_SERVER_ENTRY
      ? [process.env.TEST_SERVER_ENTRY]
      : ["--import", "tsx", "apps/server/src/index.ts"],
    {
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: "3097",
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        DIRECT_DATABASE_URL: process.env.TEST_DATABASE_URL,
        BETTER_AUTH_SECRET: "test-only-secret-with-more-than-32-characters",
        BETTER_AUTH_URL: base,
        APP_DOMAIN: base,
        ALLOWED_ORIGINS: base,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  server.stderr?.on("data", (d) => (logs += d));
  server.stdout?.on("data", (d) => (logs += d));
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${base}/health`);
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
    if (i === 99) throw new Error(logs);
  }
}
describe.skipIf(!enabled)(
  "real PostgreSQL + HTTP + multi-client Socket.IO",
  () => {
    beforeAll(async () => {
      await startBackend();
      for (let i = 0; i < 3; i++) {
        const result = await http("/api/auth/sign-up/email", i, {
          name: `Player ${i}`,
          email: `${randomUUID()}@test.cabo`,
          password: "correct horse battery staple",
        });
        expect(result.status, JSON.stringify(result.data)).toBe(200);
        cookies[i] = result.cookie;
        users[i] = result.data.user.id;
        const s = io(base, {
          transports: ["websocket"],
          auth: { cookie: cookies[i] },
          forceNew: true,
        });
        await new Promise<void>((resolve, reject) => {
          s.on("connect", resolve);
          s.on("connect_error", reject);
        });
        clients.push(s);
        const automatic = (await http("/api/me", i)).data.profile;
        expect(automatic.username).toMatch(/^player_[0-2][0-9]*$/);
        expect(automatic.displayName).toBe(`Player ${i}`);
        const profile = await http(
          "/api/profile",
          i,
          {
            username: `u_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
            displayName: `Player ${i}`,
          },
          "PUT",
        );
        expect(profile.status).toBe(200);
      }
    }, 20000);
    afterAll(async () => {
      clients.forEach((s) => s.disconnect());
      server?.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 300));
    });
    it("creates room, joins a nonfriend with hashed invite, rejects stranger state", async () => {
      const r = await http("/api/rooms", 0, {
        rules: { ...customRules, memorySeconds: 0, disconnectSeconds: 10 },
      });
      expect(r.status).toBe(200);
      roomId = r.data.id;
      code = r.data.code;
      expect((await http(`/api/rooms/${roomId}`, 2)).status).toBe(403);
      const invite = await http(`/api/rooms/${roomId}/invites`, 0, {});
      expect(invite.data.url).toContain("/join/");
      expect((await fetch(invite.data.url)).status).toBe(200);
      const joined = await http("/api/rooms/join", 1, {
        token: invite.data.token,
      });
      expect(joined.data.id).toBe(roomId);
      await http("/api/rooms/join", 2, { code });
      await http(`/api/invites/${invite.data.id}`, 0, undefined, "DELETE");
      expect(
        (await http("/api/rooms/join", 2, { token: invite.data.token })).status,
      ).toBe(410);
    });
    it("handles friend requests, duplicates, accepting, challenge and declining", async () => {
      const request = await http("/api/friends/requests", 0, {
        userId: users[1],
      });
      expect(request.status).toBe(200);
      expect(
        (await http("/api/friends/requests", 0, { userId: users[1] })).status,
      ).toBe(409);
      expect(
        (
          await http(`/api/friends/requests/${request.data.id}`, 2, {
            accept: true,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await http(`/api/friends/requests/${request.data.id}`, 1, {
            accept: true,
          })
        ).status,
      ).toBe(200);
      const challenge = await http(`/api/rooms/${roomId}/invites`, 0, {
        userId: users[1],
      });
      expect(challenge.status).toBe(200);
      expect((await http("/api/invites", 1)).data.length).toBeGreaterThan(0);
      expect(
        (await http(`/api/invites/${challenge.data.id}/respond`, 1, {})).status,
      ).toBe(200);
    });
    it("starts only after readiness and locks rules", async () => {
      expect((await http(`/api/rooms/${roomId}/start`, 0, {})).status).toBe(
        400,
      );
      for (let i = 0; i < 3; i++)
        await http(`/api/rooms/${roomId}/ready`, i, { ready: true });
      expect((await http(`/api/rooms/${roomId}/start`, 0, {})).status).toBe(
        200,
      );
      expect(
        (await http(`/api/rooms/${roomId}/rules`, 0, customRules, "PUT"))
          .status,
      ).toBe(400);
    });
    it("rejects out-of-turn, races, stale versions and replays without leaking draws", async () => {
      for (let i = 0; i < 3; i++) {
        let state = (await sync(i)).game;
        expect(
          (await cmd(i, { type: "inspect", indices: [0, 1] }, state.version))
            .ok,
        ).toBe(true);
        state = (await sync(i)).game;
        expect((await cmd(i, { type: "ready" }, state.version)).ok).toBe(true);
      }
      // Once all players are ready the memory phase ends.
      for (let i = 0; i < 30; i++) {
        const r = await sync();
        if (r.game.phase === "turn") break;
        await new Promise((r) => setTimeout(r, 100));
      }
      const g = (await sync()).game as PlayerView;
      expect(
        g.players.every((p) => p.cards.every((s) => s.card === undefined)),
      ).toBe(true);
      expect(
        (await cmd(1, { type: "draw", source: "deck" }, g.version)).ok,
      ).toBe(false);
      const actionId = randomUUID();
      const [a, b] = await Promise.all([
        cmd(0, { type: "draw", source: "deck" }, g.version, actionId),
        cmd(0, { type: "draw", source: "deck" }, g.version),
      ]);
      expect([a, b].filter((r) => r.ok)).toHaveLength(1);
      const current = (await sync()).game;
      const replay = await cmd(
        0,
        { type: "draw", source: "deck" },
        g.version,
        actionId,
      );
      if (a.ok) {
        expect(replay.ok).toBe(true);
        expect(replay.data.version).toBe(current.version);
      }
      const opponent = (await sync(1)).game;
      expect(opponent.drawn).toBeUndefined();
      expect(opponent).not.toHaveProperty("deck");
      expect((await cmd(0, { type: "discard" }, g.version)).ok).toBe(false);
      expect((await cmd(0, { type: "discard" }, current.version)).ok).toBe(
        true,
      );
    });
    it("restores persisted private state after socket reconnect and completes rematch", async () => {
      clients[1].disconnect();
      await new Promise((r) => setTimeout(r, 100));
      clients[1].connect();
      await new Promise<void>((r) => clients[1].once("connect", r));
      let g = (await sync(1)).game;
      expect(g.turn).toBe(users[1]);
      expect((await cmd(1, { type: "cabo" }, g.version)).ok).toBe(true);
      for (const i of [2, 0]) {
        g = (await sync(i)).game;
        const d = await cmd(i, { type: "draw", source: "deck" }, g.version);
        expect(d.ok).toBe(true);
        expect((await cmd(i, { type: "discard" }, d.data.version)).ok).toBe(
          true,
        );
      }
      const result = await sync();
      expect(result.game.phase).toBe("matchOver");
      expect(result.game.scores).toHaveLength(3);
      expect(
        result.game.players.every((p: any) =>
          p.cards.every((s: any) => s.card),
        ),
      ).toBe(true);
      expect(
        (await http(`/api/rooms/${roomId}/start`, 0, { rematch: true })).status,
      ).toBe(400);
      for (let i = 0; i < 3; i++)
        await http(`/api/rooms/${roomId}/ready`, i, { ready: true });
      expect(
        (await http(`/api/rooms/${roomId}/start`, 0, { rematch: true })).status,
      ).toBe(200);
      const next = await sync();
      expect(next.activeMatchId).not.toBe(result.activeMatchId);
      expect(next.game.history).toHaveLength(0);
      expect(Object.values(next.game.totals)).toEqual([0, 0, 0]);
      expect((await http("/api/stats", 0)).data.games).toBeGreaterThan(0);
    });
    it("recovers exactly the same snapshot after a process restart", async () => {
      const before = await sync();
      for (const c of clients) c.disconnect();
      const exited = new Promise((resolve) => server.once("exit", resolve));
      server.kill("SIGTERM");
      await exited;
      await startBackend();
      for (const c of clients) {
        c.connect();
        await new Promise<void>((resolve, reject) => {
          c.once("connect", resolve);
          c.once("connect_error", reject);
        });
      }
      const after = await sync();
      expect(after.activeMatchId).toBe(before.activeMatchId);
      expect(after.game).toEqual(before.game);
    }, 15000);
    it("provisions unique readable usernames and broadcasts identity changes", async () => {
      const database = new PrismaClient({
        datasourceUrl: process.env.TEST_DATABASE_URL,
      });
      try {
        await database.$transaction(async (tx) => {
          const before = await tx.profile.findUniqueOrThrow({
            where: { userId: users[0] },
          });
          await tx.profile.delete({ where: { userId: users[0] } });
          await tx.$executeRaw`SELECT cabo_ensure_profile(${users[0]})`;
          const backfilled = await tx.profile.findUniqueOrThrow({
            where: { userId: users[0] },
          });
          expect(backfilled.username).toMatch(/^[a-z0-9_]{3,24}$/);
          await tx.profile.update({
            where: { userId: users[0] },
            data: { username: before.username },
          });
          await tx.$executeRaw`SELECT cabo_ensure_profile(${users[0]})`;
          expect(
            (
              await tx.profile.findUniqueOrThrow({
                where: { userId: users[0] },
              })
            ).username,
          ).toBe(before.username);
        });
      } finally {
        await database.$disconnect();
      }
      const me = (await http("/api/me")).data;
      expect(me.profile.username).toMatch(/^[a-z0-9_]{3,24}$/);
      const other = (await http("/api/me", 1)).data;
      expect(
        (
          await http(
            "/api/profile",
            1,
            { username: me.profile.username, displayName: "Duplicate" },
            "PUT",
          )
        ).status,
      ).toBe(409);
      const seen = new Promise<any>((resolve) =>
        clients[1].once("profile:updated", resolve),
      );
      const updated = await http(
        "/api/profile",
        0,
        { username: me.profile.username, displayName: "Alex Updated" },
        "PUT",
      );
      expect(updated.status).toBe(200);
      expect((await seen).username).toBe(me.profile.username);
      const view = await sync(1);
      expect(view.game.identities[users[0]].displayName).toBe("Alex Updated");
      expect(view.members[0].username).toBe(me.profile.username);
      expect(
        (await http("/api/users?q=" + me.profile.username, 1)).data.some(
          (p: any) => p.username === me.profile.username,
        ),
      ).toBe(true);
      expect(other.profile.username).not.toBe(me.profile.username);
    });
    it("broadcasts one private-safe swap to both players, persists pending bonus through reconnect and restart", async () => {
      // Only this local test process can seed a deterministic persisted hand. No production API accepts cards.
      const db = new PrismaClient({
        datasourceUrl: process.env.TEST_DATABASE_URL,
      });
      try {
        const current = await sync();
        const snap = await db.gameSnapshot.findUniqueOrThrow({
          where: { matchId: current.activeMatchId },
        });
        const state = snap.state as unknown as Game;
        const card = (key: string) =>
          createDeck(customRules).find((c) => c.key === key)!;
        state.phase = "drawn";
        state.turn = 0;
        state.deadline = Date.now() + 60000;
        state.drawn = { source: "deck", card: card("9-clubs") };
        state.players[0].hand[0] = card("J-clubs");
        state.players[1].hand[0] = card("2-clubs");
        state.rules.activateSwappedOutAbilities = true;
        await db.gameSnapshot.update({
          where: { matchId: current.activeMatchId },
          data: { state: JSON.parse(JSON.stringify(state)) },
        });
        const events: any[][] = [[], [], []];
        clients.forEach((c, i) => c.on("game:swap", (e) => events[i].push(e)));
        const activated = await cmd(0, { type: "activate" }, state.version);
        expect(activated.ok).toBe(true);
        const actionId = randomUUID();
        const command = {
          type: "target",
          owner: users[1],
          index: 0,
          ownIndex: 0,
        };
        const swapped = await cmd(0, command, activated.data.version, actionId);
        expect(swapped.ok).toBe(true);
        expect(swapped.data.activeAbility).toMatchObject({
          ability: "peekOpponent",
          origin: "bonus",
        });
        for (let n = 0; n < 40 && events.some((e) => e.length === 0); n++)
          await new Promise((r) => setTimeout(r, 50));
        for (const list of events) {
          expect(list).toHaveLength(1);
          expect(list[0].event).toMatchObject({
            actorId: users[0],
            opponentId: users[1],
            actorIndex: 0,
            opponentIndex: 0,
          });
          expect(JSON.stringify(list[0])).not.toMatch(
            /J-clubs|2-clubs|peekOpponent|points|rank/,
          );
          expect(list[0].actor.username).toBeTruthy();
        }
        const privateView = (await sync(1)).game;
        expect(privateView.activeAbility).toBeUndefined();
        expect(privateView.drawn).toBeUndefined();
        expect(
          privateView.players.every((p: any) =>
            p.cards.every((s: any) => !s.card),
          ),
        ).toBe(true);
        expect(
          (await cmd(0, command, activated.data.version, actionId)).ok,
        ).toBe(true);
        await new Promise((r) => setTimeout(r, 200));
        expect(events.map((e) => e.length)).toEqual([1, 1, 1]);
        clients[0].disconnect();
        clients[0].connect();
        await new Promise<void>((r) => clients[0].once("connect", r));
        expect((await sync()).game.activeAbility).toEqual(
          swapped.data.activeAbility,
        );
        clients.forEach((c) => c.disconnect());
        const exited = new Promise((r) => server.once("exit", r));
        server.kill("SIGTERM");
        await exited;
        await startBackend();
        for (const c of clients) {
          c.connect();
          await new Promise<void>((r, j) => {
            c.once("connect", r);
            c.once("connect_error", j);
          });
        }
        const recovered = (await sync()).game;
        expect(recovered.swapHistory).toEqual(swapped.data.swapHistory);
        expect(recovered.activeAbility).toEqual(swapped.data.activeAbility);
        const peek = await cmd(
          0,
          { type: "target", owner: users[2], index: 0 },
          recovered.version,
        );
        expect(peek.ok).toBe(true);
        expect((await sync(1)).game.reveal).toBeUndefined();
        const finished = await cmd(
          0,
          { type: "finishAbility" },
          peek.data.version,
        );
        expect(finished.ok).toBe(true);
        expect(finished.data.turn).toBe(users[1]);
      } finally {
        clients.forEach((c) => c.removeAllListeners("game:swap"));
        await db.$disconnect();
      }
    }, 20000);
    it("blocking removes friendship and prevents new requests", async () => {
      expect((await http(`/api/friends/${users[1]}/block`, 0, {})).status).toBe(
        200,
      );
      expect(
        (await http("/api/friends/requests", 1, { userId: users[0] })).status,
      ).toBe(403);
      expect(
        (await http(`/api/friends/${users[1]}/block`, 0, undefined, "DELETE"))
          .status,
      ).toBe(200);
    });
    it("revokes a live socket session and persists extended-absence forfeit", async () => {
      const signedOut = await http("/api/auth/sign-out", 2, {});
      expect(signedOut.status).toBe(200);
      const g = (await sync()).game;
      expect(
        (await cmd(2, { type: "inspect", indices: [0, 1] }, g.version)).error,
      ).toBe("SESSION_REVOKED");
      clients[2].disconnect();
      for (let i = 0; i < 120; i++) {
        if ((await sync()).game.phase === "matchOver") break;
        await new Promise((r) => setTimeout(r, 100));
      }
      const result = (await sync()).game;
      expect(result.phase).toBe("matchOver");
      expect(result.forfeit).toContain(users[2]);
      expect(result.winners).toContain(users[0]);
      expect(result.scores).toHaveLength(0);
    }, 15000);

    it("pauses and resumes the same pending draw with a preserved deadline", async () => {
      const created = await http("/api/rooms", 0, {
        rules: {
          ...customRules,
          memorySeconds: 0,
          disconnectSeconds: 10,
          disconnectPolicy: "pause",
        },
      });
      roomId = created.data.id;
      await http("/api/rooms/join", 1, { code: created.data.code });
      for (let i = 0; i < 2; i++)
        await http(`/api/rooms/${roomId}/ready`, i, { ready: true });
      expect((await http(`/api/rooms/${roomId}/start`, 0, {})).status).toBe(
        200,
      );
      for (let i = 0; i < 2; i++) {
        let g = (await sync(i)).game;
        expect(
          (await cmd(i, { type: "inspect", indices: [0, 1] }, g.version)).ok,
        ).toBe(true);
        g = (await sync(i)).game;
        expect((await cmd(i, { type: "ready" }, g.version)).ok).toBe(true);
      }
      let g = (await sync()).game;
      const draw = await cmd(0, { type: "draw", source: "deck" }, g.version);
      expect(draw.ok).toBe(true);
      const before = draw.data;
      clients[1].disconnect();
      for (let i = 0; i < 120; i++) {
        if ((await sync()).game.pausedAt) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      const paused = (await sync()).game;
      expect(paused.pausedAt).toBeTypeOf("number");
      expect(paused.drawn).toEqual(before.drawn);
      expect((await cmd(0, { type: "discard" }, paused.version)).error).toBe(
        "GAME_PAUSED",
      );
      clients[1].connect();
      await new Promise<void>((r) => clients[1].once("connect", r));
      for (let i = 0; i < 30; i++) {
        if (!(await sync()).game.pausedAt) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      const after = (await sync()).game;
      expect(after.pausedAt).toBeUndefined();
      expect(after.drawn).toEqual(before.drawn);
      expect(after.deadline).toBeGreaterThan(before.deadline);
      expect(after.phase).toBe("drawn");
      expect((await cmd(0, { type: "discard" }, after.version)).ok).toBe(true);
    }, 20000);
  },
);

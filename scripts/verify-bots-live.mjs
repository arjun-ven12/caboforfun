import { io } from "socket.io-client";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
const base =
    process.env.CABO_API_URL || "https://cabo-api-production.up.railway.app",
  cookies = [],
  users = [],
  clients = [],
  latest = new Map(),
  checks = [],
  actions = new Set();
let swaps = 0;
const assert = (ok, name) => {
  if (!ok) throw new Error(name);
};
const pass = (name) => checks.push({ name, status: "passed" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function http(path, who = 0, body, method) {
  const r = await fetch(base + path, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      Origin: "cabo://",
      ...(cookies[who] ? { Cookie: cookies[who] } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
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
async function ok(path, who = 0, body, method) {
  const r = await http(path, who, body, method);
  assert(r.status === 200, `HTTP operation failed (${r.status})`);
  return r.data;
}
function privateCheck(g, who) {
  assert(
    !("botState" in g) && !("deck" in g),
    "Private coordinator data exposed",
  );
  if (!["roundOver", "matchOver"].includes(g.phase)) {
    assert(
      g.players
        .filter((p) => p.id !== users[who])
        .every((p) => p.cards.every((s) => !s.card)),
      "Opponent card leaked",
    );
    if (g.turn !== users[who])
      assert(
        !g.drawn && !g.reveal && !g.activeAbility && !g.bonusQueue,
        "Private bot action leaked",
      );
  }
}
function observe(g, who) {
  privateCheck(g, who);
  const key = `${g.roomId}:${who}`,
    old = latest.get(key);
  if (
    !old ||
    g.matchStartedAt > old.matchStartedAt ||
    (g.matchId === old.matchId && g.version >= old.version)
  )
    latest.set(key, g);
  for (const a of g.actionHistory)
    if (a.actorId.startsWith("bot:")) actions.add(a.type);
}
async function room(id, who = 0) {
  const r = await ok(`/api/rooms/${id}`, who);
  if (r.game) observe({ ...r.game, roomId: id }, who);
  return r;
}
async function waitGame(id, who, predicate) {
  for (let n = 0; n < 150; n++) {
    let g = latest.get(`${id}:${who}`);
    if (n % 5 === 0) g = (await room(id, who)).game;
    if (g && predicate(g)) return g;
    await sleep(200);
  }
  throw new Error("Game progression timed out");
}
async function command(id, who, command) {
  const actionId = randomUUID();
  for (let attempt = 0; attempt < 10; attempt++) {
    const g = (await room(id, who)).game;
    const ack = await new Promise((r, j) =>
      clients[who]
        .timeout(10000)
        .emit(
          "game:command",
          { roomId: id, actionId, version: g.version, command },
          (err, a) =>
            err ? j(new Error("Socket acknowledgement timed out")) : r(a),
        ),
    );
    if (ack.ok) {
      observe({ ...ack.data, roomId: id }, who);
      return ack.data;
    }
    if (ack.error !== "STALE_VERSION")
      throw new Error(`Game command rejected: ${ack.error}`);
  }
  throw new Error("Concurrent preparation did not converge");
}
async function start(id, humans, rematch = false) {
  for (const who of humans)
    await ok(`/api/rooms/${id}/ready`, who, { ready: true });
  await ok(`/api/rooms/${id}/start`, humans[0], { rematch });
}
async function memory(id, humans) {
  for (const who of humans) {
    const g = (await room(id, who)).game;
    const indices = Array.from({ length: g.rules.initialPeek }, (_, i) => i);
    if (indices.length) await command(id, who, { type: "inspect", indices });
    await command(id, who, { type: "ready" });
  }
  await waitGame(id, humans[0], (g) => g.phase === "turn");
}
try {
  for (let i = 0; i < 2; i++) {
    const login = await http("/api/auth/sign-in/email", i, {
      email: process.env[`SMOKE_EMAIL_${i + 1}`],
      password: process.env[`SMOKE_PASSWORD_${i + 1}`],
    });
    assert(login.status === 200, "Controlled account login failed");
    cookies[i] = login.cookie;
    users[i] = login.data.user.id;
    const s = io(base, {
      auth: { cookie: cookies[i] },
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    await new Promise((r, j) => {
      s.once("connect", r);
      s.once("connect_error", () => j(new Error("Authenticated WSS failed")));
    });
    clients.push(s);
    s.on("game:state", (g) => observe(g, i));
    s.on("game:swap", (n) => {
      assert(
        !JSON.stringify(n.event).match(/rank|points|ability|cardId/),
        "Swap event leaked identity",
      );
      if (n.actor.kind === "bot") swaps++;
    });
  }
  pass("Two ordinary authenticated accounts and WSS connections");
  const rules = (await ok("/api/rules")).builtIn.find(
      (r) => r.name === "My Custom Cabo",
    ),
    presets = (await ok("/api/bots/presets")).builtIn;
  assert(Object.keys(presets).length === 5, "Five presets unavailable");
  const baseline = await ok("/api/stats");
  const solo = await ok("/api/rooms/solo", 0, {
    rules: { ...rules, memorySeconds: 0 },
    bots: ["beginner", "intermediate", "master"].map((d, i) => ({
      name: ["Nova", "Atlas", "Echo"][i],
      config: presets[d],
    })),
    options: { fast: true, practice: true, animationSpeed: 1 },
  });
  let r = await room(solo.id);
  assert(
    r.members.length === 4 && r.bots.length === 3,
    "Solo bot roster incorrect",
  );
  assert(
    r.members.filter((m) => m.kind === "bot").every((m) => m.username === null),
    "Bot impersonated a username",
  );
  pass(
    "Atomic solo lobby with three independent bot levels and distinct AI identities",
  );
  await start(solo.id, [0]);
  await memory(solo.id, [0]);
  const hint = await ok(`/api/rooms/${solo.id}/practice`);
  assert(hint.hint && hint.suggestion, "Practice suggestion unavailable");
  await command(solo.id, 0, { type: "cabo" });
  let result = await waitGame(solo.id, 0, (g) => g.phase === "matchOver");
  assert(result.scores.length === 4, "Solo result incomplete");
  for (const score of result.scores) {
    const p = result.players.find((p) => p.id === score.id);
    assert(
      p.cards.reduce((n, s) => n + s.card.points, 0) === score.raw,
      "Raw score differs from revealed hand",
    );
  }
  const stats = await ok("/api/stats");
  assert(
    stats.games === baseline.games &&
      stats.solo.games === baseline.solo.games + 1,
    "Solo inflated human statistics",
  );
  pass(
    "Autonomous bot final turns, authoritative revealed scoring and separate solo statistics",
  );
  const firstMatch = result.matchId,
    bot = r.bots[0];
  await ok(
    `/api/rooms/${solo.id}/bots/${bot.id}`,
    0,
    { name: bot.name, config: presets.expert },
    "PUT",
  );
  await start(solo.id, [0], true);
  r = await room(solo.id);
  assert(
    r.game.matchId !== firstMatch &&
      r.game.identities[`bot:${bot.id}`].difficulty === "expert",
    "Rematch bot snapshot did not update",
  );
  const history = await ok("/api/matches");
  assert(
    history.find((m) => m.matchId === firstMatch).match.identities[
      `bot:${bot.id}`
    ].difficulty === "beginner",
    "Historical bot config mutated",
  );
  pass(
    "Explicit rematch and immutable historical bot identities/configuration",
  );
  await ok(`/api/rooms/${solo.id}/solo`, 0, { action: "pause" });
  const paused = (await room(solo.id)).game;
  await sleep(700);
  assert(
    (await room(solo.id)).game.version === paused.version,
    "Paused solo advanced",
  );
  await ok(`/api/rooms/${solo.id}/solo`, 0, { action: "resume" });
  assert(!(await room(solo.id)).game.pausedAt, "Resume failed");
  await ok(`/api/rooms/${solo.id}/solo`, 0, { action: "restart" });
  r = await room(solo.id);
  assert(
    r.status === "lobby" && r.game === null && r.bots.length === 3,
    "Restart lost bot lobby",
  );
  pass("Persisted solo pause/resume and restart with preserved bot settings");
  const mixed = await ok("/api/rooms", 0, {
    rules: { ...rules, memorySeconds: 0 },
  });
  await ok(`/api/rooms/${mixed.id}/bots`, 0, {
    name: "Sage",
    config: presets.casual,
  });
  await ok("/api/rooms/join", 1, { code: mixed.code });
  await ok(
    `/api/rooms/${mixed.id}/bot-options`,
    0,
    { fast: true, practice: false, animationSpeed: 1 },
    "PUT",
  );
  assert(
    (await http(`/api/rooms/${mixed.id}/solo`, 0, { action: "pause" }))
      .status === 400,
    "Solo pause suspended mixed room",
  );
  assert(
    (await http(`/api/rooms/${mixed.id}/practice`)).status === 403,
    "Competitive practice leaked advice",
  );
  await start(mixed.id, [0, 1]);
  await memory(mixed.id, [0, 1]);
  await command(mixed.id, 0, { type: "cabo" });
  await waitGame(mixed.id, 1, (g) => g.turn === users[1]);
  await command(mixed.id, 1, { type: "draw", source: "deck" });
  await command(mixed.id, 1, { type: "discard" });
  result = await waitGame(mixed.id, 0, (g) => g.phase === "matchOver");
  assert(result.scores.length === 3, "Mixed result incomplete");
  const mixedStats = await ok("/api/stats");
  assert(
    mixedStats.games === baseline.games &&
      mixedStats.mixed.games === baseline.mixed.games + 1,
    "Mixed bots inflated human statistics",
  );
  pass(
    "Mixed human/bot room completion; multiplayer pause/practice rejected; rankings kept separate",
  );
  const configured = (await room(mixed.id)).bots[0];
  for (const who of [0, 1])
    await ok(`/api/rooms/${mixed.id}/ready`, who, { ready: true });
  await ok(
    `/api/rooms/${mixed.id}/bots/${configured.id}`,
    0,
    { name: configured.name, config: presets.master },
    "PUT",
  );
  assert(
    (await http(`/api/rooms/${mixed.id}/start`, 0, { rematch: true }))
      .status === 400,
    "Changed bot configuration reused old human consent",
  );
  pass("Bot configuration changes clear human rematch readiness");
  pass(
    "Private bot observations and memory absent from every observed human socket/API view",
  );
} catch (error) {
  checks.push({
    name: "Live bot acceptance",
    status: "failed",
    reason: error instanceof Error ? error.message : "Unexpected error",
  });
} finally {
  for (let i = 0; i < clients.length; i++) {
    clients[i].disconnect();
    await http("/api/auth/sign-out", i, {}).catch(() => {});
  }
}
const report = {
  checkedAt: new Date().toISOString(),
  apiUrl: base,
  status: checks.some((c) => c.status === "failed") ? "failed" : "passed",
  transport:
    "Two programmatic authenticated HTTPS/WSS clients; not Android devices",
  botActionsObserved: [...actions],
  botSwapNotificationsReceived: swaps,
  checks,
};
if (process.env.BOT_LIVE_REPORT)
  writeFileSync(
    process.env.BOT_LIVE_REPORT,
    JSON.stringify(report, null, 2) + "\n",
  );
console.log(JSON.stringify(report, null, 2));
if (report.status === "failed") process.exitCode = 1;

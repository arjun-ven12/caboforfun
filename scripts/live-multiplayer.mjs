import { io } from "socket.io-client";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const target = JSON.parse(
  readFileSync(new URL("../deploy/production.json", import.meta.url), "utf8"),
);
const base = process.env.CABO_API_URL || target.apiUrl;
const checks = [],
  clients = [],
  cookies = [],
  users = [],
  observed = new Set();
let roomId,
  turns = 0,
  failedMatch = false,
  successfulMatch = false;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (ok, name) => {
  if (!ok) throw new Error(name);
};
const pass = (name) => checks.push({ name, status: "passed" });
function progress() {
  if (process.env.SMOKE_PROGRESS_PATH)
    writeFileSync(
      process.env.SMOKE_PROGRESS_PATH,
      JSON.stringify(
        { status: "running", turns, powers: [...observed], checks },
        null,
        2,
      ),
    );
}
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
function emit(who, event, data) {
  return new Promise((resolve, reject) =>
    clients[who]
      .timeout(10000)
      .emit(event, data, (err, ack) =>
        err
          ? reject(new Error("Socket acknowledgement timeout"))
          : resolve(ack),
      ),
  );
}
function privateCheck(g, who) {
  assert(!("deck" in g), "A private view exposed the deck");
  if (!["roundOver", "matchOver"].includes(g.phase)) {
    assert(
      g.players
        .filter((p) => p.id !== users[who])
        .every((p) => p.cards.every((c) => c.card === undefined)),
      "A hidden opponent hand was exposed",
    );
    if (g.turn !== users[who])
      assert(
        !g.drawn && !g.reveal,
        "A private draw/peek was sent to another viewer",
      );
  }
}
async function sync(who = 0) {
  const r = await emit(who, "room:sync", roomId);
  assert(r.ok, "Room sync rejected");
  if (r.data.game) privateCheck(r.data.game, who);
  return r.data;
}
async function command(who, command) {
  await wait(100);
  const room = await sync(who);
  const r = await emit(who, "game:command", {
    roomId,
    actionId: randomUUID(),
    version: room.game.version,
    command,
  });
  assert(r.ok, `Command rejected: ${r.error || command.type}`);
  privateCheck(r.data, who);
  return r.data;
}
function points(card) {
  if (card.rank === "★") return -1;
  if (card.rank === "A") return 1;
  if (card.rank === "J") return 11;
  if (card.rank === "Q") return 12;
  if (card.rank === "K")
    return ["hearts", "diamonds"].includes(card.suit) ? 0 : 13;
  return Number(card.rank);
}
function power(card) {
  return ["7", "8"].includes(card.rank)
    ? "peekOwn"
    : ["9", "10"].includes(card.rank)
      ? "blindSwap"
      : ["J", "Q"].includes(card.rank)
        ? "peekOpponent"
        : card.rank === "K" && ["clubs", "spades"].includes(card.suit)
          ? "lookSwap"
          : "none";
}
async function memorize() {
  const known = [new Map(), new Map()];
  for (let i = 0; i < 2; i++) {
    const g = await command(i, { type: "inspect", indices: [0, 1] });
    const me = g.players.find((p) => p.id === users[i]);
    assert(
      me.cards.filter((c) => c.card).length === 2,
      "Initial peek count incorrect",
    );
    me.cards
      .filter((c) => c.card)
      .forEach((c) => known[i].set(c.index, c.card));
    await command(i, { type: "ready" });
  }
  const g = (await sync()).game;
  await wait(Math.max(0, g.deadline - Date.now()) + 1200);
  assert(
    (await sync()).game.phase === "turn",
    "Memorization readiness did not start play",
  );
  return known;
}
try {
  for (let i = 0; i < 2; i++) {
    const email = process.env[`SMOKE_EMAIL_${i + 1}`],
      password = process.env[`SMOKE_PASSWORD_${i + 1}`];
    assert(
      email && password,
      "Provide two controlled QA accounts through environment variables",
    );
    const login = await http("/api/auth/sign-in/email", i, { email, password });
    assert(login.status === 200 && login.data.user, "QA sign-in failed");
    cookies[i] = login.cookie;
    users[i] = login.data.user.id;
    const s = io(base, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      auth: { cookie: cookies[i] },
    });
    await new Promise((resolve, reject) => {
      s.once("connect", resolve);
      s.once("connect_error", () =>
        reject(new Error("Authenticated WSS connection failed")),
      );
    });
    clients.push(s);
  }
  pass("Two authenticated HTTPS/WSS clients");
  const request = await http("/api/friends/requests", 0, { userId: users[1] });
  assert(request.status === 200, "Friend request failed");
  assert(
    (await http("/api/friends/requests", 0, { userId: users[1] })).status ===
      409,
    "Duplicate friendship request accepted",
  );
  assert(
    (
      await http(`/api/friends/requests/${request.data.id}`, 1, {
        accept: true,
      })
    ).status === 200,
    "Friend acceptance failed",
  );
  pass("Friendship, duplicate rejection and acceptance");
  const created = await http("/api/rooms", 0, {});
  assert(created.status === 200, "Room creation failed");
  roomId = created.data.id;
  const challenge = await http(`/api/rooms/${roomId}/invites`, 0, {
    userId: users[1],
  });
  assert(challenge.status === 200, "Friend challenge failed");
  const landing = await fetch(challenge.data.url);
  assert(
    landing.ok && (await landing.text()).includes("Open CABO"),
    "HTTPS invitation landing failed",
  );
  const joined = await http("/api/rooms/join", 1, {
    token: challenge.data.token,
  });
  assert(
    joined.status === 200 && joined.data.id === roomId,
    "Secure invitation join failed",
  );
  await http(`/api/invites/${challenge.data.id}/respond`, 1, {});
  pass("Friend challenge, HTTPS invitation and token-authorized lobby join");
  const initial = await sync();
  assert(
    initial.rules.name === "My Custom Cabo" &&
      initial.rules.cards.reduce((n, c) => n + c.copies, 0) === 54,
    "Default preset/deck mismatch",
  );
  const changed = { ...initial.rules, turnSeconds: 75 };
  assert(
    (await http(`/api/rooms/${roomId}/rules`, 0, changed, "PUT")).status ===
      200,
    "Host rule edit failed",
  );
  assert(
    (await sync(1)).rules.turnSeconds === 75,
    "Opponent did not receive rules",
  );
  await http(`/api/rooms/${roomId}/rules`, 0, initial.rules, "PUT");
  for (let i = 0; i < 2; i++)
    await http(`/api/rooms/${roomId}/ready`, i, { ready: true });
  assert(
    (await http(`/api/rooms/${roomId}/start`, 0, {})).status === 200,
    "Match start failed",
  );
  assert(
    (await http(`/api/rooms/${roomId}/rules`, 0, changed, "PUT")).status ===
      400,
    "Active rule snapshot was editable",
  );
  pass(
    "Default 54-card rules, synchronized settings and immutable match snapshot",
  );
  const known = await memorize();
  pass("Exactly two private initial cards and ready-gated memorization");
  const needed = [
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "blackKingKeep",
    "blackKingSwap",
  ];
  for (
    turns = 0;
    turns < 180 && !needed.every((x) => observed.has(x));
    turns++
  ) {
    const current = (await sync()).game;
    const who = users.indexOf(current.turn),
      other = 1 - who;
    let g = await command(who, { type: "draw", source: "deck" });
    assert(g.phase === "drawn" && g.drawn, "Deck draw failed");
    const card = g.drawn.card;
    assert(
      card.points === points(card) && card.ability === power(card),
      "Default suit-aware value/power mapping incorrect",
    );
    if (card.ability !== "none") {
      g = await command(who, { type: "activate" });
      if (card.ability === "peekOwn") {
        g = await command(who, { type: "target", owner: users[who], index: 0 });
        assert(g.reveal?.card, "Own peek failed");
        known[who].set(0, g.reveal.card);
        await sync(other);
        await command(who, { type: "finishAbility" });
        observed.add(card.rank);
      } else if (card.ability === "peekOpponent") {
        g = await command(who, {
          type: "target",
          owner: users[other],
          index: 0,
        });
        assert(g.reveal?.card, "Opponent peek failed");
        await sync(other);
        await command(who, { type: "finishAbility" });
        observed.add(card.rank);
      } else if (card.ability === "blindSwap") {
        g = await command(who, {
          type: "target",
          owner: users[other],
          index: 0,
          ownIndex: 0,
        });
        assert(!g.reveal, "Blind swap revealed an identity");
        known[who].delete(0);
        known[other].delete(0);
        observed.add(card.rank);
      } else {
        g = await command(who, {
          type: "target",
          owner: users[other],
          index: 0,
        });
        assert(
          g.phase === "lookSwap" && g.reveal?.card,
          "Black King inspection failed",
        );
        await sync(other);
        if (!observed.has("blackKingKeep")) {
          await command(who, { type: "resolveSwap" });
          observed.add("blackKingKeep");
        } else {
          known[who].set(0, g.reveal.card);
          known[other].delete(0);
          await command(who, { type: "resolveSwap", ownIndex: 0 });
          observed.add("blackKingSwap");
        }
      }
    } else {
      const entries = [...known[who].entries()];
      let selection;
      if (!failedMatch)
        for (const [a, x] of entries)
          for (const [b, y] of entries)
            if (a < b && x.rank !== y.rank) selection = [a, b];
      if (!selection && !successfulMatch)
        for (const [a, x] of entries)
          for (const [b, y] of entries)
            if (a < b && x.rank === y.rank) selection = [a, b];
      if (selection) {
        const before = g.players.find((p) => p.id === users[who]).cards.length;
        g = await command(who, { type: "replace", indices: selection });
        const after = g.players.find((p) => p.id === users[who]).cards.length;
        if (after === before) {
          assert(
            g.publicReveal?.cards.length === 2,
            "Failed matching did not reveal selected cards",
          );
          failedMatch = true;
        } else {
          assert(
            after === before - 1,
            "Successful matching removed the wrong number of cards",
          );
          successfulMatch = true;
          known[who].clear();
          known[who].set(Math.min(...selection), card);
        }
      } else {
        const index =
          turns % g.players.find((p) => p.id === users[who]).cards.length;
        await command(who, { type: "replace", indices: [index] });
        known[who].set(index, card);
      }
    }
    await sync(other);
    progress();
  }
  for (const name of needed)
    checks.push({
      name: `Live custom ability ${name}`,
      status: observed.has(name) ? "passed" : "not_encountered",
    });
  checks.push(
    {
      name: "Incorrect multi-card replacement",
      status: failedMatch ? "passed" : "not_encountered",
    },
    {
      name: "Successful multi-card replacement",
      status: successfulMatch ? "passed" : "not_encountered",
    },
  );
  let g = (await sync()).game;
  const actor = users.indexOf(g.turn),
    away = 1 - actor;
  g = await command(actor, { type: "draw", source: "deck" });
  const pending = g.drawn;
  clients[away].disconnect();
  await wait(700);
  clients[away].connect();
  await new Promise((resolve, reject) => {
    clients[away].once("connect", resolve);
    clients[away].once("connect_error", () =>
      reject(new Error("Reconnect failed")),
    );
  });
  const restored = (await sync(actor)).game;
  assert(
    restored.version === g.version &&
      restored.drawn.card.id === pending.card.id,
    "Reconnect lost/replaced pending draw",
  );
  await command(actor, { type: "discard" });
  pass("Disconnect/reconnect retains exact pending draw and state version");
  g = (await sync()).game;
  const caller = users.indexOf(g.turn);
  await command(caller, { type: "cabo" });
  const final = 1 - caller;
  g = await command(final, { type: "draw", source: "deck" });
  g = await command(final, { type: "discard" });
  assert(
    g.phase === "matchOver" && g.history.length === 1,
    "Cabo did not give exactly one final opponent turn",
  );
  const raw = Object.fromEntries(
      g.players.map((p) => [
        p.id,
        p.cards.reduce((n, c) => n + points(c.card), 0),
      ]),
    ),
    min = Math.min(...Object.values(raw));
  for (const s of g.scores) {
    assert(s.raw === raw[s.id], "Raw hand score mismatch");
    const penalty = s.id === users[caller] && s.raw > min ? 5 : 0;
    assert(
      s.penalty === penalty &&
        s.total === (s.raw === min ? 0 : s.raw) + penalty,
      "Winner/Cabo penalty mismatch",
    );
  }
  pass(
    "Cabo final-turn count, revealed hand scoring and five-point failed-call penalty",
  );
  const previous = (await sync()).activeMatchId;
  await http(`/api/rooms/${roomId}/ready`, 0, { ready: true });
  assert(
    (await http(`/api/rooms/${roomId}/start`, 0, { rematch: true })).status ===
      400,
    "Rematch started without all consent",
  );
  await http(`/api/rooms/${roomId}/ready`, 1, { ready: true });
  assert(
    (await http(`/api/rooms/${roomId}/start`, 0, { rematch: true })).status ===
      200,
    "Accepted rematch failed",
  );
  const rematch = await sync();
  assert(
    rematch.activeMatchId !== previous &&
      rematch.game.history.length === 0 &&
      Object.values(rematch.game.totals).every((n) => n === 0),
    "Rematch did not reset state",
  );
  pass("Explicit rematch consent, new match and reset scores/secrets");
  await memorize();
  await command(0, { type: "cabo" });
  g = await command(1, { type: "draw", source: "deck" });
  g = await command(1, { type: "discard" });
  assert(g.phase === "matchOver", "QA rematch completion failed");
  for (let i = 0; i < 2; i++)
    assert(
      (await http("/api/matches", i)).data.length >= 2,
      "Match history missing",
    );
  pass("Both completed matches appear in history");
  for (let i = 0; i < 2; i++)
    await http(`/api/rooms/${roomId}/membership`, i, undefined, "DELETE");
} catch (error) {
  checks.push({
    name: "Live multiplayer run",
    status: "failed",
    reason: error instanceof Error ? error.message : "Unexpected error",
  });
} finally {
  for (let i = 0; i < clients.length; i++) {
    clients[i].disconnect();
    if (cookies[i]) await http("/api/auth/sign-out", i, {}).catch(() => {});
  }
}
const report = {
  checkedAt: new Date().toISOString(),
  apiUrl: base,
  transport:
    "Two programmatic Socket.IO clients over HTTPS/WSS; not Android devices",
  status: checks.some((c) => c.status === "failed")
    ? "failed"
    : checks.some((c) => c.status === "not_encountered")
      ? "partial"
      : "passed",
  turns,
  powers: [...observed],
  checks,
};
if (process.env.SMOKE_REPORT_PATH)
  writeFileSync(
    process.env.SMOKE_REPORT_PATH,
    JSON.stringify(report, null, 2) + "\n",
  );
console.log(JSON.stringify(report, null, 2));
process.exitCode =
  report.status === "failed" ? 1 : report.status === "partial" ? 2 : 0;

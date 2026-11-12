// Uses ordinary accounts and actual random production draws; no card seeding/admin endpoint.
import { io } from "socket.io-client";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
const base =
  process.env.CABO_API_URL || "https://cabo-api-production.up.railway.app";
const cookies = [],
  users = [],
  sockets = [],
  events = [[], []],
  observed = new Set();
let roomId,
  turns = 0;
const assert = (ok, msg) => {
  if (!ok) throw new Error(msg);
};
async function http(path, who = 0, body) {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Origin: "cabo://",
      ...(cookies[who] ? { Cookie: cookies[who] } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = await r.json();
  assert(r.ok, `HTTP ${r.status} at ${path.split("/").slice(0, 3).join("/")}`);
  const cookie = r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { data, cookie };
}
const sync = async (who = 0) =>
  (await http(`/api/rooms/${roomId}`, who)).data.game;
async function cmd(who, command) {
  const g = await sync(who);
  const ack = await new Promise((resolve, reject) =>
    sockets[who]
      .timeout(10000)
      .emit(
        "game:command",
        { roomId, actionId: randomUUID(), version: g.version, command },
        (e, a) => (e ? reject(e) : resolve(a)),
      ),
  );
  assert(ack.ok, `Command ${command.type}: ${ack.error}`);
  return ack.data;
}
try {
  for (let i = 0; i < 2; i++) {
    const { data, cookie } = await http("/api/auth/sign-in/email", i, {
      email: process.env[`SMOKE_EMAIL_${i + 1}`],
      password: process.env[`SMOKE_PASSWORD_${i + 1}`],
    });
    cookies[i] = cookie;
    users[i] = data.user.id;
    const s = io(base, {
      transports: ["websocket"],
      auth: { cookie },
      forceNew: true,
    });
    await new Promise((resolve, reject) => {
      s.once("connect", resolve);
      s.once("connect_error", () =>
        reject(new Error("WSS authentication failed")),
      );
    });
    sockets.push(s);
    s.on("game:swap", (n) => {
      assert(
        !JSON.stringify(n.event).match(/rank|points|ability|cardId/),
        "Swap leaked identity",
      );
      if (!events[i].some((e) => e.id === n.event.id)) events[i].push(n.event);
    });
  }
  const rules = (await http("/api/rules")).data.builtIn.find(
    (r) => r.name === "My Custom Cabo",
  );
  assert(rules.activateSwappedOutAbilities, "Default swap bonus disabled");
  const created = (
    await http("/api/rooms", 0, {
      rules: { ...rules, memorySeconds: 0, turnSeconds: 300 },
    })
  ).data;
  roomId = created.id;
  await http("/api/rooms/join", 1, { code: created.code });
  for (let i = 0; i < 2; i++)
    await http(`/api/rooms/${roomId}/ready`, i, { ready: true });
  await http(`/api/rooms/${roomId}/start`, 0, {});
  for (let i = 0; i < 2; i++) {
    await cmd(i, { type: "inspect", indices: [0, 1] });
    await cmd(i, { type: "ready" });
  }
  let outgoing;
  for (turns = 0; turns < 200 && observed.size < 2; turns++) {
    const current = await sync();
    const who = users.indexOf(current.turn),
      other = 1 - who;
    let g = await cmd(who, { type: "draw", source: "deck" });
    const drawn = g.drawn.card;
    const kind =
      drawn.ability === "blindSwap"
        ? "blindSwap"
        : drawn.ability === "lookSwap"
          ? "blackKing"
          : undefined;
    if (who === 0 && outgoing && kind && !observed.has(kind)) {
      const oldCount = g.swapHistory.length;
      g = await cmd(who, { type: "activate" });
      g = await cmd(who, {
        type: "target",
        owner: users[other],
        index: 0,
        ...(kind === "blindSwap" ? { ownIndex: 0 } : {}),
      });
      if (kind === "blackKing")
        g = await cmd(who, { type: "resolveSwap", ownIndex: 0 });
      assert(
        g.turn === users[who] &&
          g.activeAbility?.origin === "bonus" &&
          g.activeAbility.ability === outgoing,
        "Actual outgoing ability was not queued",
      );
      const hidden = await sync(other);
      assert(
        !hidden.activeAbility && !hidden.reveal && !hidden.drawn,
        "Opponent received a private action",
      );
      assert(
        hidden.players.every((p) => p.cards.every((s) => !s.card)),
        "Hidden hand leaked",
      );
      // Reconnect while the bonus is pending, then resolve the recovered private action.
      sockets[who].disconnect();
      sockets[who].connect();
      await new Promise((resolve, reject) => {
        sockets[who].once("connect", resolve);
        sockets[who].once("connect_error", reject);
      });
      const recovered = await sync(who);
      assert(
        recovered.activeAbility?.ability === outgoing &&
          recovered.swapHistory.length === g.swapHistory.length,
        "Bonus/history lost on reconnect",
      );
      if (outgoing === "blindSwap")
        g = await cmd(who, {
          type: "target",
          owner: users[other],
          index: 0,
          ownIndex: 0,
        });
      else {
        g = await cmd(who, {
          type: "target",
          owner: outgoing === "peekOwn" ? users[who] : users[other],
          index: 0,
        });
        assert(g.reveal?.card, "Bonus reveal missing");
        assert(!(await sync(other)).reveal, "Bonus peek leaked");
        g = await cmd(
          who,
          g.phase === "lookSwap"
            ? { type: "resolveSwap", ownIndex: 0 }
            : { type: "finishAbility" },
        );
      }
      assert(
        g.turn === users[other] && !g.activeAbility,
        "Bonus did not end before next turn",
      );
      assert(
        g.swapHistory.length - oldCount <=
          (outgoing === "blindSwap" || outgoing === "lookSwap" ? 2 : 1),
        "Default bonus chain exceeded bound",
      );
      observed.add(kind);
      outgoing = undefined;
    } else if (
      who === 0 &&
      !outgoing &&
      ["peekOwn", "peekOpponent", "blindSwap"].includes(drawn.ability)
    ) {
      outgoing = drawn.ability;
      await cmd(who, { type: "replace", indices: [0] });
    } else await cmd(who, { type: "discard" });
  }
  assert(observed.size === 2, "Did not encounter both original swap types");
  assert(
    events[0].length && events[1].length,
    "Both participants did not receive swaps",
  );
  let g = await sync();
  let who = users.indexOf(g.turn);
  await cmd(who, { type: "cabo" });
  g = await sync();
  who = users.indexOf(g.turn);
  g = await cmd(who, { type: "draw", source: "deck" });
  g = await cmd(who, { type: "discard" });
  assert(g.phase === "matchOver", "QA match not completed");
  const report = {
    checkedAt: new Date().toISOString(),
    status: "passed",
    transport: "Two programmatic HTTPS/WSS clients; not Android devices",
    originalSwaps: [...observed],
    turns,
    swapEventsReceived: events.map((e) => e.length),
    checks: [
      "Exact default outgoing ability privately queued from actual server hand",
      "Blind swap and Black King swap bonus resolution",
      "Pending bonus and history recovered after reconnect",
      "No hidden cards or bonus state exposed to opponent",
      "Default chain bound and turn advance",
      "Both authenticated sockets received position-only swaps",
    ],
  };
  if (process.env.SMOKE_BONUS_REPORT_PATH)
    writeFileSync(
      process.env.SMOKE_BONUS_REPORT_PATH,
      JSON.stringify(report, null, 2) + "\n",
    );
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (let i = 0; i < sockets.length; i++) {
    sockets[i].disconnect();
    await http("/api/auth/sign-out", i, {}).catch(() => {});
  }
}

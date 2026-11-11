import { describe, it, expect } from "vitest";
import { customRules, decodeRules, encodeRules, rulesSchema } from "./rules.js";
import {
  createDeck,
  startGame,
  transition,
  playerView,
  scoreRound,
  expire,
  type Game,
  type Command,
  type Card,
} from "./engine.js";
const rng = (n: number) => n - 1;
function game(n = 3) {
  const g = startGame(
    Array.from({ length: n }, (_, i) => `p${i}`),
    customRules,
    rng,
    0,
  );
  g.phase = "turn";
  g.deadline = 60000;
  return g;
}
const card = (key: string) =>
  createDeck(customRules).find((c) => c.key === key)!;
function drawn(key: string, source: "deck" | "discard" = "deck") {
  const g = game();
  g.drawn = { card: card(key), source };
  g.phase = "drawn";
  return g;
}
function act(g: Game, c: Command, id = "p0") {
  return transition(g, id, c, rng, 10000);
}
describe("default deck and mappings", () => {
  it("contains 52 unique ordinary cards and two Jokers", () => {
    const d = createDeck(customRules);
    expect(d).toHaveLength(54);
    expect(new Set(d.map((c) => c.id)).size).toBe(54);
  });
  it.each(["hearts", "diamonds"])(
    "red King of %s is zero and powerless",
    (s) => {
      expect(card(`K-${s}`)).toMatchObject({ points: 0, ability: "none" });
    },
  );
  it.each(["clubs", "spades"])("black King of %s is 13 and look/swap", (s) => {
    expect(card(`K-${s}`)).toMatchObject({ points: 13, ability: "lookSwap" });
  });
  it("Ace is one and Joker is negative", () => {
    expect(card("A-spades").points).toBe(1);
    expect(card("joker").points).toBe(-1);
  });
  it.each(["7", "8"])("%s peeks own", (rank) => {
    let g = act(drawn(`${rank}-clubs`), { type: "activate" });
    g = act(g, { type: "target", owner: "p0", index: 0 });
    expect(playerView(g, "p0").reveal?.card).toEqual(g.players[0].hand[0]);
    expect(playerView(g, "p1").reveal).toBeUndefined();
    g = act(g, { type: "finishAbility" });
    expect(g.turn).toBe(1);
  });
  it.each(["9", "10"])("%s blindly swaps", (rank) => {
    let g = act(drawn(`${rank}-clubs`), { type: "activate" });
    const a = g.players[0].hand[0],
      b = g.players[1].hand[1];
    g = act(g, { type: "target", owner: "p1", index: 1, ownIndex: 0 });
    expect(g.players[0].hand[0]).toEqual(b);
    expect(g.players[1].hand[1]).toEqual(a);
    expect(playerView(g, "p0").players[0].cards[0].card).toBeUndefined();
  });
  it.each(["J", "Q"])("%s spies on opponent", (rank) => {
    let g = act(drawn(`${rank}-clubs`), { type: "activate" });
    expect(() => act(g, { type: "target", owner: "p0", index: 0 })).toThrow(
      "INVALID_TARGET",
    );
    g = act(g, { type: "target", owner: "p1", index: 1 });
    expect(playerView(g, "p0").reveal?.card).toEqual(g.players[1].hand[1]);
    expect(() => act(g, { type: "target", owner: "p2", index: 1 })).toThrow(
      "ALREADY_REVEALED",
    );
  });
  it("Black King allows keep as is after private reveal", () => {
    let g = act(drawn("K-spades"), { type: "activate" });
    g = act(g, { type: "target", owner: "p1", index: 0 });
    const hands = g.players.map((p) => p.hand);
    expect(g.phase).toBe("lookSwap");
    expect(playerView(g, "p1").reveal).toBeUndefined();
    g = act(g, { type: "resolveSwap" });
    expect(g.players.map((p) => p.hand)).toEqual(hands);
    expect(g.turn).toBe(1);
  });
  it("Black King swaps only after inspection", () => {
    let g = act(drawn("K-clubs"), { type: "activate" });
    expect(() => act(g, { type: "resolveSwap", ownIndex: 0 })).toThrow(
      "WRONG_PHASE",
    );
    g = act(g, { type: "target", owner: "p2", index: 2 });
    const target = g.players[2].hand[2];
    g = act(g, { type: "resolveSwap", ownIndex: 1 });
    expect(g.players[0].hand[1]).toEqual(target);
  });
});
describe("private state and turn validation", () => {
  it("initially reveals exactly two selected own cards, never opponents", () => {
    let g = startGame(["p0", "p1"], customRules, rng, 0);
    expect(() => act(g, { type: "inspect", indices: [0] })).toThrow(
      "INVALID_SELECTION",
    );
    g = act(g, { type: "inspect", indices: [1, 3] });
    const v = playerView(g, "p0");
    expect(v.players[0].cards.filter((c) => c.card)).toHaveLength(2);
    expect(v.players[1].cards.filter((c) => c.card)).toHaveLength(0);
    expect(() => act(g, { type: "inspect", indices: [0, 2] })).toThrow(
      "ALREADY_INSPECTED",
    );
    g = act(g, { type: "ready" });
    expect(playerView(g, "p0").players[0].cards.every((c) => !c.card)).toBe(
      true,
    );
  });
  it("memory deadline starts round and hides all cards", () => {
    const g = startGame(["p0", "p1"], customRules, rng, 0);
    expect(expire(g, rng, 7999).phase).toBe("memory");
    expect(expire(g, rng, 8000).phase).toBe("memory");
    g.players.forEach((p) => (p.ready = true));
    expect(expire(g, rng, 8000).phase).toBe("turn");
  });
  it("draws, replaces, discards and advances once", () => {
    let g = act(game(), { type: "draw", source: "deck" });
    const newCard = g.drawn!.card,
      old = g.players[0].hand[2];
    g = act(g, { type: "replace", indices: [2] });
    expect(g.players[0].hand[2]).toEqual(newCard);
    expect(g.discard.at(-1)).toEqual(old);
    expect(g.turn).toBe(1);
    expect(() => act(g, { type: "draw", source: "deck" })).toThrow(
      "NOT_YOUR_TURN",
    );
  });
  it("discard source cannot activate or be discarded", () => {
    const g = drawn("7-clubs", "discard");
    expect(() => act(g, { type: "activate" })).toThrow("NO_ABILITY");
    expect(() => act(g, { type: "discard" })).toThrow("CANNOT_DISCARD");
    expect(act(g, { type: "replace", indices: [0] }).turn).toBe(1);
  });
  it("cannot leak deck, hand IDs or other drawn card", () => {
    const g = drawn("K-clubs");
    const v = playerView(g, "p1");
    expect(v).not.toHaveProperty("deck");
    expect(v.drawn).toBeUndefined();
    expect(JSON.stringify(v)).not.toContain(g.players[0].hand[0].id);
    expect(() => playerView(g, "stranger")).toThrow("NOT_MEMBER");
  });
  it("does not mutate previous snapshots", () => {
    const g = game(),
      copy = structuredClone(g);
    act(g, { type: "draw", source: "deck" });
    expect(g).toEqual(copy);
  });
  it("rejects missing, duplicate and out-of-range selections", () => {
    const g = drawn("A-clubs");
    expect(() => act(g, { type: "replace", indices: [1, 1] })).toThrow(
      "INVALID_SELECTION",
    );
    expect(() => act(g, { type: "replace", indices: [7] })).toThrow(
      "INVALID_SELECTION",
    );
  });
  it("timeout discards drawn card and restores correct next turn", () => {
    const g = drawn("7-spades"),
      n = expire(g, rng, 60001);
    expect(n.turn).toBe(1);
    expect(n.discard.at(-1)?.key).toBe("7-spades");
    expect(n.drawn).toBeUndefined();
  });
});
describe("matching and exhaustion", () => {
  it("successful match reduces hand and discards all replaced cards", () => {
    const g = drawn("A-spades");
    g.players[0].hand = [
      card("7-spades"),
      card("7-hearts"),
      card("3-clubs"),
      card("7-clubs"),
    ];
    const n = act(g, { type: "replace", indices: [0, 1, 3] });
    expect(n.players[0].hand.map((c) => c.rank)).toEqual(["A", "3"]);
  });
  it("failed match reveals cards, keeps hand, discards draw, ends turn", () => {
    const g = drawn("A-spades");
    g.players[0].hand = [card("7-spades"), card("8-hearts")];
    const n = act(g, { type: "replace", indices: [0, 1] });
    expect(n.players[0].hand).toEqual(g.players[0].hand);
    expect(n.publicReveal?.cards).toHaveLength(2);
    expect(n.discard.at(-1)?.rank).toBe("A");
    expect(n.turn).toBe(1);
  });
  it("matching by points allows both red Kings", () => {
    const g = drawn("A-spades");
    g.rules.matchBy = "points";
    g.players[0].hand = [card("K-hearts"), card("K-diamonds")];
    expect(
      act(g, { type: "replace", indices: [0, 1] }).players[0].hand,
    ).toHaveLength(1);
  });
  it("reshuffles discards except top", () => {
    const g = game();
    g.deck = [];
    g.discard = [card("A-hearts"), card("2-hearts"), card("3-hearts")];
    const n = act(g, { type: "draw", source: "deck" });
    expect(n.discard).toEqual([card("3-hearts")]);
    expect(n.deck.length).toBe(1);
  });
  it("ends deterministically when no cards can be recycled", () => {
    const g = game();
    g.deck = [];
    expect(act(g, { type: "draw", source: "deck" }).phase).toBe("matchOver");
  });
});
describe("Cabo, scoring and round lifecycle", () => {
  it("gives each other player exactly one final turn", () => {
    let g = act(game(5), { type: "cabo" });
    expect(g.turn).toBe(1);
    for (let i = 1; i < 5; i++) {
      g = act(g, { type: "draw", source: "deck" }, `p${i}`);
      g = act(g, { type: "discard" }, `p${i}`);
      expect(g.phase).toBe(i === 4 ? "matchOver" : "turn");
    }
    expect(g.history).toHaveLength(1);
  });
  it("lowest wins zero, unsuccessful caller gets five extra", () => {
    const g = game();
    g.players.forEach(
      (p, i) => (p.hand = [card(["K-hearts", "2-hearts", "3-hearts"][i])]),
    );
    g.caller = "p1";
    expect(scoreRound(g)).toMatchObject([
      { raw: 0, total: 0, winner: true },
      { raw: 2, total: 7, penalty: 5 },
      { raw: 3, total: 3 },
    ]);
  });
  it("caller tie is successful even with seat-order policy", () => {
    const g = game();
    g.players.forEach((p) => (p.hand = [card("joker")]));
    g.caller = "p2";
    g.rules.tiePolicy = "seatOrder";
    const s = scoreRound(g);
    expect(s[2]).toMatchObject({ raw: -1, total: 0, penalty: 0, winner: true });
    expect(s[0].total).toBe(-1);
  });
  it("multi-round totals and history persist, secrets reset", () => {
    let g = game(2);
    g.rules.mode = "rounds";
    g.rules.rounds = 3;
    g = act(g, { type: "cabo" });
    g = act(g, { type: "draw", source: "deck" }, "p1");
    g = act(g, { type: "discard" }, "p1");
    expect(g.phase).toBe("roundOver");
    const n = act(g, { type: "nextRound" });
    expect(n.history).toEqual(g.history);
    expect(n.totals).toEqual(g.totals);
    expect(n.round).toBe(2);
    expect(n.players.every((p) => p.inspected.length === 0 && !p.ready)).toBe(
      true,
    );
  });
});
describe("rules validation and sharing", () => {
  it("round-trips validated share codes", () =>
    expect(decodeRules(encodeRules(customRules))).toEqual(customRules));
  it.each([
    { initialPeek: 5 },
    { minPlayers: 5, maxPlayers: 2 },
    { cards: customRules.cards.slice(0, 2) },
    { startingCards: 9 },
  ])("rejects impossible config %j", (patch) =>
    expect(rulesSchema.safeParse({ ...customRules, ...patch }).success).toBe(
      false,
    ),
  );
});

describe("full rounds, slot stability and conservation", () => {
  it("rejects commands after deadline before scheduler runs", () => {
    const g = game();
    expect(() =>
      transition(g, "p0", { type: "draw", source: "deck" }, rng, 60000),
    ).toThrow("TURN_EXPIRED");
  });
  it("never allocates or loses card identities in 100 simulated rounds", () => {
    for (let seed = 1; seed <= 100; seed++) {
      let value = seed;
      const random = (max: number) => {
        value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
        return value % max;
      };
      let g = startGame(["p0", "p1", "p2", "p3", "p4"], customRules, random, 0);
      g.phase = "turn";
      let now = 1;
      for (let n = 0; n < 50 && g.phase !== "matchOver"; n++) {
        const id = g.players[g.turn].id;
        g = transition(g, id, { type: "draw", source: "deck" }, random, now++);
        if (g.phase === "matchOver") break;
        g = transition(
          g,
          id,
          n % 3 === 0
            ? {
                type: "replace",
                indices: [random(g.players[g.turn].hand.length)],
              }
            : { type: "discard" },
          random,
          now++,
        );
        const ids = [
          ...g.deck,
          ...g.discard,
          ...g.players.flatMap((p) => p.hand),
          ...(g.drawn ? [g.drawn.card] : []),
        ].map((c) => c.id);
        expect(ids).toHaveLength(54);
        expect(new Set(ids).size).toBe(54);
        for (const p of g.players) {
          const v = playerView(g, p.id);
          expect(
            v.players.every((q) => q.cards.every((c) => c.card === undefined)),
          ).toBe(true);
        }
      }
      if (g.phase !== "matchOver") {
        const id = g.players[g.turn].id;
        g = transition(g, id, { type: "cabo" }, random, now++);
        for (let n = 0; n < 4; n++) {
          const id = g.players[g.turn].id;
          g = transition(
            g,
            id,
            { type: "draw", source: "deck" },
            random,
            now++,
          );
          g = transition(g, id, { type: "discard" }, random, now++);
        }
      }
      expect(g.phase).toBe("matchOver");
      expect(g.history).toHaveLength(1);
    }
  });
});

describe("additional match modes and configured abilities", () => {
  it("best of three ends after two wins", () => {
    let g = game(2);
    g.rules.mode = "bestOf3";
    for (let n = 0; n < 2; n++) {
      if (n) {
        g = act(g, { type: "nextRound" });
        g.phase = "turn";
        g.turn = 0;
      }
      g.players[0].hand = [card("K-hearts")];
      g.players[1].hand = [card("6-hearts")];
      g = act(g, { type: "cabo" });
      g = act(g, { type: "draw", source: "deck" }, "p1");
      g = act(g, { type: "discard" }, "p1");
      expect(g.phase).toBe(n === 1 ? "matchOver" : "roundOver");
    }
    expect(playerView(g, "p0").winners).toEqual(["p0"]);
  });
  it("unlimited mode ends only on explicit organizer confirmation", () => {
    let g = game(2);
    g.rules.mode = "unlimited";
    g = act(g, { type: "cabo" });
    g = act(g, { type: "draw", source: "deck" }, "p1");
    g = act(g, { type: "discard" }, "p1");
    expect(g.phase).toBe("roundOver");
    expect(() => act(g, { type: "finishMatch" }, "p1")).toThrow("HOST_ONLY");
    g = act(g, { type: "finishMatch" });
    expect(g.phase).toBe("matchOver");
    expect(g.history).toHaveLength(1);
  });
  it("opponent peek can be configured as optional look and swap", () => {
    let g = drawn("J-hearts");
    g.rules.peekOpponentCanSwap = true;
    g = act(g, { type: "activate" });
    g = act(g, { type: "target", owner: "p1", index: 0 });
    expect(g.phase).toBe("lookSwap");
    g = act(g, { type: "resolveSwap" });
    expect(g.turn).toBe(1);
  });
  it("alternative Cabo timing discards a deck draw before final turns", () => {
    let g = game();
    g.rules.caboTiming = "afterDeckDraw";
    expect(() => act(g, { type: "cabo" })).toThrow("CANNOT_CALL");
    g = act(g, { type: "draw", source: "deck" });
    const drawn = g.drawn!.card;
    g = act(g, { type: "cabo" });
    expect(g.discard.at(-1)).toEqual(drawn);
    expect(g.finalTurns).toEqual(["p1", "p2"]);
  });
  it("paused games reject player commands", () => {
    const g = game();
    g.pausedAt = 10;
    expect(() => act(g, { type: "draw", source: "deck" })).toThrow(
      "GAME_PAUSED",
    );
  });
});

describe("round-ending boundary conditions", () => {
  it("ends a round deterministically for an empty hand", () => {
    const g = drawn("A-spades");
    g.players[1].hand = [];
    const n = act(g, { type: "discard" });
    expect(n.phase).toBe("matchOver");
    expect(n.scores.find((s) => s.id === "p1")).toMatchObject({
      raw: 0,
      winner: true,
    });
  });
  it("end-round exhaustion never recycles otherwise available discards", () => {
    const g = game();
    g.deck = [];
    g.discard = [card("A-hearts"), card("2-hearts"), card("3-hearts")];
    g.rules.exhaustion = "endRound";
    const n = act(g, { type: "draw", source: "deck" });
    expect(n.phase).toBe("matchOver");
    expect(n.discard).toEqual(g.discard);
    expect(n.drawn).toBeUndefined();
  });
});

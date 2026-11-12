import { describe, it, expect } from "vitest";
import { customRules, classicRules, standardRules } from "./rules";
import {
  startGame,
  playerView,
  transition,
  createDeck,
  legalActions,
} from "./engine";
import { botConfigSchema, botPresets, seededRandom } from "./bot-difficulty";
import { remember, slotKey } from "./bot-memory";
import { botObservation } from "./bot-observation";
import { decide } from "./bot-strategy";
import { simulateBots } from "./bot-simulator";
const rng = (n: number) => n - 1;
describe("restricted rule-aware bot", () => {
  it("never observes hidden cards or deck order; equivalent observations give identical distributions", () => {
    const a = startGame(["a", "b"], customRules, rng, 0);
    a.phase = "turn";
    a.deadline = 99999;
    const b = structuredClone(a);
    [b.deck[0], b.players[1].hand[0]] = [b.players[1].hand[0], b.deck[0]];
    const config = botPresets.master,
      va = playerView(a, "a"),
      vb = playerView(b, "a");
    const oa = botObservation(
        va,
        "a",
        remember(va, "a", undefined, config, () => 0.5),
        1,
      ),
      ob = botObservation(
        vb,
        "a",
        remember(vb, "a", undefined, config, () => 0.5),
        1,
      );
    expect(oa).toEqual(ob);
    expect(oa).not.toHaveProperty("deck");
    expect(oa.players.every((p) => p.cards.every((s) => !s.known))).toBe(true);
    for (let seed = 0; seed < 20; seed++) {
      expect(decide(oa, config, seededRandom(seed).next)).toEqual(
        decide(ob, config, seededRandom(seed).next),
      );
    }
  });
  it("remembers legitimate peeks, tracks observed physical swaps and invalidates changed slots", () => {
    let g = startGame(["a", "b"], customRules, rng, 0);
    g = transition(g, "a", { type: "inspect", indices: [0, 1] }, rng, 1);
    let m = remember(
      playerView(g, "a"),
      "a",
      undefined,
      botPresets.master,
      () => 0.5,
    );
    const known = m.slots[slotKey("a", 0)].card!;
    g.phase = "drawn";
    g.deadline = 99999;
    g.drawn = {
      card: createDeck(customRules).find((c) => c.key === "9-clubs")!,
      source: "deck",
    };
    // Observe every permitted view at each version, just as the persisted controller does.
    m = remember(playerView(g, "a"), "a", m, botPresets.master, () => 0.5);
    g = transition(g, "a", { type: "activate" }, rng, 2);
    m = remember(playerView(g, "a"), "a", m, botPresets.master, () => 0.5);
    g = transition(
      g,
      "a",
      { type: "target", owner: "b", index: 2, ownIndex: 0 },
      rng,
      3,
    );
    m = remember(playerView(g, "a"), "a", m, botPresets.master, () => 0.5);
    expect(m.slots[slotKey("b", 2)].card?.id).toBe(known.id);
    expect(m.slots[slotKey("a", 0)]?.card).toBeUndefined();
    g.version++;
    g.players[1].slotRevisions![2]++;
    m = remember(playerView(g, "a"), "a", m, botPresets.master, () => 0.5);
    expect(m.slots[slotKey("b", 2)]?.card).toBeUndefined();
  });
  it("forgetting is explicit uncertainty and perfect memory retains observed facts", () => {
    let g = startGame(["a", "b"], customRules, rng, 0);
    g = transition(g, "a", { type: "inspect", indices: [0, 1] }, rng, 1);
    const v = playerView(g, "a");
    const before = remember(v, "a", undefined, botPresets.master, () => 0.5);
    g.phase = "turn";
    g.version++;
    const after = playerView(g, "a");
    expect(
      remember(
        after,
        "a",
        before,
        { ...botPresets.beginner, memory: 0 },
        () => 0.5,
      ).slots[slotKey("a", 0)]?.card,
    ).toBeUndefined();
    expect(
      remember(after, "a", before, botPresets.master, () => 0.5).slots[
        slotKey("a", 0)
      ].card,
    ).toBeDefined();
  });
  it("validates custom settings and uses custom points rather than rank assumptions", () => {
    expect(
      botConfigSchema.safeParse({ ...botPresets.master, memory: 2 }).success,
    ).toBe(false);
    const r = structuredClone(customRules);
    r.cards.forEach((c) => {
      c.points = c.rank === "A" ? 90 : -3;
      c.ability = "none";
    });
    const g = startGame(["a", "b"], r, rng, 0);
    g.phase = "drawn";
    g.deadline = 99999;
    g.drawn = {
      card: createDeck(r).find((c) => c.rank === "A")!,
      source: "deck",
    };
    const v = playerView(g, "a"),
      m = remember(v, "a", undefined, botPresets.master, () => 0.5);
    expect(
      decide(botObservation(v, "a", m, 1), botPresets.master, () => 0.5)
        ?.command.type,
    ).toBe("discard");
  });
  it.each(Object.keys(botPresets) as (keyof typeof botPresets)[])(
    "%s completes legal seeded matches on every preset",
    (difficulty) => {
      for (const rules of [customRules, standardRules, classicRules])
        for (let seed = 1; seed <= 3; seed++) {
          const r = simulateBots(
            { ...rules, memorySeconds: 0 },
            [botPresets[difficulty], botPresets.master],
            seed,
          );
          expect(
            r.complete,
            `${difficulty}/${rules.name}/${seed} stuck at ${r.actions}`,
          ).toBe(true);
          expect(r.game.scores).toHaveLength(2);
        }
    },
    30000,
  );
  it("handles five players, chained bonuses, custom matching and multiple rounds", () => {
    const r = simulateBots(
      {
        ...customRules,
        memorySeconds: 0,
        chainSwapBonuses: true,
        maxBonusActions: 3,
        matchBy: "points",
        mode: "rounds",
        rounds: 3,
      },
      Array(5).fill(botPresets.master),
      42,
    );
    expect(r.complete).toBe(true);
    expect(r.game.history).toHaveLength(3);
  });
  it("generates every ability target without secret inspection and resolves outgoing bonuses", () => {
    for (const ability of [
      "peekOwn",
      "peekOpponent",
      "blindSwap",
      "lookSwap",
    ] as const) {
      let g = startGame(["a", "b"], customRules, rng, 0);
      g.phase = "ability";
      g.deadline = 99999;
      g.activeAbility = { ability, origin: "bonus", depth: 1 };
      g.drawn = undefined;
      const v = playerView(g, "a"),
        m = remember(v, "a", undefined, botPresets.master, () => 0.5);
      const d = decide(
        botObservation(v, "a", m, 1),
        botPresets.master,
        () => 0.5,
      )!;
      expect(legalActions(v, "a", 1)).toContainEqual(d.command);
      g = transition(g, "a", d.command, rng, 1);
      if (g.phase === "lookSwap" || g.reveal) {
        const v = playerView(g, "a");
        const d = decide(
          botObservation(
            v,
            "a",
            remember(v, "a", m, botPresets.master, () => 0.5),
            2,
          ),
          botPresets.master,
          () => 0.5,
        )!;
        g = transition(g, "a", d.command, rng, 2);
      }
      expect(g.turn).toBe(1);
    }
  });
  it("difficulty and personality modifiers change actual utilities and decision distributions", () => {
    const g = startGame(["a", "b"], customRules, rng, 0);
    g.phase = "drawn";
    g.deadline = 99999;
    g.drawn = {
      source: "deck",
      card: createDeck(customRules).find((c) => c.key === "K-hearts")!,
    };
    const v = playerView(g, "a"),
      o = botObservation(
        v,
        "a",
        remember(v, "a", undefined, botPresets.master, () => 0.5),
        1,
      );
    const choices = new Set(
      Array.from({ length: 40 }, (_, seed) =>
        JSON.stringify(
          decide(
            o,
            { ...botPresets.master, randomness: 1 },
            seededRandom(seed).next,
          )?.command,
        ),
      ),
    );
    expect(choices.size).toBeGreaterThan(1);
    expect(
      new Set(
        Array.from({ length: 10 }, (_, seed) =>
          JSON.stringify(
            decide(o, botPresets.master, seededRandom(seed).next)?.command,
          ),
        ),
      ).size,
    ).toBe(1);
    const target = structuredClone(o);
    target.phase = "ability";
    target.ability = { ability: "blindSwap", origin: "draw", depth: 0 };
    target.legal = [{ type: "target", owner: "b", index: 0, ownIndex: 0 }];
    target.players[0].cards[0].known = createDeck(customRules).find(
      (c) => c.key === "J-clubs",
    )!;
    target.players[1].cards[0].known = createDeck(customRules).find(
      (c) => c.key === "A-clubs",
    )!;
    const score = (patch: Partial<typeof botPresets.master>) =>
      decide(target, { ...botPresets.master, ...patch }, () => 0.5)!.utility;
    expect(score({ aggression: 0 })).not.toBe(score({ aggression: 1 }));
    expect(score({ special: 0 })).not.toBe(score({ special: 1 }));
    expect(score({ awareness: 0 })).not.toBe(score({ awareness: 1 }));
    expect(score({ personality: "conservative" })).not.toBe(
      score({ personality: "aggressive" }),
    );
    target.players[0].cards[0].known = undefined;
    expect(score({ risk: 0 })).not.toBe(score({ risk: 1 }));
    target.phase = "turn";
    target.legal = [{ type: "cabo" }];
    expect(score({ cabo: 0 })).not.toBe(score({ cabo: 1 }));
    target.phase = "drawn";
    target.legal = [{ type: "replace", indices: [0] }];
    target.discardHistory = createDeck(customRules).filter(
      (c) => c.points > 10,
    );
    expect(score({ inference: 0 })).not.toBe(score({ inference: 1 }));
  });
  it("completes short decks, maximum bonus chaining, Best of 3 and bounded unlimited simulations", () => {
    const small = {
      ...customRules,
      cards: customRules.cards.slice(0, 10),
      maxPlayers: 2,
      exhaustion: "endRound" as const,
      memorySeconds: 0,
    };
    expect(
      simulateBots(small, [botPresets.master, botPresets.master], 7).complete,
    ).toBe(true);
    const chain = {
      ...customRules,
      cards: customRules.cards.map((c) => ({
        ...c,
        ability: "blindSwap" as const,
      })),
      chainSwapBonuses: true,
      maxBonusActions: 8,
      memorySeconds: 0,
    };
    expect(
      simulateBots(chain, [botPresets.master, botPresets.master], 8).complete,
    ).toBe(true);
    for (const mode of ["bestOf3", "unlimited"] as const)
      expect(
        simulateBots(
          { ...customRules, mode, memorySeconds: 0 },
          [botPresets.expert, botPresets.master],
          9,
        ).complete,
      ).toBe(true);
  });
});

describe("observed public replacement memory", () => {
  function fixture(rules = customRules) {
    const r = { ...rules, memorySeconds: 0, initialPeek: 4 };
    if (rules.variant !== "official") {
      const keys = ["8-clubs", "8-hearts"];
      r.cards = [
        ...keys.map((key) => rules.cards.find((c) => c.key === key)!),
        ...rules.cards.filter((c) => !keys.includes(c.key)),
      ];
    }
    let g = startGame(["a", "b"], r, rng, 0),
      m: ReturnType<typeof remember> | undefined;
    function step(id: string, c: Parameters<typeof transition>[2]) {
      g = transition(g, id, c, rng, 1);
      m = remember(playerView(g, "a"), "a", m, botPresets.master, () => 0.5);
    }
    step("a", { type: "inspect", indices: [0, 1, 2, 3] });
    step("a", { type: "ready" });
    step("b", { type: "inspect", indices: [0, 1, 2, 3] });
    step("b", { type: "ready" });
    if (rules.variant !== "official") {
      const index = g.deck.findIndex((c) => c.key === "K-hearts");
      g.deck.push(...g.deck.splice(index, 1));
    } else g.turn = 0;
    step("a", { type: "draw", source: "deck" });
    return {
      get game() {
        return g;
      },
      get memory() {
        return m!;
      },
      step,
    };
  }
  it("preserves unselected physical cards after matching and remembers all known discards", () => {
    const f = fixture(),
      old = f.game.players[0].hand.map((c) => c.id),
      o = botObservation(playerView(f.game, "a"), "a", f.memory, 1);
    const decision = decide(o, botPresets.master, () => 0.5)!;
    expect(decision.command).toEqual({ type: "replace", indices: [0, 1] });
    f.step("a", decision.command);
    expect(f.memory.slots[slotKey("a", 1)].card?.id).toBe(old[2]);
    expect(f.memory.slots[slotKey("a", 2)].card?.id).toBe(old[3]);
    expect(f.memory.discardPile[old[0]]).toBeDefined();
    expect(f.memory.discardPile[old[1]]).toBeDefined();
    for (const [key, k] of Object.entries(f.memory.slots)) {
      if (k.card) {
        const [owner, index] = key.split("/");
        expect(
          f.game.players.find((p) => p.id === owner)?.hand[Number(index)]?.id,
        ).toBe(k.card.id);
      }
    }
  });
  it("never confuses an unseen failed-match penalty with the previously drawn card", () => {
    const f = fixture({ ...customRules, failedMatch: "drawPenalty" });
    f.step("a", { type: "replace", indices: [0, 2] });
    expect(f.game.players[0].hand).toHaveLength(5);
    expect(f.memory.slots[slotKey("a", 4)]?.card).toBeUndefined();
  });
  it("remembers the kept draw after an official failed match", () => {
    const f = fixture(classicRules),
      hand = f.game.players[0].hand,
      other = hand.findIndex((c) => c.rank !== hand[0].rank),
      draw = f.game.drawn!.card;
    expect(other).toBeGreaterThan(0);
    f.step("a", { type: "replace", indices: [0, other] });
    expect(f.memory.slots[slotKey("a", 4)].card?.id).toBe(draw.id);
  });
  it("does not reveal private inspected indices through public action history", () => {
    const f = fixture();
    const opponent = playerView(f.game, "b");
    const inspected = opponent.actionHistory.filter(
      (a) => a.type === "inspect",
    );
    expect(inspected).toHaveLength(2);
    expect(inspected.every((a) => a.indices === undefined)).toBe(true);
    expect(JSON.stringify(opponent.actionHistory)).not.toMatch(
      /rank|points|ability|cardId/,
    );
  });
  it("declines impossible activations and safely skips an inapplicable outgoing bonus", () => {
    const g = startGame(["a", "b"], customRules, rng, 0);
    g.phase = "drawn";
    g.deadline = 60000;
    g.drawn = {
      source: "deck",
      card: createDeck(customRules).find((c) => c.key === "J-clubs")!,
    };
    g.faceUp = g.players[1].hand.map((c) => c.id);
    expect(() => transition(g, "a", { type: "activate" }, rng, 1)).toThrow(
      "NO_TARGETS",
    );
    const outgoing = createDeck(customRules).find((c) => c.key === "J-clubs")!;
    g.players[0].hand[0] = outgoing;
    g.faceUp = [outgoing.id, ...g.players[1].hand.slice(1).map((c) => c.id)];
    g.phase = "lookSwap";
    g.activeAbility = { ability: "lookSwap", origin: "draw", depth: 0 };
    g.reveal = { owner: "b", index: 0 };
    g.drawn.card = createDeck(customRules).find((c) => c.key === "K-clubs")!;
    const next = transition(
      g,
      "a",
      { type: "resolveSwap", ownIndex: 0 },
      rng,
      1,
    );
    expect(next.turn).toBe(1);
    expect(next.activeAbility).toBeUndefined();
    expect(next.swapHistory).toHaveLength(1);
  });
});

it("memory reliability also applies to past public discards, while the current top stays visible", () => {
  let g = startGame(["a", "b"], customRules, rng, 0);
  g.phase = "turn";
  g.deadline = 60000;
  let m = remember(
    playerView(g, "a"),
    "a",
    undefined,
    botPresets.master,
    () => 0.5,
  );
  const old = g.discard.at(-1)!.id;
  g = transition(g, "a", { type: "draw", source: "deck" }, rng, 1);
  m = remember(playerView(g, "a"), "a", m, botPresets.master, () => 0.5);
  g = transition(g, "a", { type: "discard" }, rng, 2);
  const forget = remember(
      playerView(g, "a"),
      "a",
      m,
      { ...botPresets.master, memory: 0 },
      () => 0.5,
    ),
    retain = remember(playerView(g, "a"), "a", m, botPresets.master, () => 0.5);
  expect(forget.discardPile[old]).toBeUndefined();
  expect(forget.discardPile[g.discard.at(-1)!.id]).toBeDefined();
  expect(retain.discardPile[old]).toBeDefined();
});

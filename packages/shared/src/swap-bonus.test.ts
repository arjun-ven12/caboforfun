import { describe, it, expect } from "vitest";
import {
  customRules,
  classicRules,
  standardRules,
  rulesSchema,
} from "./rules.js";
import {
  startGame,
  transition,
  playerView,
  createDeck,
  expire,
  type Game,
  type Command,
} from "./engine.js";
const rng = (n: number) => n - 1;
const card = (key: string) =>
  createDeck(customRules).find((c) => c.key === key)!;
function setup(outgoing = "J-clubs", power = "9-clubs") {
  const g = startGame(["a", "b", "c"], customRules, rng, 0);
  g.phase = "drawn";
  g.deadline = 60000;
  g.drawn = { source: "deck", card: card(power) };
  g.players[0].hand[0] = card(outgoing);
  g.players[1].hand[0] = card("9-hearts");
  return g;
}
const act = (g: Game, c: Command, id = "a") => transition(g, id, c, rng, 1000);
function swap(g: Game) {
  g = act(g, { type: "activate" });
  if (g.drawn!.card.ability === "lookSwap") {
    g = act(g, { type: "target", owner: "b", index: 0 });
    return act(g, { type: "resolveSwap", ownIndex: 0 });
  }
  return act(g, { type: "target", owner: "b", index: 0, ownIndex: 0 });
}
describe("outgoing swap bonus queue and public history", () => {
  it("enables only custom by default and rejects unsafe configuration", () => {
    expect(customRules.activateSwappedOutAbilities).toBe(true);
    expect(classicRules.activateSwappedOutAbilities).toBe(false);
    expect(standardRules.activateSwappedOutAbilities).toBe(false);
    expect(
      rulesSchema.safeParse({ ...customRules, maxBonusActions: 9 }).success,
    ).toBe(false);
    expect(
      rulesSchema.safeParse({
        ...customRules,
        activateSwappedOutAbilities: false,
        chainSwapBonuses: true,
      }).success,
    ).toBe(false);
    const {
      activateSwappedOutAbilities,
      chainSwapBonuses,
      maxBonusActions,
      ...legacy
    } = customRules;
    expect(rulesSchema.parse(legacy).activateSwappedOutAbilities).toBe(false);
  });
  it.each(["9-clubs", "10-clubs", "K-clubs", "K-spades"])(
    "%s persists swap and privately grants Jack bonus",
    (power) => {
      const initial = setup("J-clubs", power);
      const g = swap(initial);
      expect(g.turn).toBe(0);
      expect(g.phase).toBe("ability");
      expect(g.activeAbility).toEqual({
        ability: "peekOpponent",
        origin: "bonus",
        depth: 1,
      });
      expect(g.drawn).toBeUndefined();
      expect(g.discard.at(-1)?.key).toBe(power);
      expect(g.players[1].hand[0].key).toBe("J-clubs");
      expect(g.players[0].hand[0].key).toBe("9-hearts");
      expect(initial.players[0].hand[0].key).toBe("J-clubs");
      const restored = JSON.parse(JSON.stringify(g)) as Game;
      expect(playerView(restored, "a").activeAbility?.ability).toBe(
        "peekOpponent",
      );
      expect(playerView(restored, "b").activeAbility).toBeUndefined();
      expect(playerView(restored, "c").bonusQueue).toBeUndefined();
      for (const viewer of ["a", "b", "c"]) {
        const v = playerView(restored, viewer);
        expect(v.swapHistory[0]).toMatchObject({
          actorId: "a",
          opponentId: "b",
          actorIndex: 0,
          opponentIndex: 0,
          version: g.version,
        });
        expect(v.players.every((p) => p.cards.every((s) => !s.card))).toBe(
          true,
        );
        expect(JSON.stringify(v.swapHistory)).not.toMatch(
          /card|rank|points|ability|clubs|hearts/,
        );
        expect(v.players[0].cards[0].revision).toBe(1);
      }
      expect(() =>
        act(restored, { type: "target", owner: "c", index: 0 }, "b"),
      ).toThrow("NOT_YOUR_TURN");
      const reveal = act(restored, { type: "target", owner: "c", index: 0 });
      expect(playerView(reveal, "a").reveal).toBeDefined();
      expect(playerView(reveal, "b").reveal).toBeUndefined();
      expect(act(reveal, { type: "finishAbility" }).turn).toBe(1);
    },
  );
  it.each([
    ["7-clubs", "peekOwn"],
    ["8-clubs", "peekOwn"],
    ["9-clubs", "blindSwap"],
    ["10-clubs", "blindSwap"],
    ["J-clubs", "peekOpponent"],
    ["Q-clubs", "peekOpponent"],
    ["K-clubs", "lookSwap"],
    ["K-spades", "lookSwap"],
  ])("outgoing %s securely resolves %s", (key, ability) => {
    expect(swap(setup(key)).activeAbility?.ability).toBe(ability);
  });
  it.each(["A-clubs", "2-clubs", "6-clubs", "K-hearts", "K-diamonds", "joker"])(
    "outgoing %s grants no bonus",
    (key) => {
      const g = swap(setup(key));
      expect(g.turn).toBe(1);
      expect(g.activeAbility).toBeUndefined();
    },
  );
  it("disabled rule grants no bonus and changing external rules cannot change snapshot", () => {
    const g = setup();
    g.rules.activateSwappedOutAbilities = false;
    expect(swap(g).turn).toBe(1);
    expect(customRules.activateSwappedOutAbilities).toBe(true);
  });
  it("declining Black King causes neither swap nor bonus", () => {
    let g = act(setup("J-clubs", "K-clubs"), { type: "activate" });
    g = act(g, { type: "target", owner: "b", index: 0 });
    g = act(g, { type: "resolveSwap" });
    expect(g.turn).toBe(1);
    expect(g.swapHistory).toEqual([]);
    expect(g.players[0].hand[0].key).toBe("J-clubs");
  });
  it("invalid swap cannot mutate state or enqueue bonus", () => {
    let g = act(setup(), { type: "activate" });
    expect(() =>
      act(g, { type: "target", owner: "b", index: 0, ownIndex: 90 }),
    ).toThrow("OWN_CARD_REQUIRED");
    expect(g.swapHistory).toEqual([]);
    expect(g.activeAbility?.origin).toBe("draw");
  });
  it("a bonus swap never chains by default, even with a special outgoing card", () => {
    let g = swap(setup("9-clubs"));
    expect(g.activeAbility?.ability).toBe("blindSwap");
    g = act(g, { type: "target", owner: "c", index: 0, ownIndex: 0 });
    expect(g.turn).toBe(1);
    expect(g.swapHistory).toHaveLength(2);
    expect(g.activeAbility).toBeUndefined();
  });
  it("optional chains stop at configured safety limit", () => {
    let g = setup("9-clubs");
    g.rules.chainSwapBonuses = true;
    g.rules.maxBonusActions = 2;
    g.players[2].hand[0] = card("9-diamonds");
    g = swap(g);
    g = act(g, { type: "target", owner: "c", index: 0, ownIndex: 0 });
    expect(g.activeAbility?.depth).toBe(2);
    g = act(g, { type: "target", owner: "b", index: 0, ownIndex: 0 });
    expect(g.turn).toBe(1);
    expect(g.swapHistory).toHaveLength(3);
  });
  it("bonus Black King can decline without a second event", () => {
    let g = swap(setup("K-clubs"));
    g = act(g, { type: "target", owner: "c", index: 0 });
    g = act(g, { type: "resolveSwap" });
    expect(g.swapHistory).toHaveLength(1);
    expect(g.turn).toBe(1);
  });
  it("bonus Black King swapping ends at default chain bound", () => {
    let g = swap(setup("K-clubs"));
    g = act(g, { type: "target", owner: "c", index: 0 });
    g = act(g, { type: "resolveSwap", ownIndex: 0 });
    expect(g.swapHistory).toHaveLength(2);
    expect(g.turn).toBe(1);
  });
  it("expiry clears bonus once without discarding exchanged physical cards", () => {
    const g = swap(setup());
    const total =
      g.players.reduce((n, p) => n + p.hand.length, 0) +
      g.deck.length +
      g.discard.length;
    const next = expire(g, rng, 60001);
    expect(next.turn).toBe(1);
    expect(next.activeAbility).toBeUndefined();
    expect(next.bonusQueue).toEqual([]);
    expect(
      next.players.reduce((n, p) => n + p.hand.length, 0) +
        next.deck.length +
        next.discard.length,
    ).toBe(total);
  });
  it("final Cabo turn waits for bonus and completes exactly once", () => {
    let g = setup();
    g.caller = "b";
    g.finalTurns = ["a"];
    g = swap(g);
    expect(g.phase).toBe("ability");
    expect(g.finalTurns).toEqual(["a"]);
    g = act(g, { type: "target", owner: "c", index: 0 });
    g = act(g, { type: "finishAbility" });
    expect(g.phase).toBe("matchOver");
    expect(g.history).toHaveLength(1);
  });
  it("history is bounded and carries across rounds", () => {
    let g = setup("A-clubs");
    g.swapHistory = Array.from({ length: 50 }, (_, i) => ({
      id: `old${i}`,
      sequence: i,
      version: i,
      round: 1,
      actorId: "a",
      opponentId: "b",
      actorIndex: 0,
      opponentIndex: 0,
      occurredAt: 0,
      animateAt: 0,
    }));
    g.swapSequence = 50;
    g = swap(g);
    expect(g.swapHistory).toHaveLength(50);
    expect(g.swapHistory?.at(-1)?.sequence).toBe(51);
    g.phase = "roundOver";
    g.rules.mode = "unlimited";
    g.scores = [];
    expect(act(g, { type: "nextRound" }).swapHistory).toEqual(g.swapHistory);
  });
});

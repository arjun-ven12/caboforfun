import { describe, it, expect } from "vitest";
import { classicRules, standardRules } from "./rules";
import {
  createDeck,
  startGame,
  transition,
  scoreRound,
  type Game,
} from "./engine";
const rng = (n: number) => n - 1;
function game() {
  const g = startGame(["a", "b"], classicRules, rng, 0);
  g.phase = "turn";
  g.turn = 0;
  g.deadline = 60000;
  return g;
}
const card = (n: number) =>
  createDeck(classicRules).find((c) => c.rank === String(n))!;
function finish(g: Game) {
  g = transition(g, "a", { type: "cabo" }, rng, 100);
  g = transition(g, "b", { type: "draw", source: "deck" }, rng, 101);
  return transition(g, "b", { type: "discard" }, rng, 102);
}
describe("Classic Cabo 2019 numbered rules", () => {
  it("has 52 cards, two zeroes and two thirteens", () => {
    const d = createDeck(classicRules);
    expect(d).toHaveLength(52);
    expect(d.filter((c) => c.rank === "0")).toHaveLength(2);
    expect(d.filter((c) => c.rank === "13")).toHaveLength(2);
    expect(d.filter((c) => c.rank === "12")).toHaveLength(4);
  });
  it("only successful caller receives zero points", () => {
    const g = game();
    g.players[0].hand = [card(8)];
    g.players[1].hand = [card(2)];
    g.caller = "a";
    expect(scoreRound(g)).toMatchObject([
      { total: 18, penalty: 10 },
      { total: 2, winner: true },
    ]);
  });
  it("Kamikaze scores zero and gives opponents fifty", () => {
    const g = game();
    g.players[0].hand = [card(12), card(12), card(13), card(13)];
    expect(scoreRound(g)).toMatchObject([
      { total: 0, winner: true },
      { total: 50, winner: false },
    ]);
  });
  it("discard exchanges stay publicly face up", () => {
    let g = game();
    g = transition(g, "a", { type: "draw", source: "discard" }, rng, 1);
    const id = g.drawn!.card.id;
    g = transition(g, "a", { type: "replace", indices: [0] }, rng, 2);
    expect(g.faceUp).toContain(id);
  });
  it("bad two-card match adds draw, leaves original cards", () => {
    let g = game();
    g.players[0].hand = [card(1), card(2)];
    g = transition(g, "a", { type: "draw", source: "deck" }, rng, 1);
    g = transition(g, "a", { type: "replace", indices: [0, 1] }, rng, 2);
    expect(g.players[0].hand).toHaveLength(3);
    expect(g.faceUp).toContain(card(1).id);
  });
  it("resets exactly 100 to 50 once and ends above 100", () => {
    let g = game();
    g.players[0].hand = [card(1)];
    g.players[1].hand = [card(2)];
    g.totals.b = 98;
    g = finish(g);
    expect(g.totals.b).toBe(50);
    expect(g.resets).toEqual(["b"]);
    expect(g.phase).toBe("roundOver");
    g = transition(g, "a", { type: "nextRound" }, rng, 200);
    g.phase = "turn";
    g.turn = 0;
    g.players[0].hand = [card(1)];
    g.players[1].hand = [card(2)];
    g.totals.b = 98;
    g = finish(g);
    expect(g.totals.b).toBe(100);
    expect(g.phase).toBe("roundOver");
  });
});

it("labels the standard-deck adaptation with separate face values and powers", () => {
  expect(createDeck(standardRules)).toHaveLength(52);
  expect(standardRules.cards.find((c) => c.key === "K-hearts")).toMatchObject({
    points: 10,
    ability: "none",
  });
  expect(standardRules.cards.find((c) => c.key === "9-clubs")?.ability).toBe(
    "peekOpponent",
  );
  expect(standardRules.cards.find((c) => c.key === "Q-clubs")?.ability).toBe(
    "blindSwap",
  );
});

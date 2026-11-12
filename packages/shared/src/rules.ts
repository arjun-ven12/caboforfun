import { z } from "zod";
export const abilitySchema = z.enum([
  "none",
  "peekOwn",
  "peekOpponent",
  "blindSwap",
  "lookSwap",
]);
export type Ability = z.infer<typeof abilitySchema>;
export const cardSchema = z.object({
  key: z.string().min(1).max(32),
  rank: z.string().min(1).max(8),
  suit: z.enum(["hearts", "diamonds", "clubs", "spades", "none"]),
  points: z.number().int().min(-20).max(100),
  ability: abilitySchema,
  copies: z.number().int().min(1).max(8),
});
export type CardDefinition = z.infer<typeof cardSchema>;
export const rulesSchema = z
  .object({
    schemaVersion: z.literal(1),
    variant: z.enum(["custom", "official"]).default("custom"),
    name: z.string().trim().min(1).max(60),
    cards: z.array(cardSchema).min(2).max(128),
    startingCards: z.number().int().min(1).max(8),
    initialPeek: z.number().int().min(0).max(8),
    memorySeconds: z.number().int().min(0).max(120),
    minPlayers: z.number().int().min(2).max(5),
    maxPlayers: z.number().int().min(2).max(5),
    matching: z.boolean(),
    matchBy: z.enum(["rank", "points"]),
    failedMatch: z.enum(["discard", "drawPenalty"]),
    abilities: z.boolean(),
    optionalSwap: z.boolean(),
    activateSwappedOutAbilities: z.boolean().default(false),
    chainSwapBonuses: z.boolean().default(false),
    maxBonusActions: z.number().int().min(1).max(8).default(1),
    peekOpponentCanSwap: z.boolean().default(false),
    caboTiming: z.enum(["start", "afterDeckDraw"]).default("start"),
    caboPenalty: z.number().int().min(0).max(100),
    tiePolicy: z.enum(["allLowest", "seatOrder"]),
    exhaustion: z.enum(["reshuffle", "endRound"]),
    turnSeconds: z.number().int().min(10).max(300),
    disconnectPolicy: z.enum(["forfeitMatch", "pause"]).default("forfeitMatch"),
    disconnectSeconds: z.number().int().min(10).max(600),
    mode: z.enum(["quick", "bestOf3", "rounds", "threshold", "unlimited"]),
    rounds: z.number().int().min(1).max(100),
    threshold: z.number().int().min(1).max(1000),
  })
  .superRefine((r, ctx) => {
    if (r.chainSwapBonuses && !r.activateSwappedOutAbilities)
      ctx.addIssue({
        code: "custom",
        message: "Bonus chaining requires swapped-out abilities",
      });
    if (r.minPlayers > r.maxPlayers)
      ctx.addIssue({
        code: "custom",
        message: "Minimum players exceeds maximum",
      });
    if (r.initialPeek > r.startingCards)
      ctx.addIssue({
        code: "custom",
        message: "Initial peek exceeds starting hand",
      });
    if (new Set(r.cards.map((c) => c.key)).size !== r.cards.length)
      ctx.addIssue({ code: "custom", message: "Duplicate card keys" });
    if (
      r.cards.reduce((n, c) => n + c.copies, 0) <
      r.startingCards * r.maxPlayers + 2
    )
      ctx.addIssue({
        code: "custom",
        message: "Deck cannot deal all hands, discard and draw",
      });
  });
export type Rules = z.infer<typeof rulesSchema>;
const ranks = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];
const suits = ["hearts", "diamonds", "clubs", "spades"] as const;
export const customRules: Rules = {
  schemaVersion: 1,
  variant: "custom",
  name: "My Custom Cabo",
  cards: [
    ...suits.flatMap((suit) =>
      ranks.map(
        (rank, i): CardDefinition => ({
          key: `${rank}-${suit}`,
          rank,
          suit,
          copies: 1,
          points:
            rank === "K" && (suit === "hearts" || suit === "diamonds")
              ? 0
              : i + 1,
          ability: ["7", "8"].includes(rank)
            ? "peekOwn"
            : ["9", "10"].includes(rank)
              ? "blindSwap"
              : ["J", "Q"].includes(rank)
                ? "peekOpponent"
                : rank === "K" && (suit === "clubs" || suit === "spades")
                  ? "lookSwap"
                  : "none",
        }),
      ),
    ),
    {
      key: "joker",
      rank: "★",
      suit: "none",
      points: -1,
      ability: "none",
      copies: 2,
    },
  ],
  startingCards: 4,
  initialPeek: 2,
  memorySeconds: 8,
  minPlayers: 2,
  maxPlayers: 5,
  matching: true,
  matchBy: "rank",
  failedMatch: "discard",
  abilities: true,
  optionalSwap: true,
  activateSwappedOutAbilities: true,
  chainSwapBonuses: false,
  maxBonusActions: 1,
  peekOpponentCanSwap: false,
  caboTiming: "start",
  caboPenalty: 5,
  tiePolicy: "allLowest",
  exhaustion: "reshuffle",
  turnSeconds: 60,
  disconnectSeconds: 90,
  disconnectPolicy: "forfeitMatch",
  mode: "quick",
  rounds: 3,
  threshold: 100,
};
export const standardRules: Rules = {
  ...structuredClone(customRules),
  name: "Classic Standard Deck",
  activateSwappedOutAbilities: false,
  cards: customRules.cards
    .filter((c) => c.rank !== "★")
    .map((c) => ({
      ...c,
      points: ["J", "Q", "K"].includes(c.rank) ? 10 : c.points,
      ability: ["7", "8"].includes(c.rank)
        ? "peekOwn"
        : ["9", "10"].includes(c.rank)
          ? "peekOpponent"
          : ["J", "Q"].includes(c.rank)
            ? "blindSwap"
            : "none",
    })),
};
// Numbered 2019 edition: 2x0, 4x1–12, 2x13. Original generic card faces.
export const classicRules: Rules = {
  ...structuredClone(customRules),
  name: "Classic Cabo (2019)",
  activateSwappedOutAbilities: false,
  variant: "official",
  maxPlayers: 4,
  caboPenalty: 10,
  exhaustion: "endRound",
  mode: "threshold",
  cards: Array.from({ length: 14 }, (_, n) => ({
    key: `number-${n}`,
    rank: String(n),
    suit: "none" as const,
    points: n,
    copies: n === 0 || n === 13 ? 2 : 4,
    ability:
      n === 7 || n === 8
        ? ("peekOwn" as const)
        : n === 9 || n === 10
          ? ("peekOpponent" as const)
          : n === 11 || n === 12
            ? ("blindSwap" as const)
            : ("none" as const),
  })),
};
export const presets = [customRules, classicRules, standardRules];
export function encodeRules(r: Rules) {
  return JSON.stringify(rulesSchema.parse(r));
}
export function decodeRules(code: string) {
  if (code.length > 32000) throw new Error("Rules code too large");
  return rulesSchema.parse(JSON.parse(code));
}

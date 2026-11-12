import { z } from "zod";
export const botConfigSchema = z.object({
  difficulty: z.enum([
    "beginner",
    "casual",
    "intermediate",
    "expert",
    "master",
    "custom",
  ]),
  personality: z
    .enum([
      "balanced",
      "conservative",
      "aggressive",
      "analytical",
      "unpredictable",
    ])
    .default("balanced"),
  strategy: z.number().int().min(1).max(10),
  memory: z.number().min(0).max(1),
  risk: z.number().min(0).max(1),
  aggression: z.number().min(0).max(1),
  cabo: z.number().min(0).max(1),
  awareness: z.number().min(0).max(1),
  inference: z.number().min(0).max(1),
  special: z.number().min(0).max(1),
  delayMs: z.number().int().min(0).max(3000),
  randomness: z.number().min(0).max(1),
});
export type BotConfig = z.infer<typeof botConfigSchema>;
function preset(
  difficulty: BotConfig["difficulty"],
  strategy: number,
  memory: number,
  randomness: number,
  delayMs: number,
): BotConfig {
  return {
    difficulty,
    personality: "balanced",
    strategy,
    memory,
    randomness,
    delayMs,
    risk: 0.45,
    aggression: strategy / 14,
    cabo: strategy / 12,
    awareness: strategy / 10,
    inference: strategy / 10,
    special: strategy / 10,
  };
}
export const botPresets = {
  beginner: preset("beginner", 1, 0.45, 0.45, 1800),
  casual: preset("casual", 3, 0.7, 0.22, 1500),
  intermediate: preset("intermediate", 5, 0.85, 0.1, 1200),
  expert: preset("expert", 8, 0.97, 0.025, 1000),
  master: preset("master", 10, 1, 0, 1000),
};
export const botNames = ["Nova", "Atlas", "Echo", "Sage"];
export const botSeatSchema = z.object({
  name: z.string().trim().min(1).max(24),
  config: botConfigSchema,
});
export function personality(c: BotConfig): BotConfig {
  const p = { ...c };
  switch (c.personality) {
    case "conservative":
      p.risk *= 0.5;
      p.cabo *= 0.7;
      break;
    case "aggressive":
      p.aggression = Math.min(1, p.aggression + 0.25);
      p.cabo = Math.min(1, p.cabo + 0.15);
      break;
    case "analytical":
      p.risk *= 0.8;
      p.aggression *= 0.75;
      p.inference = Math.min(1, p.inference + 0.2);
      p.special = Math.min(1, p.special + 0.2);
      break;
    case "unpredictable":
      p.randomness = Math.max(0.25, p.randomness);
      break;
  }
  return p;
}
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return {
    next() {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    },
    get state() {
      return state;
    },
  };
}

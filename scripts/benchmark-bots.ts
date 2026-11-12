import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import {
  botPresets,
  customRules,
  classicRules,
  standardRules,
  simulateBots,
  matchWinners,
  type BotConfig,
} from "@cabo/shared";
const count = Number(process.env.BOT_BENCHMARK_GAMES ?? 200);
if (!Number.isInteger(count) || count < 10 || count > 2000)
  throw new Error("Games must be 10–2000 per difficulty.");
const started = performance.now(),
  results = [];
let actions = 0;
for (const [difficulty, config] of Object.entries(botPresets)) {
  let wins = 0,
    ties = 0,
    failures = 0,
    totalActions = 0;
  const timings = [],
    pairShares: number[] = [];
  for (let seed = 1; seed <= count; seed++) {
    const pairScores: number[] = [];
    for (const seat of [0, 1]) {
      const configs: BotConfig[] =
          seat === 0
            ? [config, botPresets.master]
            : [botPresets.master, config],
        before = performance.now();
      const result = simulateBots(
        { ...customRules, memorySeconds: 0 },
        configs,
        seed,
      );
      timings.push(performance.now() - before);
      totalActions += result.actions;
      if (!result.complete) {
        failures++;
        continue;
      }
      const winners = matchWinners(result.game);
      pairScores.push(winners.includes(`bot:${seat}`) ? 1 / winners.length : 0);
      if (winners.includes(`bot:${seat}`)) {
        if (winners.length > 1) ties++;
        else wins++;
      }
    }
    pairShares.push(pairScores.reduce((a, b) => a + b, 0) / 2);
  }
  timings.sort((a, b) => a - b);
  actions += totalActions;
  results.push({
    difficulty,
    opponent: "master",
    games: count * 2,
    seedPairs: count,
    outrightWins: wins,
    ties,
    losses: count * 2 - wins - ties - failures,
    incomplete: failures,
    winShare: (wins + ties / 2) / (count * 2),
    pairedScore95Interval: (() => {
      const m = pairShares.reduce((a, b) => a + b, 0) / count,
        se = Math.sqrt(
          pairShares.reduce((s, v) => s + (v - m) ** 2, 0) /
            Math.max(1, count - 1) /
            count,
        );
      return [Math.max(0, m - 1.96 * se), Math.min(1, m + 1.96 * se)];
    })(),
    averageActions: totalActions / (count * 2),
    p95MatchMs: timings[Math.floor(timings.length * 0.95)],
    meanMatchMs: timings.reduce((a, b) => a + b, 0) / (count * 2),
  });
}
const compatibility = [];
for (const preset of [customRules, standardRules, classicRules]) {
  let completed = 0;
  for (let seed = 1; seed <= 50; seed++) {
    const r = simulateBots(
      { ...preset, memorySeconds: 0 },
      Array.from(
        {
          length:
            preset.minPlayers +
            (seed % (preset.maxPlayers - preset.minPlayers + 1)),
        },
        () => botPresets.master,
      ),
      seed + 5000,
    );
    if (r.complete) completed++;
  }
  compatibility.push({ preset: preset.name, games: 50, completed });
}
const report = {
  generatedAt: new Date().toISOString(),
  seedPolicy:
    "1..N seed pairs, both seat orders per seed; independent engine and per-bot PRNG streams",
  comparison:
    "Paired seeded matches against Master; exploratory, not proof of monotonic difficulty or human strength",
  results,
  compatibility,
  totalActions: actions,
  elapsedMs: performance.now() - started,
};
if (process.env.BOT_BENCHMARK_OUTPUT)
  writeFileSync(
    process.env.BOT_BENCHMARK_OUTPUT,
    JSON.stringify(report, null, 2) + "\n",
  );
console.log(JSON.stringify(report, null, 2));
if (
  results.some((r) => r.incomplete) ||
  compatibility.some((r) => r.completed !== r.games)
)
  process.exitCode = 1;

import { startGame, transition, expire, playerView, type Game } from "./engine";
import type { Rules } from "./rules";
import { remember, type BotMemory } from "./bot-memory";
import { botObservation } from "./bot-observation";
import { decide } from "./bot-strategy";
import { seededRandom, type BotConfig } from "./bot-difficulty";
export function simulateBots(
  rules: Rules,
  configs: BotConfig[],
  seed: number,
  maxActions = 15000,
) {
  const rng = seededRandom(seed),
    random = () => rng.next(),
    int = (n: number) => Math.floor(random() * n),
    ids = configs.map((_, i) => `bot:${i}`);
  let now = 1,
    g = startGame(ids, rules, int, now),
    actions = 0;
  const botRandom = ids.map((_, i) =>
    seededRandom(seed ^ Math.imul(i + 1, 2654435761)),
  );
  const memory: Record<string, BotMemory> = {};
  const commands: Record<string, number> = {};
  while (g.phase !== "matchOver" && actions < maxActions) {
    for (let i = 0; i < ids.length; i++)
      memory[ids[i]] = remember(
        playerView(g, ids[i]),
        ids[i],
        memory[ids[i]],
        configs[i],
        botRandom[i].next,
      );
    // Test-harness invariant only; the policy never receives these authoritative checks.
    for (const botId of ids) {
      for (const [key, k] of Object.entries(memory[botId].slots)) {
        if (!k.card) continue;
        const split = key.lastIndexOf("/"),
          owner = key.slice(0, split),
          index = Number(key.slice(split + 1));
        if (
          g.players.find((p) => p.id === owner)?.hand[index]?.id !== k.card.id
        )
          throw new Error(
            `Incorrect remembered position at version ${g.version}`,
          );
      }
      for (const card of Object.values(memory[botId].discardPile))
        if (!g.discard.some((c) => c.id === card.id))
          throw new Error(
            `Incorrect discard membership at version ${g.version}`,
          );
    }
    const actor =
      g.phase === "memory"
        ? g.players.find((p) => !p.ready)?.id
        : g.phase === "roundOver"
          ? ids[0]
          : g.players[g.turn].id;
    if (!actor) {
      now = g.deadline;
      g = expire(g, int, now);
      continue;
    }
    const i = ids.indexOf(actor),
      o = botObservation(playerView(g, actor), actor, memory[actor], now),
      d = decide(o, configs[i], botRandom[i].next);
    if (!d) {
      now = g.deadline;
      g = expire(g, int, now);
      continue;
    }
    const command =
      g.phase === "roundOver" && rules.mode === "unlimited" && g.round >= 3
        ? { type: "finishMatch" as const }
        : d.command;
    const next = transition(g, actor, command, int, now);
    commands[command.type] = (commands[command.type] ?? 0) + 1;
    g = next;
    actions++;
    now++;
  }
  return { game: g, actions, commands, complete: g.phase === "matchOver" };
}

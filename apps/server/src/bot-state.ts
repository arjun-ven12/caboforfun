import {
  remember,
  playerView,
  seededRandom,
  botConfigSchema,
  type Game,
  type BotMemory,
  type BotConfig,
  type PublicIdentity,
} from "@cabo/shared";
export type Agent = {
  config: BotConfig;
  identity: PublicIdentity;
  memory?: BotMemory;
  seed: number;
  dueAt?: number;
};
export type AgentMap = Record<string, Agent>;
export function observeAgents(g: Game, agents: AgentMap): AgentMap {
  const result = structuredClone(agents);
  for (const [id, agent] of Object.entries(result)) {
    const rng = seededRandom(agent.seed);
    agent.memory = remember(
      playerView(g, id),
      id,
      agent.memory,
      botConfigSchema.parse(agent.config),
      rng.next,
    );
    agent.seed = rng.state;
  }
  return result;
}

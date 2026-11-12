import {
  legalActions,
  type Card,
  type PlayerView,
  type Command,
} from "./engine";
import type { BotMemory } from "./bot-memory";
import { slotKey } from "./bot-memory";
export type BotObservation = {
  id: string;
  round: number;
  version: number;
  rules: PlayerView["rules"];
  phase: PlayerView["phase"];
  turn: string;
  players: {
    id: string;
    cards: {
      index: number;
      known?: Card;
      confidence: number;
      estimate?: { points: number; confidence: number };
    }[];
  }[];
  drawn?: PlayerView["drawn"];
  reveal?: PlayerView["reveal"];
  ability?: PlayerView["activeAbility"];
  discard?: Card;
  discardHistory: Card[];
  deckCount: number;
  legal: Command[];
  totals: Record<string, number>;
  caller?: string;
  finalTurns: string[];
  history: PlayerView["history"];
  publicActions: PlayerView["actionHistory"];
  turns: number;
};
/** Whitelisted projection only. This function cannot accept Game (turn is a string here). */
export function botObservation(
  view: PlayerView,
  id: string,
  memory: BotMemory,
  now: number,
): BotObservation {
  return structuredClone({
    id,
    round: view.round,
    version: view.version,
    rules: view.rules,
    phase: view.phase,
    turn: view.turn,
    players: view.players.map((p) => ({
      id: p.id,
      cards: p.cards.map((s) => {
        const k = memory.slots[slotKey(p.id, s.index)];
        return {
          index: s.index,
          known: s.card ?? (k?.revision === s.revision ? k.card : undefined),
          estimate: memory.beliefs?.[slotKey(p.id, s.index)],
          confidence: s.card
            ? 1
            : k?.revision === s.revision
              ? k.confidence
              : 0,
        };
      }),
    })),
    drawn: view.drawn,
    reveal: view.reveal,
    ability: view.activeAbility,
    discard: view.discard,
    discardHistory: Object.values(memory.discardPile),
    deckCount: view.deckCount,
    legal: legalActions(view, id, now),
    totals: view.totals,
    caller: view.caller,
    finalTurns: view.finalTurns,
    history: view.history,
    publicActions: view.actionHistory,
    turns: memory.turns,
  });
}

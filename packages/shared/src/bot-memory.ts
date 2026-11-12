import type { Card, PlayerView } from "./engine";
import type { BotConfig } from "./bot-difficulty";
export type Knowledge = { card?: Card; revision: number; confidence: number };
type Belief = { points: number; confidence: number };
export type BotMemory = {
  round: number;
  version: number;
  slots: Record<string, Knowledge>;
  beliefs?: Record<string, Belief>;
  revisions: Record<string, number>;
  swaps: number;
  discardPile: Record<string, Card>;
  deckCount: number;
  phase: PlayerView["phase"];
  turn: string;
  discard?: Card;
  held?: { owner: string; card: Card };
  lastDecay: number;
  reshuffles?: number;
  turns: number;
};
export const slotKey = (owner: string, index: number) => `${owner}/${index}`;
/** Consume authorized observations only. Uncertain score estimates never become card facts. */
export function remember(
  v: PlayerView,
  id: string,
  previous: BotMemory | undefined,
  config: BotConfig,
  random: () => number,
): BotMemory {
  let m: BotMemory =
    previous && previous.round === v.round
      ? structuredClone(previous)
      : {
          round: v.round,
          version: 0,
          slots: {},
          beliefs: {},
          revisions: {},
          swaps: 0,
          discardPile: {},
          deckCount: v.deckCount,
          phase: v.phase,
          turn: v.turn,
          lastDecay: -1,
          reshuffles: v.reshuffles,
          turns: 0,
        };
  m.beliefs ??= {};
  if (m.version === v.version) return m;
  if (m.version && v.version !== m.version + 1) {
    m.slots = {};
    m.beliefs = {};
    m.held = undefined;
  }
  if (
    v.phase === "turn" &&
    v.pausedAt === undefined &&
    m.lastDecay !== v.turnNumber
  ) {
    m.turns = v.turnNumber;
    m.lastDecay = v.turnNumber;
    for (const k of Object.keys(m.slots))
      if (random() > config.memory) {
        m.slots[k] = { revision: m.slots[k].revision, confidence: 0 };
        delete m.beliefs[k];
      }
    if (config.memory < 1) {
      for (const cardId of Object.keys(m.discardPile))
        if (cardId !== v.discard?.id && random() > config.memory)
          delete m.discardPile[cardId];
      for (const key of Object.keys(m.beliefs))
        if (random() > config.memory) delete m.beliefs[key];
    }
  }
  if (v.deckCount > m.deckCount || m.reshuffles !== v.reshuffles)
    m.discardPile = {};
  const action = v.lastAction?.version === v.version ? v.lastAction : undefined;
  if (action?.type === "draw" && action.source === "discard" && m.discard) {
    m.held = { owner: action.actorId, card: m.discard };
    delete m.discardPile[m.discard.id];
  }
  if (v.drawn) m.held = { owner: id, card: structuredClone(v.drawn.card) };
  const moved = new Set<string>();
  const newRevision = (owner: string, index: number) =>
    v.players.find((p) => p.id === owner)!.cards[index].revision;
  const swaps = v.swapHistory.filter(
    (e) => e.sequence > m.swaps && e.round === v.round,
  );
  for (const e of swaps) {
    const a = slotKey(e.actorId, e.actorIndex),
      b = slotKey(e.opponentId, e.opponentIndex),
      x = m.slots[a],
      y = m.slots[b],
      bx = m.beliefs[a],
      by = m.beliefs[b];
    delete m.slots[a];
    delete m.slots[b];
    delete m.beliefs[a];
    delete m.beliefs[b];
    if (x)
      m.slots[b] = {
        ...x,
        revision: newRevision(e.opponentId, e.opponentIndex),
      };
    if (y)
      m.slots[a] = { ...y, revision: newRevision(e.actorId, e.actorIndex) };
    if (bx) m.beliefs[b] = bx;
    if (by) m.beliefs[a] = by;
    moved.add(a);
    moved.add(b);
  }
  m.swaps = v.swapHistory.at(-1)?.sequence ?? m.swaps;
  if (action?.type === "replace" && action.indices) {
    const owner = action.actorId,
      selected = [...action.indices].sort((a, b) => a - b),
      removed = selected.slice(1),
      p = v.players.find((p) => p.id === owner)!;
    const failed = v.publicReveal?.owner === owner;
    if (!failed) {
      const oldSlots = { ...m.slots },
        oldBeliefs = { ...m.beliefs };
      for (const index of selected) {
        const card = oldSlots[slotKey(owner, index)]?.card;
        if (card) m.discardPile[card.id] = card;
      }
      for (const k of Object.keys(m.slots))
        if (k.startsWith(owner + "/")) delete m.slots[k];
      for (const k of Object.keys(m.beliefs))
        if (k.startsWith(owner + "/")) delete m.beliefs[k];
      for (const k of Object.keys(m.revisions).filter((k) =>
        k.startsWith(owner + "/"),
      )) {
        const oldIndex = Number(k.split("/").at(-1));
        if (selected.includes(oldIndex)) continue;
        const index = oldIndex - removed.filter((i) => i < oldIndex).length,
          key = slotKey(owner, index);
        if (!p.cards[index]) continue;
        if (oldSlots[k])
          m.slots[key] = { ...oldSlots[k], revision: p.cards[index].revision };
        if (oldBeliefs[k]) m.beliefs[key] = oldBeliefs[k];
        moved.add(key);
      }
      const index = selected[0],
        key = slotKey(owner, index);
      moved.add(key);
      if (m.held?.owner === owner)
        m.slots[key] = {
          card: m.held.card,
          revision: p.cards[index].revision,
          confidence: 1,
        };
      else if (owner !== id && v.discard) {
        const plausible = v.rules.cards.flatMap((c) =>
          c.points <= v.discard!.points
            ? Array<number>(c.copies).fill(c.points)
            : [],
        );
        if (plausible.length)
          m.beliefs[key] = {
            points: plausible.reduce((a, b) => a + b, 0) / plausible.length,
            confidence: 0.35,
          };
      }
    } else if (v.rules.variant === "official" && m.held?.owner === owner) {
      // Official failed matches retain the drawn card and may add a separate unseen penalty.
      const oldCount = Object.keys(m.revisions).filter((k) =>
        k.startsWith(owner + "/"),
      ).length;
      if (p.cards[oldCount]) {
        const k = slotKey(owner, oldCount);
        m.slots[k] = {
          card: m.held.card,
          revision: p.cards[oldCount].revision,
          confidence: 1,
        };
        moved.add(k);
      }
    }
  }
  const revisions: Record<string, number> = {};
  for (const p of v.players)
    for (const s of p.cards) {
      const k = slotKey(p.id, s.index);
      revisions[k] = s.revision;
      if (m.revisions[k] !== s.revision && !moved.has(k)) {
        delete m.slots[k];
        delete m.beliefs[k];
      }
      if (s.card) {
        m.slots[k] = {
          card: structuredClone(s.card),
          confidence: 1,
          revision: s.revision,
        };
        delete m.beliefs[k];
      }
    }
  if (v.reveal) {
    const p = v.players.find((p) => p.id === v.reveal!.owner)!,
      k = slotKey(p.id, v.reveal.index);
    m.slots[k] = {
      card: structuredClone(v.reveal.card),
      confidence: 1,
      revision: p.cards[v.reveal.index].revision,
    };
    delete m.beliefs[k];
  }
  for (const k of Object.keys(m.slots))
    if (!(k in revisions)) delete m.slots[k];
  for (const k of Object.keys(m.beliefs))
    if (!(k in revisions) || m.slots[k]?.card) delete m.beliefs[k];
  if (v.discard) m.discardPile[v.discard.id] = structuredClone(v.discard);
  if (v.phase !== "drawn") m.held = undefined;
  return {
    ...m,
    revisions,
    reshuffles: v.reshuffles,
    version: v.version,
    deckCount: v.deckCount,
    phase: v.phase,
    turn: v.turn,
    discard: v.discard ? structuredClone(v.discard) : undefined,
  };
}

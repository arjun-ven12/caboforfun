import { z } from "zod";
import { rulesSchema, type Rules, type CardDefinition } from "./rules";
export type Card = CardDefinition & { id: string };
export type Player = {
  id: string;
  hand: Card[];
  ready: boolean;
  inspected: number[];
};
export type Score = {
  id: string;
  raw: number;
  penalty: number;
  total: number;
  winner: boolean;
};
export type Game = {
  version: number;
  rules: Rules;
  players: Player[];
  deck: Card[];
  discard: Card[];
  phase:
    | "memory"
    | "turn"
    | "drawn"
    | "ability"
    | "lookSwap"
    | "roundOver"
    | "matchOver";
  turn: number;
  starter: number;
  forfeit?: string[];
  pausedAt?: number;
  drawn?: { card: Card; source: "deck" | "discard" };
  reveal?: { owner: string; index: number };
  caller?: string;
  finalTurns: string[];
  scores: Score[];
  totals: Record<string, number>;
  history: Score[][];
  deadline: number;
  round: number;
  faceUp: string[];
  resets: string[];
  publicReveal?: { owner: string; cards: { index: number; card: Card }[] };
};
const index = z.number().int().min(0).max(1023);
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("inspect"), indices: z.array(index).max(8) }),
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("draw"), source: z.enum(["deck", "discard"]) }),
  z.object({ type: z.literal("discard") }),
  z.object({
    type: z.literal("replace"),
    indices: z.array(index).min(1).max(4),
  }),
  z.object({ type: z.literal("activate") }),
  z.object({
    type: z.literal("target"),
    owner: z.string(),
    index,
    ownIndex: index.optional(),
  }),
  z.object({ type: z.literal("resolveSwap"), ownIndex: index.optional() }),
  z.object({ type: z.literal("finishAbility") }),
  z.object({ type: z.literal("cabo") }),
  z.object({ type: z.literal("nextRound") }),
  z.object({ type: z.literal("finishMatch") }),
]);
export type Command = z.infer<typeof commandSchema>;
export class GameError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
function requireGame(ok: unknown, code: string): asserts ok {
  if (!ok) throw new GameError(code);
}
export function createDeck(r: Rules): Card[] {
  return r.cards.flatMap((c) =>
    Array.from({ length: c.copies }, (_, i) => ({ ...c, id: `${c.key}:${i}` })),
  );
}
export function shuffle<T>(
  cards: T[],
  randomInt: (max: number) => number,
): T[] {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    requireGame(j >= 0 && j <= i && Number.isInteger(j), "INVALID_RANDOM");
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function startGame(
  ids: string[],
  rules: Rules,
  randomInt: (max: number) => number,
  now: number,
): Game {
  const r = rulesSchema.parse(structuredClone(rules));
  requireGame(
    new Set(ids).size === ids.length &&
      ids.length >= r.minPlayers &&
      ids.length <= r.maxPlayers,
    "PLAYER_COUNT",
  );
  const deck = shuffle(createDeck(r), randomInt);
  const players = ids.map((id) => ({
    id,
    hand: deck.splice(0, r.startingCards),
    ready: false,
    inspected: [],
  }));
  const starter = r.variant === "official" ? randomInt(ids.length) : 0;
  return {
    version: 1,
    rules: r,
    players,
    deck,
    discard: [deck.pop()!],
    phase: "memory",
    turn: starter,
    starter,
    finalTurns: [],
    scores: [],
    totals: Object.fromEntries(ids.map((id) => [id, 0])),
    history: [],
    deadline: now + r.memorySeconds * 1000,
    round: 1,
    faceUp: [],
    resets: [],
  };
}
export function scoreRound(g: Game): Score[] {
  const raw = g.players.map((p) => p.hand.reduce((n, c) => n + c.points, 0)),
    min = Math.min(...raw),
    caller = g.players.findIndex((p) => p.id === g.caller);
  if (g.rules.variant === "official") {
    const kamikaze = g.players.find(
      (p) =>
        p.hand.length === 4 &&
        p.hand.filter((c) => c.rank === "12").length === 2 &&
        p.hand.filter((c) => c.rank === "13").length === 2,
    );
    return g.players.map((p, i) => {
      const winner = kamikaze
        ? p.id === kamikaze.id
        : i === caller && raw[i] === min;
      const penalty =
        !kamikaze && i === caller && raw[i] > min ? g.rules.caboPenalty : 0;
      return {
        id: p.id,
        raw: raw[i],
        penalty,
        total: kamikaze ? (winner ? 0 : 50) : (winner ? 0 : raw[i]) + penalty,
        winner: kamikaze ? winner : raw[i] === min,
      };
    });
  }
  const winners = raw.map(
    (v, i) =>
      v === min &&
      (g.rules.tiePolicy === "allLowest" ||
        i === (caller >= 0 && raw[caller] === min ? caller : raw.indexOf(min))),
  );
  return g.players.map((p, i) => {
    const penalty = i === caller && raw[i] > min ? g.rules.caboPenalty : 0;
    return {
      id: p.id,
      raw: raw[i],
      penalty,
      total: (winners[i] ? 0 : raw[i]) + penalty,
      winner: winners[i],
    };
  });
}
function endRound(g: Game) {
  g.scores = scoreRound(g);
  g.history.push(g.scores);
  for (const s of g.scores) g.totals[s.id] += s.total;
  const r = g.rules;
  if (r.variant === "official") {
    for (const s of g.scores) {
      if (g.totals[s.id] === 100 && !g.resets.includes(s.id)) {
        g.totals[s.id] = 50;
        g.resets.push(s.id);
      }
    }
  }
  g.phase =
    r.mode === "quick" ||
    (r.mode === "bestOf3" &&
      (g.round >= 3 ||
        g.players.some(
          (p) =>
            g.history.filter((round) =>
              round.some((s) => s.id === p.id && s.winner),
            ).length >= 2,
        ))) ||
    (r.mode === "rounds" && g.round >= r.rounds) ||
    (r.mode === "threshold" &&
      Object.values(g.totals).some((n) =>
        r.variant === "official" ? n > r.threshold : n >= r.threshold,
      ))
      ? "matchOver"
      : "roundOver";
  delete g.drawn;
  delete g.reveal;
  delete g.publicReveal;
}
function endTurn(g: Game, now: number) {
  const actor = g.players[g.turn].id;
  delete g.drawn;
  delete g.reveal;
  if (g.caller) {
    g.finalTurns = g.finalTurns.filter((id) => id !== actor);
    if (!g.finalTurns.length) {
      endRound(g);
      return;
    }
  }
  if (g.rules.exhaustion === "endRound" && !g.deck.length) {
    endRound(g);
    return;
  }
  if (g.players.some((p) => p.hand.length === 0)) {
    endRound(g);
    return;
  }
  g.turn = (g.turn + 1) % g.players.length;
  g.phase = "turn";
  g.deadline = now + g.rules.turnSeconds * 1000;
}
function drawDeck(
  g: Game,
  randomInt: (max: number) => number,
): Card | undefined {
  if (!g.deck.length) {
    if (g.rules.exhaustion === "endRound" || g.discard.length < 2) {
      endRound(g);
      return;
    }
    const top = g.discard.pop()!;
    g.deck = shuffle(g.discard, randomInt);
    g.discard = [top];
  }
  return g.deck.pop();
}
export function transition(
  state: Game,
  actor: string,
  input: Command,
  randomInt: (max: number) => number,
  now: number,
): Game {
  const c = commandSchema.parse(input),
    g = structuredClone(state),
    p = g.players.find((p) => p.id === actor);
  requireGame(p, "NOT_MEMBER");
  requireGame(g.pausedAt === undefined, "GAME_PAUSED");
  if (c.type === "finishMatch") {
    requireGame(
      g.phase === "roundOver" && g.rules.mode === "unlimited",
      "WRONG_PHASE",
    );
    requireGame(actor === g.players[0].id, "HOST_ONLY");
    g.phase = "matchOver";
    g.version++;
    return g;
  }
  if (c.type === "nextRound") {
    requireGame(g.phase === "roundOver", "WRONG_PHASE");
    requireGame(actor === g.players[0].id, "HOST_ONLY");
    const next = startGame(
      g.players.map((p) => p.id),
      g.rules,
      randomInt,
      now,
    );
    const min = Math.min(...g.scores.map((s) => s.total));
    const nextStarter =
      g.rules.variant === "official"
        ? Array.from(
            { length: g.players.length },
            (_, i) => ((g.starter ?? 0) + i + 1) % g.players.length,
          ).find(
            (i) =>
              g.scores.find((s) => s.id === g.players[i].id)?.total === min,
          )!
        : g.round % g.players.length;
    return {
      ...next,
      version: g.version + 1,
      round: g.round + 1,
      turn: nextStarter,
      starter: nextStarter,
      totals: g.totals,
      history: g.history,
      resets: g.resets,
    };
  }
  if (c.type === "inspect") {
    requireGame(g.phase === "memory" && !p.ready, "WRONG_PHASE");
    requireGame(!p.inspected.length, "ALREADY_INSPECTED");
    requireGame(
      c.indices.length === g.rules.initialPeek &&
        new Set(c.indices).size === c.indices.length &&
        c.indices.every((i) => p.hand[i]),
      "INVALID_SELECTION",
    );
    p.inspected = c.indices;
  } else if (c.type === "ready") {
    requireGame(g.phase === "memory", "WRONG_PHASE");
    requireGame(p.inspected.length === g.rules.initialPeek, "INSPECT_FIRST");
    p.ready = true;
    if (g.players.every((p) => p.ready) && now >= g.deadline) {
      g.phase = "turn";
      g.deadline = now + g.rules.turnSeconds * 1000;
    }
  } else {
    requireGame(now < g.deadline, "TURN_EXPIRED");
    requireGame(g.players[g.turn].id === actor, "NOT_YOUR_TURN");
    if (c.type === "cabo") {
      requireGame(
        !g.caller &&
          (g.rules.caboTiming === "start"
            ? g.phase === "turn"
            : g.phase === "drawn" && g.drawn?.source === "deck"),
        "CANNOT_CALL",
      );
      if (g.drawn) g.discard.push(g.drawn.card);
      g.caller = actor;
      g.finalTurns = g.players.filter((p) => p.id !== actor).map((p) => p.id);
      endTurn(g, now);
    } else if (c.type === "draw") {
      requireGame(g.phase === "turn", "WRONG_PHASE");
      const card =
        c.source === "deck" ? drawDeck(g, randomInt) : g.discard.pop();
      if (card) {
        g.drawn = { card, source: c.source };
        g.phase = "drawn";
      } else
        requireGame(
          ["roundOver", "matchOver"].includes(g.phase),
          "EMPTY_DISCARD",
        );
      delete g.publicReveal;
    } else if (c.type === "discard") {
      requireGame(
        g.phase === "drawn" && g.drawn?.source === "deck",
        "CANNOT_DISCARD",
      );
      g.discard.push(g.drawn.card);
      endTurn(g, now);
    } else if (c.type === "replace") {
      requireGame(g.phase === "drawn" && g.drawn, "WRONG_PHASE");
      const ids = [...c.indices].sort((a, b) => a - b);
      requireGame(
        new Set(ids).size === ids.length && ids.every((i) => p.hand[i]),
        "INVALID_SELECTION",
      );
      requireGame(ids.length === 1 || g.rules.matching, "MATCHING_DISABLED");
      const cards = ids.map((i) => p.hand[i]);
      const valid = cards.every((card) =>
        g.rules.matchBy === "rank"
          ? card.rank === cards[0].rank
          : card.points === cards[0].points,
      );
      if (ids.length > 1 && !valid) {
        g.publicReveal = {
          owner: actor,
          cards: ids.map((index) => ({ index, card: p.hand[index] })),
        };
        if (g.rules.variant === "official") {
          g.faceUp.push(...cards.map((c) => c.id));
          p.hand.push(g.drawn.card);
          if (ids.length > 2) {
            const penalty = drawDeck(g, randomInt);
            if (penalty) p.hand.push(penalty);
            if (["roundOver", "matchOver"].includes(g.phase)) {
              g.version++;
              return g;
            }
          }
        } else g.discard.push(g.drawn.card);
        if (
          g.rules.variant !== "official" &&
          g.rules.failedMatch === "drawPenalty"
        ) {
          const penalty = drawDeck(g, randomInt);
          if (penalty) p.hand.push(penalty);
          if (["roundOver", "matchOver"].includes(g.phase)) {
            g.version++;
            return g;
          }
        }
      } else {
        g.discard.push(...cards);
        if (g.rules.variant === "official" && g.drawn.source === "discard")
          g.faceUp.push(g.drawn.card.id);
        p.hand[ids[0]] = g.drawn.card;
        for (const i of ids.slice(1).reverse()) p.hand.splice(i, 1);
      }
      endTurn(g, now);
    } else if (c.type === "activate") {
      requireGame(
        g.phase === "drawn" &&
          g.drawn?.source === "deck" &&
          g.rules.abilities &&
          g.drawn.card.ability !== "none",
        "NO_ABILITY",
      );
      g.phase = "ability";
    } else if (c.type === "target") {
      requireGame(g.phase === "ability" && g.drawn, "WRONG_PHASE");
      const target = g.players.find((p) => p.id === c.owner);
      requireGame(
        target &&
          target.hand[c.index] &&
          !g.faceUp.includes(target.hand[c.index].id),
        "INVALID_TARGET",
      );
      const ability = g.drawn.card.ability;
      requireGame(
        ability === "peekOwn" ? c.owner === actor : c.owner !== actor,
        "INVALID_TARGET",
      );
      if (ability === "blindSwap") {
        requireGame(
          c.ownIndex !== undefined && p.hand[c.ownIndex],
          "OWN_CARD_REQUIRED",
        );
        [p.hand[c.ownIndex], target.hand[c.index]] = [
          target.hand[c.index],
          p.hand[c.ownIndex],
        ];
        g.discard.push(g.drawn.card);
        endTurn(g, now);
      } else {
        requireGame(!g.reveal, "ALREADY_REVEALED");
        g.reveal = { owner: c.owner, index: c.index };
        if (
          ability === "lookSwap" ||
          (ability === "peekOpponent" && g.rules.peekOpponentCanSwap)
        )
          g.phase = "lookSwap";
      }
    } else if (c.type === "resolveSwap") {
      requireGame(g.phase === "lookSwap" && g.reveal && g.drawn, "WRONG_PHASE");
      if (c.ownIndex === undefined)
        requireGame(g.rules.optionalSwap, "SWAP_REQUIRED");
      else {
        requireGame(p.hand[c.ownIndex], "INVALID_SELECTION");
        const target = g.players.find((p) => p.id === g.reveal!.owner)!;
        [p.hand[c.ownIndex], target.hand[g.reveal.index]] = [
          target.hand[g.reveal.index],
          p.hand[c.ownIndex],
        ];
      }
      g.discard.push(g.drawn.card);
      endTurn(g, now);
    } else if (c.type === "finishAbility") {
      requireGame(g.phase === "ability" && g.reveal && g.drawn, "WRONG_PHASE");
      g.discard.push(g.drawn.card);
      endTurn(g, now);
    }
  }
  g.version++;
  return g;
}
// Server-only scheduler. No client can submit a timeout command.
export function expire(
  state: Game,
  randomInt: (max: number) => number,
  now: number,
): Game {
  const g = structuredClone(state);
  if (g.pausedAt !== undefined) return g;
  if (now < g.deadline || ["roundOver", "matchOver"].includes(g.phase))
    return g;
  if (g.phase === "memory") {
    if (!g.players.every((p) => p.ready)) return g;
    g.phase = "turn";
    g.deadline = now + g.rules.turnSeconds * 1000;
  } else {
    if (g.drawn) g.discard.push(g.drawn.card);
    endTurn(g, now);
  }
  g.version++;
  return g;
}
export function matchWinners(g: Game): string[] {
  if (g.forfeit)
    return g.players.filter((p) => !g.forfeit!.includes(p.id)).map((p) => p.id);
  if (g.rules.mode === "quick")
    return g.scores.filter((s) => s.winner).map((s) => s.id);
  let tied = g.players.map((p) => p.id);
  if (g.rules.mode === "bestOf3") {
    const wins = (id: string) =>
      g.history.filter((round) => round.some((s) => s.id === id && s.winner))
        .length;
    const max = Math.max(...tied.map(wins));
    tied = tied.filter((id) => wins(id) === max);
  } else {
    const min = Math.min(...Object.values(g.totals));
    tied = tied.filter((id) => g.totals[id] === min);
  }
  if (g.rules.variant === "official") {
    const min = Math.min(
      ...g.scores.filter((s) => tied.includes(s.id)).map((s) => s.total),
    );
    tied = tied.filter(
      (id) => g.scores.find((s) => s.id === id)?.total === min,
    );
  }
  return g.rules.tiePolicy === "seatOrder" ? tied.slice(0, 1) : tied;
}
export function playerView(g: Game, viewer: string) {
  requireGame(
    g.players.some((p) => p.id === viewer),
    "NOT_MEMBER",
  );
  const over = ["roundOver", "matchOver"].includes(g.phase),
    active = g.players[g.turn].id === viewer;
  return {
    version: g.version,
    forfeit: g.forfeit,
    pausedAt: g.pausedAt,
    winners: g.phase === "matchOver" ? matchWinners(g) : [],
    rules: g.rules,
    phase: g.phase,
    turn: g.players[g.turn].id,
    deadline: g.deadline,
    round: g.round,
    caller: g.caller,
    finalTurns: g.finalTurns,
    scores: g.scores,
    totals: g.totals,
    history: g.history,
    deckCount: g.deck.length,
    discard: g.discard.at(-1),
    drawn: active ? g.drawn : undefined,
    reveal:
      active && g.reveal
        ? {
            ...g.reveal,
            card: g.players.find((p) => p.id === g.reveal!.owner)!.hand[
              g.reveal.index
            ],
          }
        : undefined,
    publicReveal: g.publicReveal,
    players: g.players.map((p) => ({
      id: p.id,
      ready: p.ready,
      inspected: p.id === viewer ? p.inspected : undefined,
      cards: p.hand.map((card, index) => ({
        index,
        card:
          over ||
          g.faceUp.includes(card.id) ||
          (g.phase === "memory" &&
            p.id === viewer &&
            !p.ready &&
            p.inspected.includes(index))
            ? card
            : undefined,
      })),
    })),
  };
}
export type PlayerView = ReturnType<typeof playerView>;

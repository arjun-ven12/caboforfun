import { createDeck, type Command, type Card } from "./engine";
import type { BotObservation } from "./bot-observation";
import { personality, type BotConfig } from "./bot-difficulty";
export type BotDecision = { command: Command; reason: string; utility: number };
/** No Game/DB/network input. All probability modelling uses the permitted observation. */
export function decide(
  o: BotObservation,
  input: BotConfig,
  random: () => number,
): BotDecision | undefined {
  if (!o.legal.length) return;
  const c = personality(input),
    me = o.players.find((p) => p.id === o.id)!,
    knownIds = new Set([
      ...o.players.flatMap((p) =>
        p.cards.flatMap((s) => (s.known ? [s.known.id] : [])),
      ),
      ...o.discardHistory.map((c) => c.id),
      ...(o.drawn ? [o.drawn.card.id] : []),
    ]);
  const all = createDeck(o.rules),
    pool = all.filter((x) => !knownIds.has(x.id)),
    prior = all.reduce((s, c) => s + c.points, 0) / all.length;
  const unknown = pool.length ? pool : all,
    mean = unknown.reduce((s, c) => s + c.points, 0) / unknown.length,
    expected = prior * (1 - c.inference) + mean * c.inference;
  const value = (s: {
    known?: Card;
    estimate?: { points: number; confidence: number };
  }) =>
    s.known?.points ??
    (s.estimate
      ? expected +
        (s.estimate.points - expected) *
          s.estimate.confidence *
          c.awareness *
          c.inference
      : expected);
  const own = me.cards.map(value),
    opponents = o.players.filter((p) => p.id !== o.id),
    ownTotal = own.reduce((a, b) => a + b, 0);
  const others = opponents.map((p) =>
    p.cards.reduce((s, x) => s + value(x), 0),
  );
  const worst = Math.max(...own),
    ability = o.ability?.ability ?? o.drawn?.card.ability;
  // Bounded posterior samples; unknown physical cards are sampled without replacement from public composition.
  const samples = c.strategy >= 8 ? 96 : c.strategy >= 5 ? 32 : 8;
  let wins = 0;
  for (let n = 0; n < samples; n++) {
    const remaining = [...unknown];
    const pick = (slot: {
      estimate?: { points: number; confidence: number };
    }) => {
      let index = Math.floor(random() * remaining.length);
      if (
        slot.estimate &&
        random() < slot.estimate.confidence * c.awareness * c.inference
      ) {
        const other = Math.floor(random() * remaining.length);
        if (
          Math.abs(
            (remaining[other]?.points ?? expected) - slot.estimate.points,
          ) <
          Math.abs(
            (remaining[index]?.points ?? expected) - slot.estimate.points,
          )
        )
          index = other;
      }
      return remaining.splice(index, 1)[0]?.points ?? expected;
    };
    const totals = o.players.map((p) =>
        p.cards.reduce((s, x) => s + (x.known?.points ?? pick(x)), 0),
      ),
      my = totals[o.players.findIndex((p) => p.id === o.id)];
    if (my <= Math.min(...totals)) wins++;
  }
  const bonusEligible =
    o.rules.activateSwappedOutAbilities &&
    (o.ability?.origin !== "bonus" || o.rules.chainSwapBonuses) &&
    (o.ability?.depth ?? 0) < o.rules.maxBonusActions;
  const success = wins / samples,
    info = (1.5 + c.strategy * 0.25) * c.special;
  const ranked = o.legal.map((command) => {
    let utility = -1000,
      reason = "Choose a valid action.";
    switch (command.type) {
      case "inspect":
        utility = 0;
        reason = "Remember starting cards.";
        break;
      case "ready":
      case "finishAbility":
        utility = 0;
        reason = "Finish the private observation.";
        break;
      case "nextRound":
        utility = 0;
        reason = "Start the next round.";
        break;
      case "finishMatch":
        utility = o.round >= 100 ? 100 : -1000;
        break;
      case "draw":
        utility =
          command.source === "deck"
            ? 0
            : worst - (o.discard?.points ?? expected) - 0.35;
        reason =
          command.source === "deck"
            ? "Draw for information and possible improvement."
            : "The visible discard can improve the expected hand.";
        break;
      case "cabo": {
        const threshold = 0.98 - c.cabo * 0.16 - c.risk * 0.04,
          urgency = Math.min(0.45, o.turns / 240);
        const stakes =
          o.rules.caboPenalty +
          (o.rules.variant === "official" ? ownTotal : Math.max(0, ownTotal));
        utility =
          (success - threshold + urgency) * 20 +
          (Math.min(...others) - ownTotal) * 0.08 * c.awareness -
          (1 - success) * stakes * 0.12 +
          (o.rules.mode === "threshold" &&
          (o.totals[o.id] ?? 0) > o.rules.threshold * 0.8
            ? -1
            : 0);
        reason = `Estimated lowest-hand probability ${Math.round(success * 100)}%; failed-call penalty ${o.rules.caboPenalty}.`;
        break;
      }
      case "replace": {
        const selected = command.indices.map(
          (i) => me.cards.find((s) => s.index === i)!,
        );
        const match =
          selected.every((s) => s.known) &&
          selected.every((s) =>
            o.rules.matchBy === "rank"
              ? s.known!.rank === selected[0].known!.rank
              : s.known!.points === selected[0].known!.points,
          );
        if (selected.length > 1 && !match) {
          utility = -10000;
          reason = "Uncertain matching is too risky.";
          break;
        }
        utility =
          selected.reduce((s, x) => s + value(x), 0) -
          (o.drawn?.card.points ?? expected);
        reason = "Reduce expected hand points with a confirmed replacement.";
        break;
      }
      case "discard":
        utility = 0;
        reason = "Keeping the draw would not improve the hand.";
        break;
      case "activate": {
        if (ability === "peekOwn")
          utility = me.cards.filter((s) => !s.known).length ? info : 0;
        else if (ability === "peekOpponent")
          utility =
            info *
              c.awareness *
              (opponents.some((p) => p.cards.some((s) => !s.known)) ? 1 : 0.1) +
            (o.rules.peekOpponentCanSwap
              ? Math.max(
                  0,
                  worst -
                    Math.min(
                      ...others.map((n, i) => n / opponents[i].cards.length),
                    ),
                )
              : 0);
        else
          utility =
            Math.max(
              0,
              ...opponents.flatMap((p) => p.cards.map((s) => worst - value(s))),
            ) +
            info * 0.45;
        utility -= 0.3;
        reason = "The information or exchange is worth more than this draw.";
        break;
      }
      case "target": {
        const p = o.players.find((p) => p.id === command.owner)!,
          s = p.cards.find((s) => s.index === command.index)!;
        if (ability === "blindSwap") {
          const outgoing = me.cards.find((s) => s.index === command.ownIndex)!;
          utility =
            value(outgoing) -
            value(s) +
            c.aggression * c.awareness * (value(outgoing) - value(s)) * 0.4 +
            (bonusEligible &&
            outgoing.known?.ability !== "none" &&
            outgoing.known
              ? info * 0.3
              : 0);
          if (!outgoing.known) utility += (c.risk - 0.5) * 0.5;
          reason =
            "Exchange the highest expected own card for a better opponent card.";
        } else {
          utility = s.known
            ? -1
            : info + (command.owner === o.id ? 0.5 : c.awareness * 0.5);
          if (ability === "lookSwap" || o.rules.peekOpponentCanSwap)
            utility += Math.max(0, worst - value(s));
          reason = "Inspect an uncertain card before making further decisions.";
        }
        break;
      }
      case "resolveSwap": {
        const outgoing = me.cards.find((s) => s.index === command.ownIndex);
        utility =
          command.ownIndex === undefined
            ? 0
            : value(outgoing!) -
              (o.reveal?.card.points ?? expected) +
              (bonusEligible &&
              outgoing?.known &&
              outgoing.known.ability !== "none"
                ? info * 0.3
                : 0);
        reason =
          command.ownIndex === undefined
            ? "Keep the current cards; swapping has no expected benefit."
            : "Exchange after comparing the inspected card with the expected outgoing value.";
        break;
      }
    }
    // Bounded uncertainty represents decision quality; never alters action legality.
    utility += (random() - 0.5) * c.randomness * (1 + (11 - c.strategy) * 0.7);
    return { command, utility, reason };
  });
  ranked.sort((a, b) => b.utility - a.utility);
  return ranked[0];
}

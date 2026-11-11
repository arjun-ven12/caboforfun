import React, { useState, useEffect } from "react";
import { View, Modal } from "react-native";
import type { PlayerView, Command } from "@cabo/shared";
import { Button, Card, Panel, Row, Txt, useTheme } from "./ui";
export function Table({
  game: g,
  userId,
  names,
  send,
  busy,
}: {
  game: PlayerView;
  userId: string;
  names: Record<string, string>;
  send: (c: Command) => void;
  busy: boolean;
}) {
  const c = useTheme(),
    [selected, setSelected] = useState<number[]>([]),
    [target, setTarget] = useState<{ owner: string; index: number }>(),
    [time, setTime] = useState(Date.now());
  const me = g.players.find((p) => p.id === userId)!,
    active = g.turn === userId,
    ability = g.drawn?.card.ability,
    over = ["roundOver", "matchOver"].includes(g.phase);
  useEffect(() => {
    setSelected([]);
    setTarget(undefined);
  }, [g.version]);
  useEffect(() => {
    const id = setInterval(() => setTime(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  function toggle(i: number) {
    setSelected((a) => (a.includes(i) ? a.filter((n) => n !== i) : [...a, i]));
  }
  function pickOwn(index: number) {
    if (g.phase === "ability" && ability === "peekOwn")
      setTarget({ owner: userId, index });
    else toggle(index);
  }
  const targetLabel = target
    ? `${names[target.owner] || "Player"} · card ${target.index + 1}`
    : "";
  return (
    <View style={{ gap: 22 }}>
      {g.pausedAt && (
        <Panel>
          <Txt>The table is paused until everyone reconnects.</Txt>
        </Panel>
      )}
      <Row>
        <Txt size={11} muted style={{ letterSpacing: 2 }}>
          ROUND {g.round}
        </Txt>
        <Txt size={12} muted>
          {over
            ? "Round complete"
            : `${Math.max(0, Math.ceil((g.deadline - time) / 1000))}s`}
        </Txt>
      </Row>
      <View style={{ gap: 16 }}>
        {g.players
          .filter((p) => p.id !== userId)
          .map((p) => (
            <Panel
              key={p.id}
              style={{
                padding: 14,
                borderColor: p.id === g.turn ? c.accent : c.line,
              }}
            >
              <Row>
                <Txt size={14} style={{ fontWeight: "600" }}>
                  {names[p.id] || "Player"}{" "}
                  {p.id === g.turn && !over ? "· their turn" : ""}
                </Txt>
                <Txt size={12} muted>
                  {p.cards.length} cards
                </Txt>
              </Row>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {p.cards.map((slot) => (
                  <Card
                    small
                    key={slot.index}
                    card={slot.card}
                    selected={
                      target?.owner === p.id && target.index === slot.index
                    }
                    label={`${names[p.id] || "Opponent"}, card ${slot.index + 1}${slot.card ? `, ${slot.card.rank}` : ""}`}
                    onPress={
                      active &&
                      g.phase === "ability" &&
                      ability !== "peekOwn" &&
                      !g.reveal
                        ? () => setTarget({ owner: p.id, index: slot.index })
                        : undefined
                    }
                  />
                ))}
              </View>
            </Panel>
          ))}
      </View>
      {!over && (
        <View style={{ alignItems: "center", gap: 14, paddingVertical: 6 }}>
          <Txt size={19} style={{ fontWeight: "500" }}>
            {g.phase === "memory"
              ? "A moment to remember."
              : active
                ? "Your turn."
                : `${names[g.turn] || "Your friend"} is thinking.`}
          </Txt>
          <View style={{ flexDirection: "row", gap: 26, alignItems: "center" }}>
            <View style={{ gap: 7, alignItems: "center" }}>
              <Card
                onPress={
                  active && g.phase === "turn" && !busy
                    ? () => send({ type: "draw", source: "deck" })
                    : undefined
                }
                label={`Draw pile, ${g.deckCount} cards`}
              />
              <Txt size={11} muted>
                DRAW · {g.deckCount}
              </Txt>
            </View>
            <View style={{ gap: 7, alignItems: "center" }}>
              <Card
                card={g.discard}
                onPress={
                  active && g.phase === "turn" && g.discard && !busy
                    ? () => send({ type: "draw", source: "discard" })
                    : undefined
                }
                label="Take the top discard card"
              />
              <Txt size={11} muted>
                DISCARD
              </Txt>
            </View>
          </View>
          {g.caller && (
            <Txt size={12} muted>
              {names[g.caller]} called Cabo · {g.finalTurns.length} final turns
            </Txt>
          )}
        </View>
      )}
      {g.publicReveal && (
        <Panel>
          <Txt size={13}>The cards did not match. The turn has ended.</Txt>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {g.publicReveal.cards.map((s) => (
              <Card small key={s.index} card={s.card} />
            ))}
          </View>
        </Panel>
      )}
      <View style={{ gap: 16 }}>
        <Row>
          <Txt size={13} style={{ fontWeight: "600" }}>
            YOUR CARDS
          </Txt>
          <Txt size={12} muted>
            {me.ready && g.phase === "memory"
              ? "Ready"
              : selected.length
                ? `${selected.length} selected`
                : "Tap to select"}
          </Txt>
        </Row>
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {me.cards.map((slot) => (
            <Card
              key={slot.index}
              card={slot.card}
              selected={
                selected.includes(slot.index) ||
                (target?.owner === userId && target.index === slot.index)
              }
              label={`Your card ${slot.index + 1}${slot.card ? `, ${slot.card.rank}` : ""}`}
              onPress={
                !busy &&
                !over &&
                ((!me.ready && g.phase === "memory") || active)
                  ? () => pickOwn(slot.index)
                  : undefined
              }
            />
          ))}
        </View>
      </View>
      {g.phase === "memory" && !me.ready && (
        <Panel>
          <Txt muted size={14}>
            {me.inspected?.length
              ? "Remember these cards, then turn them over."
              : `Select exactly ${g.rules.initialPeek} of your cards to privately inspect.`}
          </Txt>
          {me.inspected?.length || g.rules.initialPeek === 0 ? (
            <Button
              title="Ready · hide my cards"
              busy={busy}
              onPress={() => send({ type: "ready" })}
            />
          ) : (
            <Button
              title={`Look at ${g.rules.initialPeek} cards`}
              disabled={selected.length !== g.rules.initialPeek}
              busy={busy}
              onPress={() => send({ type: "inspect", indices: selected })}
            />
          )}
        </Panel>
      )}
      {active &&
        (g.rules.caboTiming === "start"
          ? g.phase === "turn"
          : g.phase === "drawn" && g.drawn?.source === "deck") &&
        !g.caller && (
          <Button
            secondary
            title={
              g.rules.caboTiming === "start"
                ? "Call Cabo · no draw, final turns begin"
                : "Call Cabo · discard draw, final turns begin"
            }
            disabled={busy}
            onPress={() => send({ type: "cabo" })}
          />
        )}
      {active && g.phase === "drawn" && g.drawn && (
        <Panel>
          <Row>
            <View>
              <Txt size={11} muted>
                YOU DREW
              </Txt>
              <Txt size={18}>
                {g.drawn.card.rank} · {g.drawn.card.points} points
              </Txt>
            </View>
            <Card small card={g.drawn.card} />
          </Row>
          <Txt size={13} muted>
            {selected.length
              ? `Replace your selected ${selected.length} card${selected.length === 1 ? "" : "s"}? ${selected.length > 1 ? "All selected cards must match." : ""}`
              : "Select cards in your hand to replace, or choose an action."}
          </Txt>
          <Button
            title={
              selected.length > 1
                ? `Confirm ${selected.length}-card match`
                : "Confirm replacement"
            }
            disabled={
              !selected.length ||
              busy ||
              (selected.length > 1 && !g.rules.matching) ||
              selected.length > 4
            }
            onPress={() => send({ type: "replace", indices: selected })}
          />
          {g.drawn.source === "deck" && (
            <>
              <Button
                secondary
                title="Discard · end turn"
                disabled={busy}
                onPress={() => send({ type: "discard" })}
              />
              {g.rules.abilities && ability !== "none" && (
                <Button
                  secondary
                  title={`Use ${ability === "peekOwn" ? "Peek Own" : ability === "peekOpponent" ? "Peek Opponent" : ability === "blindSwap" ? "Blind Swap" : "Look and Swap"}`}
                  disabled={busy}
                  onPress={() => send({ type: "activate" })}
                />
              )}
            </>
          )}
        </Panel>
      )}
      {active && g.phase === "ability" && !g.reveal && (
        <Panel>
          <Txt size={15}>
            {ability === "peekOwn"
              ? "Select one of your own cards."
              : ability === "blindSwap"
                ? "Select an opponent’s card and one of yours. You will swap without seeing either."
                : "Select an opponent’s card to privately inspect."}
          </Txt>
          {target && (
            <Txt muted size={13}>
              Selected: {targetLabel}
            </Txt>
          )}
          <Button
            title={
              ability === "blindSwap"
                ? "Confirm blind swap"
                : "Privately reveal selected card"
            }
            disabled={
              !target ||
              busy ||
              (ability === "blindSwap" && selected.length !== 1)
            }
            onPress={() =>
              target &&
              send({
                type: "target",
                ...target,
                ...(ability === "blindSwap" ? { ownIndex: selected[0] } : {}),
              })
            }
          />
        </Panel>
      )}
      <Modal
        transparent
        visible={active && !!g.reveal && g.phase === "ability"}
        animationType="fade"
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            padding: 32,
            backgroundColor: "#101B15CC",
          }}
        >
          <Panel>
            <Txt size={21}>For your eyes only.</Txt>
            <View style={{ alignItems: "center", padding: 20 }}>
              <Card card={g.reveal?.card} />
            </View>
            <Txt muted>
              Remember it. This card stays hidden from everyone else.
            </Txt>
            <Button
              title="Done · hide card"
              busy={busy}
              onPress={() => send({ type: "finishAbility" })}
            />
          </Panel>
        </View>
      </Modal>
      {active && g.phase === "lookSwap" && g.reveal && (
        <Panel>
          <Txt size={21}>Keep it, or make a move.</Txt>
          <Row>
            <Card card={g.reveal.card} />
            <Txt size={14} muted>
              Only you can see this card.
            </Txt>
          </Row>
          <Txt size={14} muted>
            Select one of your own cards to swap, or keep both hands as they
            are.
          </Txt>
          {g.rules.optionalSwap && (
            <Button
              secondary
              title="Keep as is"
              disabled={busy}
              onPress={() => send({ type: "resolveSwap" })}
            />
          )}
          <Button
            title="Swap with selected card"
            disabled={selected.length !== 1 || busy}
            onPress={() => send({ type: "resolveSwap", ownIndex: selected[0] })}
          />
        </Panel>
      )}
      {over && (
        <Panel>
          <Txt size={25}>
            {g.phase === "matchOver"
              ? "A game well played."
              : "The cards are on the table."}
          </Txt>
          {g.forfeit && (
            <Txt muted>
              The match ended after{" "}
              {g.forfeit.map((id) => names[id] || "a player").join(", ")}{" "}
              exceeded the disconnection grace period.
            </Txt>
          )}
          {g.phase === "matchOver" && (
            <Txt>
              Winner{g.winners.length === 1 ? "" : "s"}:{" "}
              {g.winners.map((id) => names[id] || "Player").join(", ") ||
                "No remaining players"}
            </Txt>
          )}
          {g.scores.map((s) => (
            <View key={s.id} style={{ gap: 4, paddingVertical: 6 }}>
              <Row>
                <Txt style={{ fontWeight: s.winner ? "700" : "400" }}>
                  {s.winner ? "✧ " : ""}
                  {names[s.id] || "Player"}
                </Txt>
                <Txt>
                  {s.raw} hand · {s.total} round
                </Txt>
              </Row>
              <Txt size={12} muted>
                {s.penalty ? `+${s.penalty} failed Cabo penalty · ` : ""}
                {g.totals[s.id]} match points
              </Txt>
            </View>
          ))}
          {g.phase === "roundOver" &&
            g.rules.mode === "unlimited" &&
            g.players[0].id === userId && (
              <Button
                secondary
                title="Finish this match"
                busy={busy}
                onPress={() => send({ type: "finishMatch" })}
              />
            )}
          {g.phase === "roundOver" && g.players[0].id === userId && (
            <Button
              title="Deal the next round"
              busy={busy}
              onPress={() => send({ type: "nextRound" })}
            />
          )}
        </Panel>
      )}
    </View>
  );
}

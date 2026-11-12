import React, { useState, useEffect } from "react";
import { View, Switch, Share, Alert } from "react-native";
import Slider from "@react-native-community/slider";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  presets,
  customRules,
  rulesSchema,
  decodeRules,
  encodeRules,
  type Rules,
  type Ability,
} from "@cabo/shared";
import { api, queryClient } from "../src/client";
import {
  Screen,
  Title,
  Txt,
  Panel,
  Row,
  Button,
  Field,
  ErrorText,
  useTheme,
} from "../src/ui";
function IntegerField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <Field
      label={label}
      value={text}
      keyboardType="numbers-and-punctuation"
      onChangeText={setText}
      onEndEditing={() => {
        if (/^-?\d+$/.test(text)) onCommit(Number(text));
        else setText(String(value));
      }}
    />
  );
}
const powers: Ability[] = [
  "none",
  "peekOwn",
  "peekOpponent",
  "blindSwap",
  "lookSwap",
];
const labels: Record<Ability, string> = {
  none: "None",
  peekOwn: "Peek Own",
  peekOpponent: "Peek Opponent",
  blindSwap: "Blind Swap",
  lookSwap: "Look & Swap",
};
const numbers: [keyof Rules, string, number, number][] = [
  ["maxBonusActions", "Maximum bonus actions per turn", 1, 8],
  ["startingCards", "Starting cards", 1, 8],
  ["initialPeek", "Initially inspected", 0, 8],
  ["memorySeconds", "Memorization seconds", 0, 120],
  ["minPlayers", "Minimum players", 2, 5],
  ["maxPlayers", "Maximum players", 2, 5],
  ["caboPenalty", "Failed Cabo penalty", 0, 100],
  ["turnSeconds", "Seconds per turn", 10, 300],
  ["disconnectSeconds", "Disconnection grace seconds", 10, 600],
  ["rounds", "Number of rounds", 1, 100],
  ["threshold", "Match point threshold", 1, 1000],
];
function Summary({ r }: { r: Rules }) {
  return (
    <Panel>
      <Txt size={22}>{r.name}</Txt>
      <Txt muted>
        {r.cards.reduce((n, c) => n + c.copies, 0)} cards · {r.minPlayers}–
        {r.maxPlayers} players · {r.startingCards} cards each
      </Txt>
      <Txt muted>
        Inspect {r.initialPeek} · {r.memorySeconds}s memory · {r.turnSeconds}s
        turns · {r.disconnectSeconds}s grace
      </Txt>
      <Txt muted>
        Match: {r.mode} · {r.rounds} rounds · {r.threshold} point threshold
      </Txt>
      <Txt muted>
        Matching {r.matching ? `by ${r.matchBy}` : "disabled"} · Incorrect:{" "}
        {r.failedMatch} · Failed Cabo: +{r.caboPenalty} · Ties: {r.tiePolicy} ·
        Exhaustion: {r.exhaustion}
      </Txt>
      <Txt muted>
        Cabo timing: {r.caboTiming}. Card powers from a deck draw
        {r.activateSwappedOutAbilities ? " and outgoing swap cards" : " only"}.
        Bonus chaining{" "}
        {r.chainSwapBonuses
          ? `enabled, maximum ${r.maxBonusActions}`
          : "disabled"}
        . Inspected look-and-swap cards{" "}
        {r.optionalSwap ? "may optionally" : "must"} be swapped. Extended
        absence{" "}
        {r.disconnectPolicy === "pause"
          ? "pauses the table until everyone reconnects"
          : "forfeits the match"}
        .
      </Txt>
      {r.variant === "official" && (
        <Txt muted>
          2019 numbered rules: discard exchanges stay face up; failed matching
          adds the drawn card and an extra card for attempts of 3+. Only a
          successful caller scores zero. Two 12s and two 13s trigger Kamikaze.
          Exactly 100 resets to 50 once; exceeding 100 ends the match.
        </Txt>
      )}
      {r.cards.map((c) => (
        <Txt key={c.key} size={12} muted>
          {c.rank} {c.suit} · {c.points} points · {labels[c.ability]} · ×
          {c.copies}
        </Txt>
      ))}
    </Panel>
  );
}
export default function RulesEditor() {
  const { roomId, readOnly } = useLocalSearchParams<{
      roomId?: string;
      readOnly?: string;
    }>(),
    readonly = readOnly === "1",
    theme = useTheme();
  const q = useQuery({ queryKey: ["rules"], queryFn: () => api("/rules") }),
    room = useQuery({
      queryKey: ["room", roomId],
      queryFn: () => api(`/rooms/${roomId}`),
      enabled: !!roomId,
    });
  const [r, setR] = useState<Rules>(structuredClone(customRules)),
    [filter, setFilter] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(readonly),
    [groupPoints, setGroupPoints] = useState("0");
  useEffect(() => {
    if (room.data?.rules) setR(room.data.rules);
  }, [room.data?.rules]);
  function update(patch: Partial<Rules>) {
    setR((old) => ({ ...old, ...patch }));
  }
  async function run(fn: () => Promise<any>) {
    setBusy(true);
    setError(undefined);
    try {
      rulesSchema.parse(r);
      await fn();
      await queryClient.invalidateQueries({ queryKey: ["rules"] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const query = filter.trim().toLowerCase();
  const rankQuery = r.cards.some((c) => c.rank.toLowerCase() === query);
  const filtered = r.cards.filter((c) =>
    rankQuery
      ? c.rank.toLowerCase() === query
      : `${c.rank} ${c.suit} ${c.key} ${["hearts", "diamonds"].includes(c.suit) ? "red" : ["spades", "clubs"].includes(c.suit) ? "black" : "colorless"}`
          .toLowerCase()
          .includes(query),
  );
  const options = (key: keyof Rules, values: string[]) => (
    <Row>
      {values.map((value) => (
        <Button
          key={value}
          title={value.replace(/([A-Z])/g, " $1")}
          secondary={r[key] !== value}
          disabled={readonly}
          onPress={() => update({ [key]: value })}
        />
      ))}
    </Row>
  );
  return (
    <Screen>
      <Title
        eyebrow={readonly ? "Immutable table rules" : "Make it your game"}
        title={
          readonly ? "The rules at this table." : "Your table. Your rules."
        }
        detail="A complete, validated rules snapshot is locked when the match begins."
      />
      <ErrorText error={error || q.error || room.error} />
      {!readonly && (
        <>
          <Txt size={20}>Restore a preset</Txt>
          {presets.map((p) => (
            <Button
              secondary
              key={p.name}
              title={p.name}
              onPress={() => setR(structuredClone(p))}
            />
          ))}
          {q.data?.saved?.map((p: any) => (
            <Panel key={p.id}>
              <Txt>{p.name}</Txt>
              <Button
                secondary
                title="Load / duplicate"
                onPress={() =>
                  setR({ ...p.versions[0].rules, name: `${p.name} copy` })
                }
              />
              <Button
                secondary
                title="Overwrite with current rules & name"
                disabled={busy}
                onPress={() => void run(() => api(`/rules/${p.id}`, r, "PUT"))}
              />
              <Button
                secondary
                title="Delete saved preset"
                disabled={busy}
                onPress={() =>
                  Alert.alert("Delete preset?", p.name, [
                    { text: "Cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: () =>
                        void run(() =>
                          api(`/rules/${p.id}`, undefined, "DELETE"),
                        ),
                    },
                  ])
                }
              />
            </Panel>
          ))}
        </>
      )}
      <Button
        secondary
        title={preview ? "Edit rules" : "Preview complete summary"}
        onPress={() => setPreview(!preview)}
        disabled={readonly}
      />
      {preview ? (
        <Summary r={r} />
      ) : (
        <>
          <Field
            label="Preset name"
            value={r.name}
            onChangeText={(name) => update({ name })}
          />
          <Txt size={21}>Round & table</Txt>
          {numbers.map(([key, label, min, max]) => (
            <Panel key={key}>
              <Row>
                <Txt>{label}</Txt>
                <Txt>{String(r[key])}</Txt>
              </Row>
              <Slider
                accessibilityLabel={label}
                minimumValue={min}
                maximumValue={max}
                step={1}
                value={r[key] as number}
                minimumTrackTintColor={theme.accent}
                onSlidingComplete={(value) => update({ [key]: value })}
              />
            </Panel>
          ))}
          <Txt>Match format</Txt>
          {options("mode", [
            "quick",
            "bestOf3",
            "rounds",
            "threshold",
            "unlimited",
          ])}
          {(
            [
              "matching",
              "abilities",
              "activateSwappedOutAbilities",
              "chainSwapBonuses",
              "optionalSwap",
              "peekOpponentCanSwap",
            ] as const
          ).map((key) => (
            <Row key={key}>
              <Txt>
                {key === "matching"
                  ? "Allow matching replacements"
                  : key === "abilities"
                    ? "Enable card powers"
                    : key === "activateSwappedOutAbilities"
                      ? "Activate swapped-out card abilities"
                      : key === "chainSwapBonuses"
                        ? "Allow bounded bonus-action chaining"
                        : key === "peekOpponentCanSwap"
                          ? "Opponent peeks can become swaps"
                          : "Optional swap after looking"}
              </Txt>
              <Switch
                accessibilityLabel={key}
                value={r[key]}
                onValueChange={(v) => update({ [key]: v })}
              />
            </Row>
          ))}
          <Txt>Cabo-call timing</Txt>
          {options("caboTiming", ["start", "afterDeckDraw"])}
          <Txt>Match cards by</Txt>
          {options("matchBy", ["rank", "points"])}
          <Txt>Incorrect-match penalty</Txt>
          {options("failedMatch", ["discard", "drawPenalty"])}
          <Txt>Non-caller ties</Txt>
          {options("tiePolicy", ["allLowest", "seatOrder"])}
          <Txt>After disconnection grace expires</Txt>
          {options("disconnectPolicy", ["forfeitMatch", "pause"])}
          <Txt>Draw pile exhaustion</Txt>
          {options("exhaustion", ["reshuffle", "endRound"])}
          <Txt size={21}>Deck & card powers</Txt>
          <Txt muted size={13}>
            Search a rank, suit, red, or black. Apply point values to all
            filtered rows, or edit each card. Copies controls deck count and
            Jokers. Zero removes a card; validation checks the remaining deck.
          </Txt>
          <Field label="Filter cards" value={filter} onChangeText={setFilter} />
          <Row>
            <Field
              label="Group points"
              value={groupPoints}
              onChangeText={setGroupPoints}
              keyboardType="numbers-and-punctuation"
            />
            <Button
              secondary
              title="Apply to filtered cards"
              onPress={() => {
                const points = Number(groupPoints);
                if (!Number.isInteger(points) || points < -20 || points > 100) {
                  setError(
                    new Error("Point value must be an integer from -20 to 100"),
                  );
                  return;
                }
                const keys = new Set(filtered.map((c) => c.key));
                update({
                  cards: r.cards.map((c) =>
                    keys.has(c.key) ? { ...c, points } : c,
                  ),
                });
              }}
            />
          </Row>
          <Row>
            <Button
              secondary
              title="Add Joker"
              onPress={() => {
                const j = r.cards.find((c) => c.key === "joker");
                update({
                  cards: j
                    ? r.cards.map((c) =>
                        c.key === "joker"
                          ? { ...c, copies: Math.min(8, c.copies + 1) }
                          : c,
                      )
                    : [
                        ...r.cards,
                        {
                          key: "joker",
                          rank: "★",
                          suit: "none",
                          points: -1,
                          ability: "none",
                          copies: 1,
                        },
                      ],
                });
              }}
            />
            <Button
              secondary
              title="Double deck copies"
              onPress={() =>
                update({
                  cards: r.cards.map((c) => ({
                    ...c,
                    copies: Math.min(8, c.copies * 2),
                  })),
                })
              }
            />
          </Row>
          {filtered.map((card) => (
            <Panel key={card.key}>
              <Row>
                <Txt style={{ fontWeight: "600" }}>
                  {card.rank} · {card.suit}
                </Txt>
                <Button
                  secondary
                  title="Remove"
                  onPress={() =>
                    update({ cards: r.cards.filter((c) => c.key !== card.key) })
                  }
                />
              </Row>
              <Row>
                <IntegerField
                  label="Points"
                  value={card.points}
                  onCommit={(points) =>
                    update({
                      cards: r.cards.map((c) =>
                        c.key === card.key ? { ...c, points } : c,
                      ),
                    })
                  }
                />
                <IntegerField
                  label="Copies (0 removes)"
                  value={card.copies}
                  onCommit={(copies) =>
                    update({
                      cards:
                        copies === 0
                          ? r.cards.filter((c) => c.key !== card.key)
                          : r.cards.map((c) =>
                              c.key === card.key ? { ...c, copies } : c,
                            ),
                    })
                  }
                />
              </Row>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {powers.map((power) => (
                  <Button
                    key={power}
                    title={labels[power]}
                    secondary={card.ability !== power}
                    onPress={() =>
                      update({
                        cards: r.cards.map((c) =>
                          c.key === card.key ? { ...c, ability: power } : c,
                        ),
                      })
                    }
                  />
                ))}
              </View>
            </Panel>
          ))}
          <Button
            secondary
            title="Reset to My Custom Cabo"
            onPress={() => setR(structuredClone(customRules))}
          />
        </>
      )}
      {!readonly && (
        <>
          <Button
            title="Save as a custom preset"
            busy={busy}
            onPress={() => void run(() => api("/rules", r))}
          />
          {roomId && (
            <Button
              title="Apply to lobby · reset readiness"
              busy={busy}
              onPress={() =>
                void run(async () => {
                  await api(`/rooms/${roomId}/rules`, r, "PUT");
                  router.back();
                })
              }
            />
          )}
          <Button
            secondary
            title="Share validated rules code"
            onPress={() => {
              try {
                void Share.share({ message: encodeRules(r) });
              } catch (e) {
                setError(e);
              }
            }}
          />
          <Field
            label="Paste a rules code to import"
            value={code}
            onChangeText={setCode}
            multiline
            maxLength={32000}
          />
          <Button
            secondary
            title="Validate & import code"
            onPress={() => {
              try {
                setR(decodeRules(code));
                setError(undefined);
              } catch (e) {
                setError(e);
              }
            }}
          />
        </>
      )}
    </Screen>
  );
}

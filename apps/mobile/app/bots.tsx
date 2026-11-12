import React, { useState } from "react";
import { View, Switch, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  customRules,
  presets,
  botNames,
  botPresets,
  type BotConfig,
} from "@cabo/shared";
import { api, queryClient } from "../src/client";
import {
  Screen,
  Title,
  Panel,
  Txt,
  Row,
  Button,
  ErrorText,
  Loading,
} from "../src/ui";
import { BotAvatar } from "../src/bot-avatar";
import { BotEditor } from "../src/bot-editor";
export default function Bots() {
  const { roomId } = useLocalSearchParams<{ roomId?: string }>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [fast, setFast] = useState(false),
    [practice, setPractice] = useState(false),
    [speed, setSpeed] = useState(1),
    [bots, setBots] = useState<{ name: string; config: BotConfig }[]>([
      { name: "Nova", config: { ...botPresets.intermediate } },
    ]);
  const [rules, setRules] = useState(customRules);
  const [editing, setEditing] = useState<string>(),
    [draft, setDraft] = useState({
      name: "Nova",
      config: { ...botPresets.intermediate },
    });
  const room = useQuery({
      queryKey: ["room", roomId],
      queryFn: () => api(`/rooms/${roomId}`),
      enabled: !!roomId,
    }),
    saved = useQuery({
      queryKey: ["bot-presets"],
      queryFn: () => api("/bots/presets"),
    });
  async function run(fn: () => Promise<any>) {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
      await queryClient.invalidateQueries();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function create(instant = false) {
    await run(async () => {
      const r = await api("/rooms/solo", {
        rules,
        bots,
        options: { fast, practice, animationSpeed: speed },
      });
      if (instant) {
        await api(`/rooms/${r.id}/ready`, { ready: true });
        await api(`/rooms/${r.id}/start`, {});
      }
      router.replace(`/room/${r.id}`);
    });
  }
  const r = room.data,
    locked = r?.status === "playing";
  return (
    <Screen>
      <Title
        title={roomId ? "Your AI opponents." : "A good game, anytime."}
        detail={
          roomId
            ? "Bot settings are locked during a match. Changes afterward apply to the next match."
            : "Choose your company. All AI play uses the same server-authoritative rules and private card views."
        }
      />
      <ErrorText error={error || room.error} />
      {roomId && !r ? (
        <Loading />
      ) : roomId ? (
        <>
          {r.bots.map((b: any) => (
            <Panel key={b.id}>
              <Row>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 9 }}
                >
                  <BotAvatar index={b.seat} />
                  <Txt size={20}>{b.name} · AI</Txt>
                </View>
                <Txt muted size={12}>
                  {b.config.difficulty}
                </Txt>
              </Row>
              <Txt muted>{b.config.personality} personality</Txt>
              <Button
                secondary
                title="Edit for next match"
                disabled={locked || busy}
                onPress={() => {
                  setEditing(b.id);
                  setDraft({ name: b.name, config: b.config });
                }}
              />
              <Button
                secondary
                title="Remove bot"
                disabled={locked || busy}
                onPress={() =>
                  void run(() =>
                    api(`/rooms/${roomId}/bots/${b.id}`, undefined, "DELETE"),
                  )
                }
              />
            </Panel>
          ))}
          {!locked && (
            <>
              <Button
                title="Add an AI opponent"
                disabled={busy || r.members.length >= r.rules.maxPlayers}
                onPress={() => {
                  setEditing("new");
                  setDraft({
                    name: botNames[r.bots.length % 4],
                    config: { ...botPresets.intermediate },
                  });
                }}
              />
              {editing && (
                <>
                  <BotEditor
                    name={draft.name}
                    config={draft.config}
                    onChange={(name, config) => setDraft({ name, config })}
                    saved={saved.data?.saved}
                    onSave={(name) =>
                      void run(() =>
                        api("/bots/presets", { name, config: draft.config }),
                      )
                    }
                  />
                  <Button
                    title="Save bot"
                    busy={busy}
                    onPress={() =>
                      void run(async () => {
                        await api(
                          `/rooms/${roomId}/bots${editing === "new" ? "" : `/${editing}`}`,
                          draft,
                          editing === "new" ? "POST" : "PUT",
                        );
                        setEditing(undefined);
                      })
                    }
                  />
                </>
              )}
            </>
          )}
          <Button
            secondary
            title="Return to table"
            onPress={() => router.back()}
          />
        </>
      ) : (
        <>
          <Panel>
            <Txt size={20}>Choose your rules</Txt>
            {presets.map((p) => (
              <Button
                key={p.name}
                title={p.name}
                secondary={rules.name !== p.name}
                onPress={() => {
                  setRules(p);
                  setBots(bots.slice(0, p.maxPlayers - 1));
                }}
              />
            ))}
            <Txt muted size={12}>
              {rules.startingCards} cards · {rules.mode} · {rules.minPlayers}–
              {rules.maxPlayers} players
            </Txt>
          </Panel>
          <Panel>
            <Txt size={20}>Choose your table</Txt>
            <Row>
              <Txt>
                {bots.length} AI opponent{bots.length === 1 ? "" : "s"}
              </Txt>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button
                  secondary
                  title="−"
                  disabled={bots.length <= 1}
                  onPress={() => setBots(bots.slice(0, -1))}
                />
                <Button
                  secondary
                  title="+"
                  disabled={bots.length >= Math.min(4, rules.maxPlayers - 1)}
                  onPress={() =>
                    setBots([
                      ...bots,
                      {
                        name: botNames[bots.length],
                        config: { ...botPresets.intermediate },
                      },
                    ])
                  }
                />
              </View>
            </Row>
            <Txt muted size={13}>
              Choose a rule preset, match length and Advanced Rules in the lobby
              before starting.
            </Txt>
            <Button
              secondary
              title="Apply first bot’s difficulty to all"
              onPress={() =>
                setBots(
                  bots.map((b) => ({ ...b, config: { ...bots[0].config } })),
                )
              }
            />
          </Panel>
          {bots.map((b, i) => (
            <BotEditor
              key={i}
              avatar={i + 1}
              name={b.name}
              config={b.config}
              onChange={(name, config) =>
                setBots(bots.map((v, j) => (i === j ? { name, config } : v)))
              }
              saved={saved.data?.saved}
              onSave={(name) =>
                void run(() => api("/bots/presets", { name, config: b.config }))
              }
            />
          ))}
          <Panel>
            <Row>
              <Txt>Fast Mode</Txt>
              <Switch
                accessibilityLabel="Fast Mode"
                value={fast}
                onValueChange={setFast}
              />
            </Row>
            <Row>
              <Txt>Practice insights</Txt>
              <Switch
                accessibilityLabel="Practice insights"
                value={practice}
                onValueChange={setPractice}
              />
            </Row>
            <Txt muted size={12}>
              Insights use only your authorized information. Server-hosted solo
              requires an internet connection.
            </Txt>
            <Txt>Animation speed</Txt>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[0.5, 1, 2].map((n) => (
                <Button
                  key={n}
                  title={`${n}×`}
                  secondary={speed !== n}
                  onPress={() => setSpeed(n)}
                />
              ))}
            </View>
          </Panel>
          <Button
            title="Play now"
            disabled={
              bots.length + 1 < rules.minPlayers ||
              bots.length + 1 > rules.maxPlayers
            }
            busy={busy}
            onPress={() => void create(true)}
          />
          <Button
            secondary
            title="Review table & Advanced Rules"
            busy={busy}
            onPress={() => void create(false)}
          />
        </>
      )}
    </Screen>
  );
}

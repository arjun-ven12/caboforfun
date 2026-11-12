import React, { useState, useEffect } from "react";
import { Share, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import type { Command, PlayerView, SwapNotification } from "@cabo/shared";
import { auth, api, connect, queryClient } from "../../src/client";
import {
  Screen,
  Title,
  Panel,
  Txt,
  Row,
  Button,
  Loading,
  ErrorText,
  useTheme,
} from "../../src/ui";
import { Identity } from "../../src/swap-feedback";
import { Table } from "../../src/table";
export default function Room() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    { data: session } = auth.useSession(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [online, setOnline] = useState(false),
    [clockOffset, setClockOffset] = useState(0);
  const q = useQuery({
    queryKey: ["room", id],
    queryFn: async () => {
      const data = await api(`/rooms/${id}`);
      if (data.serverTime) setClockOffset(data.serverTime - Date.now());
      return data;
    },
    enabled: !!session,
    refetchOnMount: "always",
  });
  const r = q.data,
    c = useTheme();
  useEffect(() => {
    if (!session) return;
    const s = connect();
    const sync = () => {
      setOnline(true);
      void q.refetch();
    };
    const down = () => setOnline(false);
    const state = (
      view: PlayerView & { roomId: string; serverTime: number },
    ) => {
      if (view.roomId !== id) return;
      setClockOffset(view.serverTime - Date.now());
      queryClient.setQueryData(["room", id], (old: any) =>
        old && (!old.game || view.version >= old.game.version)
          ? { ...old, game: view }
          : old,
      );
    };
    const swapped = (n: SwapNotification) => {
      if (n.roomId !== id) return;
      queryClient.setQueryData(["room", id], (old: any) => {
        if (!old?.game || old.game.matchId !== n.matchId) return old;
        const history = old.game.swapHistory as SwapNotification["event"][];
        if (history.some((e) => e.id === n.event.id)) return old;
        return {
          ...old,
          game: {
            ...old.game,
            swapHistory: [...history, n.event]
              .sort((a, b) => a.sequence - b.sequence)
              .slice(-50),
            identities: {
              ...old.game.identities,
              [n.actor.userId]: n.actor,
              [n.opponent.userId]: n.opponent,
            },
          },
        };
      });
    };
    s.on("game:swap", swapped);
    s.on("connect", sync);
    s.on("disconnect", down);
    s.on("game:state", state);
    setOnline(s.connected);
    return () => {
      s.off("game:swap", swapped);
      s.off("connect", sync);
      s.off("disconnect", down);
      s.off("game:state", state);
    };
  }, [id, session?.user.id]);
  async function run(fn: () => Promise<any>) {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
      await q.refetch();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  function send(command: Command) {
    if (busy || !r?.game) return;
    setBusy(true);
    setError(undefined);
    connect()
      .timeout(10000)
      .emit(
        "game:command",
        {
          roomId: id,
          actionId: Crypto.randomUUID(),
          version: r.game.version,
          command,
        },
        (err, ack) => {
          setBusy(false);
          if (err) {
            setError(
              new Error("Connection interrupted. Synchronizing your game."),
            );
            void q.refetch();
            return;
          }
          if (!ack.ok) {
            setError(new Error(ack.error));
            void q.refetch();
            return;
          }
          queryClient.setQueryData(["room", id], (old: any) => ({
            ...old,
            game: ack.data,
          }));
        },
      );
  }
  if (!session)
    return (
      <Screen>
        <Title title="Sign in to take your seat." />
        <Button title="Log in" onPress={() => router.push("/auth")} />
      </Screen>
    );
  if (!r)
    return (
      <Screen>
        <ErrorText error={q.error} />
        {q.isPending && <Loading />}
      </Screen>
    );
  const me = r.members.find((m: any) => m.userId === session.user.id),
    host = r.hostId === session.user.id;
  return (
    <Screen>
      <Row>
        <Txt size={12} style={{ letterSpacing: 3 }}>
          TABLE {r.code}
        </Txt>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: online ? c.accent : c.red,
            }}
          />
          <Txt size={11} muted>
            {online ? "Connected" : "Reconnecting"}
          </Txt>
        </View>
      </Row>
      <ErrorText error={error} />
      {r.game ? (
        <Table
          game={r.game}
          clockOffset={clockOffset}
          userId={session.user.id}
          names={Object.fromEntries(
            Object.values(r.game.identities).map((m: any) => [
              m.userId,
              m.displayName,
            ]),
          )}
          send={send}
          busy={busy || !!r.game.pausedAt}
        />
      ) : (
        <>
          <Title
            title="Pull up a chair."
            detail="Your table is private. Invite your people, and start when everyone is ready."
          />
          <Panel>
            {r.members.map((m: any) => (
              <Row key={m.userId}>
                <Identity
                  person={{
                    userId: m.userId,
                    displayName: m.displayName || m.name,
                    username: m.username,
                  }}
                />
                <Txt muted size={13}>
                  {m.ready ? "Ready" : "Getting settled"}
                </Txt>
              </Row>
            ))}
          </Panel>
          <Button
            title="Share Invite"
            busy={busy}
            onPress={() =>
              void run(async () => {
                const invite = await api(`/rooms/${id}/invites`, {});
                await Share.share({
                  message: `Join my CABO table. ${invite.url}\nRoom code: ${r.code}`,
                  url: invite.url,
                });
              })
            }
          />
          <Panel>
            <Txt size={20}>{r.rules.name}</Txt>
            <Txt muted>
              {r.rules.startingCards} cards · {r.rules.mode} match ·{" "}
              {r.rules.turnSeconds}s turns
            </Txt>
            <Button
              secondary
              title={host ? "Choose or customize rules" : "Inspect table rules"}
              onPress={() =>
                router.push(`/rules?roomId=${id}&readOnly=${host ? "0" : "1"}`)
              }
            />
          </Panel>
          <Button
            title={me?.ready ? "Not ready" : "I’m ready"}
            busy={busy}
            onPress={() =>
              void run(() => api(`/rooms/${id}/ready`, { ready: !me?.ready }))
            }
          />
          {host && (
            <Button
              title="Start game"
              disabled={
                !r.members.every((m: any) => m.ready) ||
                r.members.length < r.rules.minPlayers
              }
              busy={busy}
              onPress={() => void run(() => api(`/rooms/${id}/start`, {}))}
            />
          )}
        </>
      )}
      {r.status === "finished" && (
        <Panel>
          <Txt size={20}>Another round together?</Txt>
          {r.members.map((m: any) => (
            <Row key={m.userId}>
              <Identity
                person={{
                  userId: m.userId,
                  displayName: m.displayName || m.name,
                  username: m.username,
                }}
              />
              <Txt muted size={12}>
                {m.rematch ? "Accepted" : "Deciding"}
              </Txt>
            </Row>
          ))}
          <Txt muted>
            {r.members.filter((m: any) => m.rematch).length} of{" "}
            {r.members.length} players accepted
          </Txt>
          <Button
            title={
              me?.rematch
                ? "Withdraw rematch acceptance"
                : "Rematch with same players & rules"
            }
            busy={busy}
            onPress={() =>
              void run(() => api(`/rooms/${id}/ready`, { ready: !me?.rematch }))
            }
          />
          {host && (
            <Button
              title="Start accepted rematch"
              disabled={!r.members.every((m: any) => m.rematch)}
              busy={busy}
              onPress={() =>
                void run(() => api(`/rooms/${id}/start`, { rematch: true }))
              }
            />
          )}
        </Panel>
      )}
      {r.status !== "playing" && (
        <Button
          secondary
          title="Leave table"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              await api(`/rooms/${id}/membership`, undefined, "DELETE");
              router.replace("/(main)");
            })
          }
        />
      )}
      <Button
        secondary
        title="View rules"
        onPress={() => router.push(`/rules?roomId=${id}&readOnly=1`)}
      />
    </Screen>
  );
}

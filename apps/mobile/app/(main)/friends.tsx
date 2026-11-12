import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { api, auth, queryClient } from "../../src/client";
import {
  Screen,
  Title,
  Field,
  Panel,
  Row,
  Txt,
  Button,
  ErrorText,
  Loading,
} from "../../src/ui";
export default function Friends() {
  const { data: session } = auth.useSession(),
    [search, setSearch] = useState(""),
    [term, setTerm] = useState(""),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["friends"], queryFn: () => api("/friends") }),
    users = useQuery({
      queryKey: ["search", term],
      queryFn: () => api<any[]>(`/users?q=${encodeURIComponent(term)}`),
      enabled: term.length >= 2,
    });
  async function run(fn: () => Promise<any>) {
    setError(undefined);
    setBusy(true);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: ["friends"] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const profile = (id: string) =>
    q.data?.profiles.find((p: any) => p.userId === id);
  const edges = q.data?.edges || [];
  return (
    <Screen>
      <Title
        eyebrow="Better together"
        title="Your people."
        detail="Find a friend, start a ritual, play a little."
      />
      <Field
        label="Search by username"
        value={search}
        onChangeText={setSearch}
      />
      <Button
        title="Search players"
        disabled={search.length < 2 || busy}
        onPress={() => setTerm(search)}
      />
      <ErrorText error={error || q.error || users.error} />
      {users.isFetching && <Loading />}
      {users.data?.map((p) => (
        <Panel key={p.userId}>
          <Txt>
            {p.displayName} · @{p.username}
          </Txt>
          <Button
            secondary
            title="Send friend request"
            disabled={busy}
            onPress={() =>
              void run(() => api("/friends/requests", { userId: p.userId }))
            }
          />
        </Panel>
      ))}
      {edges.filter(
        (e: any) => e.kind === "request" && e.toId === session?.user.id,
      ).length > 0 && <Txt size={22}>Incoming requests</Txt>}
      {edges
        .filter((e: any) => e.kind === "request" && e.toId === session?.user.id)
        .map((e: any) => (
          <Panel key={e.id}>
            <Txt>
              {profile(e.fromId)?.displayName || "Player"} @
              {profile(e.fromId)?.username} wants to be friends.
            </Txt>
            <Row>
              <Button
                title="Accept"
                disabled={busy}
                onPress={() =>
                  void run(() =>
                    api(`/friends/requests/${e.id}`, { accept: true }),
                  )
                }
              />
              <Button
                secondary
                title="Decline"
                disabled={busy}
                onPress={() =>
                  void run(() =>
                    api(`/friends/requests/${e.id}`, { accept: false }),
                  )
                }
              />
            </Row>
          </Panel>
        ))}
      {edges
        .filter(
          (e: any) => e.kind === "friend" && e.fromId === session?.user.id,
        )
        .map((e: any) => {
          const p = profile(e.toId);
          return (
            <Panel key={e.id}>
              <Row>
                <Txt size={19}>{p?.displayName || "Friend"}</Txt>
                <Txt size={12} muted>
                  {p?.status || "Offline"}
                </Txt>
              </Row>
              <Txt muted size={13}>
                @{p?.username}
              </Txt>
              <Button
                title="Challenge"
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    const r = await api("/rooms", {});
                    await api(`/rooms/${r.id}/invites`, { userId: e.toId });
                    router.push(`/room/${r.id}`);
                  })
                }
              />
              <Row>
                <Button
                  secondary
                  title="Remove"
                  disabled={busy}
                  onPress={() =>
                    void run(() =>
                      api(`/friends/${e.toId}`, undefined, "DELETE"),
                    )
                  }
                />
                <Button
                  secondary
                  title="Block"
                  disabled={busy}
                  onPress={() =>
                    void run(() => api(`/friends/${e.toId}/block`, {}))
                  }
                />
              </Row>
            </Panel>
          );
        })}
      {!edges.some(
        (e: any) => e.kind === "friend" && e.fromId === session?.user.id,
      ) && (
        <Panel>
          <Txt size={22}>A table for your favorites.</Txt>
          <Txt muted>
            Search a username to add your first friend. You can also share a
            game invitation with anyone.
          </Txt>
        </Panel>
      )}
      {edges
        .filter(
          (e: any) => e.kind === "request" && e.fromId === session?.user.id,
        )
        .map((e: any) => (
          <Panel key={e.id}>
            <Txt>
              Request sent to {profile(e.toId)?.displayName || "player"} @
              {profile(e.toId)?.username}
            </Txt>
            <Button
              secondary
              title="Cancel request"
              disabled={busy}
              onPress={() =>
                void run(() => api(`/friends/${e.toId}`, undefined, "DELETE"))
              }
            />
          </Panel>
        ))}
      {edges
        .filter((e: any) => e.kind === "block" && e.fromId === session?.user.id)
        .map((e: any) => (
          <Panel key={e.id}>
            <Txt>Blocked · {profile(e.toId)?.displayName || "Player"}</Txt>
            <Button
              secondary
              title="Unblock"
              disabled={busy}
              onPress={() =>
                void run(() =>
                  api(`/friends/${e.toId}/block`, undefined, "DELETE"),
                )
              }
            />
          </Panel>
        ))}
      <Button
        secondary
        title="Game invitations"
        onPress={() => router.push("/activity?view=invites")}
      />
    </Screen>
  );
}

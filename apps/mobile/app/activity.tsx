import React, { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api, queryClient } from "../src/client";
import {
  Screen,
  Title,
  Panel,
  Row,
  Txt,
  Button,
  Loading,
  ErrorText,
} from "../src/ui";
export default function Activity() {
  const { view = "notifications" } = useLocalSearchParams<{ view: string }>(),
    [error, setError] = useState<unknown>();
  const path = ["notifications", "matches", "invites"].includes(view)
    ? view
    : "notifications";
  const q = useQuery({
    queryKey: [path],
    queryFn: () => api<any[]>(`/${path}`),
  });
  return (
    <Screen>
      <Title
        title={
          path === "matches"
            ? "Good games, remembered."
            : path === "invites"
              ? "You’re invited."
              : "From your people."
        }
      />
      <Row>
        {["notifications", "invites", "matches"].map((v) => (
          <Button
            key={v}
            secondary={v !== path}
            title={
              v === "notifications"
                ? "Inbox"
                : v === "invites"
                  ? "Invites"
                  : "History"
            }
            onPress={() => router.setParams({ view: v })}
          />
        ))}
      </Row>
      <ErrorText error={error || q.error} />
      {q.isPending && <Loading />}
      {q.data?.length === 0 && (
        <Panel>
          <Txt muted>
            No {path} yet. Your next game starts with an invitation.
          </Txt>
        </Panel>
      )}
      {q.data?.map((item) => (
        <Panel key={item.id}>
          {path === "matches" ? (
            <>
              <Txt muted size={12}>
                {item.match.kind === "solo"
                  ? "SOLO · AI opponents"
                  : item.match.kind === "mixed"
                    ? "MIXED · humans & AI"
                    : "HUMAN MULTIPLAYER"}
              </Txt>
              <Row>
                <Txt size={20}>
                  {item.winner ? "A winning hand." : "A game well played."}
                </Txt>
                <Txt>{item.total} points</Txt>
              </Row>
              <Txt muted size={12}>
                {new Date(item.match.createdAt).toLocaleDateString()}
              </Txt>
              {item.match.rounds.map((r: any) => (
                <Txt key={r.id} size={13} muted>
                  Round {r.number} ·{" "}
                  {r.scores
                    .map(
                      (s: any) =>
                        `${item.match.identities?.[s.id]?.displayName || "Former player"}${item.match.identities?.[s.id]?.kind === "bot" ? " · AI" : ""} ${item.match.identities?.[s.id]?.username ? `@${item.match.identities[s.id].username}` : ""}: ${s.raw} hand / ${s.total} round`,
                    )
                    .join(" · ")}
                </Txt>
              ))}
            </>
          ) : path === "invites" ? (
            <>
              <Txt>
                {item.from?.profile?.displayName || item.from?.name}{" "}
                {item.from?.profile?.username
                  ? `@${item.from.profile.username}`
                  : ""}
              </Txt>
              <Txt size={20}>A seat at table {item.room.code}</Txt>
              <Button
                title="Accept invitation"
                onPress={() =>
                  void api("/rooms/join", { code: item.room.code })
                    .then(async (r) => {
                      await api(`/invites/${item.id}/respond`, {});
                      router.push(`/room/${r.id}`);
                    })
                    .catch(setError)
                }
              />
              <Button
                secondary
                title="Decline"
                onPress={() =>
                  void api(`/invites/${item.id}/respond`, {})
                    .then(() =>
                      queryClient.invalidateQueries({ queryKey: ["invites"] }),
                    )
                    .catch(setError)
                }
              />
            </>
          ) : (
            <>
              <Txt>{item.body}</Txt>
              {item.actor?.profile?.username && (
                <Txt muted size={12}>
                  @{item.actor.profile.username}
                </Txt>
              )}
              <Txt muted size={12}>
                {new Date(item.createdAt).toLocaleString()}
              </Txt>
              {item.roomId && (
                <Button
                  secondary
                  title="Open table"
                  onPress={() => router.push(`/room/${item.roomId}`)}
                />
              )}
            </>
          )}
        </Panel>
      ))}
      {path === "notifications" && (
        <Button
          secondary
          title="Mark all as read"
          onPress={() =>
            void api("/notifications/read", {})
              .then(() => q.refetch())
              .catch(setError)
          }
        />
      )}
    </Screen>
  );
}

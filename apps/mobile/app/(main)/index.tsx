import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { api, auth } from "../../src/client";
import {
  Screen,
  Title,
  Txt,
  Button,
  Panel,
  Row,
  ErrorText,
  Emblem,
} from "../../src/ui";
export default function Home() {
  const { data: session } = auth.useSession();
  const rooms = useQuery({
      queryKey: ["rooms"],
      queryFn: () => api<any[]>("/rooms"),
    }),
    friends = useQuery({
      queryKey: ["friends"],
      queryFn: () => api("/friends"),
    });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  async function create() {
    setBusy(true);
    try {
      const r = await api("/rooms", {});
      router.push(`/room/${r.id}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Row>
        <Txt size={12} style={{ letterSpacing: 6 }}>
          CABO
        </Txt>
        <Button
          secondary
          title="Inbox"
          onPress={() => router.push("/activity?view=notifications")}
        />
      </Row>
      <Title
        eyebrow={`Hello, ${session?.user.name?.split(" ")[0] || "friend"}`}
        title={"Make time\nfor a little play."}
      />
      <Button title="Play vs AI" onPress={() => router.push("/bots")} />
      <Panel>
        <Emblem />
        <Txt size={24} style={{ letterSpacing: -0.6 }}>
          Your next good game.
        </Txt>
        <Txt muted>Bring a few friends. We’ll deal the cards.</Txt>
        <Button
          title="Create a private table"
          busy={busy}
          onPress={() => void create()}
        />
        <Button
          secondary
          title="Join a game"
          onPress={() => router.push("/join-game")}
        />
      </Panel>
      <ErrorText error={error || rooms.error} />
      <Row>
        <Txt size={21}>Friends at the table</Txt>
        <Button
          secondary
          title="View friends"
          onPress={() => router.push("/(main)/friends")}
        />
      </Row>
      <Txt muted>
        {friends.data?.edges?.filter(
          (e: any) => e.kind === "friend" && e.fromId === session?.user.id,
        ).length || 0}{" "}
        friends · Challenge someone to a round.
      </Txt>
      {rooms.data
        ?.filter((r) => r.status !== "cancelled")
        .slice(0, 4)
        .map((r) => (
          <Panel key={r.id}>
            <Row>
              <Txt>Table {r.code}</Txt>
              <Txt muted size={12}>
                {r.status}
              </Txt>
            </Row>
            <Button
              secondary
              title={r.status === "playing" ? "Return to game" : "Open table"}
              onPress={() => router.push(`/room/${r.id}`)}
            />
          </Panel>
        ))}
      <Button
        secondary
        title="How to play"
        onPress={() => router.push("/how-to-play")}
      />
    </Screen>
  );
}

import React, { useState, useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { api, auth, intent } from "../../src/client";
import { Screen, Title, Loading, ErrorText, Button } from "../../src/ui";
export default function JoinInvite() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { data: session, isPending } = auth.useSession();
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    if (!token || isPending) return;
    void (async () => {
      await intent.set(token);
      if (!session) {
        router.replace("/auth");
        return;
      }
      const r = await api("/rooms/join", { token });
      await intent.clear();
      router.replace(`/room/${r.id}`);
    })().catch(setError);
  }, [token, session?.user.id, isPending]);
  return (
    <Screen>
      <Title title="A seat is waiting." detail="Finding your invitation…" />
      {error ? (
        <>
          <ErrorText error={error} />
          <Button
            secondary
            title="Back to home"
            onPress={() => {
              void intent.clear();
              router.replace("/");
            }}
          />
        </>
      ) : (
        <Loading />
      )}
    </Screen>
  );
}

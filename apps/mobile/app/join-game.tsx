import React, { useState } from "react";
import { router } from "expo-router";
import { Screen, Title, Field, Button, ErrorText } from "../src/ui";
import { api } from "../src/client";
export default function Join() {
  const [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  return (
    <Screen>
      <Title
        title="Find your people."
        detail="Enter the six-character room code your friend shared."
      />
      <Field
        label="Room code"
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        maxLength={6}
      />
      <ErrorText error={error} />
      <Button
        title="Join table"
        busy={busy}
        disabled={code.length !== 6}
        onPress={() => {
          setBusy(true);
          void api("/rooms/join", { code })
            .then((r) => router.replace(`/room/${r.id}`))
            .catch(setError)
            .finally(() => setBusy(false));
        }}
      />
    </Screen>
  );
}

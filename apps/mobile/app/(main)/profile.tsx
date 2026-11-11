import React, { useState, useEffect } from "react";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Switch } from "react-native";
import { api, queryClient } from "../../src/client";
import {
  Screen,
  Title,
  Panel,
  Row,
  Txt,
  Field,
  Button,
  ErrorText,
} from "../../src/ui";
export default function Profile() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api("/me") }),
    stats = useQuery({ queryKey: ["stats"], queryFn: () => api("/stats") });
  const [username, setUsername] = useState(""),
    [name, setName] = useState(""),
    [visible, setVisible] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  useEffect(() => {
    if (me.data) {
      setName(me.data.profile?.displayName || me.data.name);
      setUsername(me.data.profile?.username || "");
      setVisible(me.data.profile?.presenceVisible ?? true);
    }
  }, [me.data]);
  return (
    <Screen>
      <Title eyebrow="A familiar face" title={name || "Your profile."} />
      <Panel>
        <Txt size={52} style={{ textAlign: "center" }}>
          {name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase() || "C"}
        </Txt>
        <Txt muted size={12} style={{ textAlign: "center" }}>
          {me.data?.email}
        </Txt>
      </Panel>
      <Field
        label="Unique username · lowercase letters, numbers, underscore"
        value={username}
        onChangeText={setUsername}
      />
      <Field
        label="Display name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
      />
      <Row>
        <Txt>Share my online presence</Txt>
        <Switch
          accessibilityLabel="Share my online presence"
          value={visible}
          onValueChange={setVisible}
        />
      </Row>
      <ErrorText error={error || me.error || stats.error} />
      <Button
        title="Save profile"
        busy={busy}
        onPress={() => {
          setBusy(true);
          void api(
            "/profile",
            { username, displayName: name, presenceVisible: visible },
            "PUT",
          )
            .then(() => queryClient.invalidateQueries({ queryKey: ["me"] }))
            .catch(setError)
            .finally(() => setBusy(false));
        }}
      />
      <Panel>
        <Txt size={21}>Your game, in numbers.</Txt>
        <Row>
          <Txt muted>Played</Txt>
          <Txt>{stats.data?.games || 0}</Txt>
        </Row>
        <Row>
          <Txt muted>Wins / losses</Txt>
          <Txt>
            {stats.data?.wins || 0} / {stats.data?.losses || 0}
          </Txt>
        </Row>
        <Row>
          <Txt muted>Win rate</Txt>
          <Txt>{Math.round((stats.data?.winRate || 0) * 100)}%</Txt>
        </Row>
        <Row>
          <Txt muted>Average final hand</Txt>
          <Txt>{(stats.data?.averageHand || 0).toFixed(1)}</Txt>
        </Row>
      </Panel>
      <Button
        secondary
        title="Match history"
        onPress={() => router.push("/activity?view=matches")}
      />
    </Screen>
  );
}

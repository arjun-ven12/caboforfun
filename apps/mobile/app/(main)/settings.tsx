import React, { useState } from "react";
import { Switch, Alert } from "react-native";
import { router } from "expo-router";
import { auth, signOut } from "../../src/client";
import { usePreferences } from "../../src/preferences";
import {
  Screen,
  Title,
  Panel,
  Row,
  Txt,
  Button,
  Field,
  ErrorText,
} from "../../src/ui";
export default function Settings() {
  const prefs = usePreferences(),
    [password, setPassword] = useState(""),
    [error, setError] = useState<unknown>();
  return (
    <Screen>
      <Title
        title="Just your style."
        detail="A quieter table, or a little more feeling."
      />
      <Panel>
        {[
          ["haptics", "Tactile feedback"],
          ["reducedMotion", "Reduce motion"],
          ["push", "Invitation notifications"],
        ].map(([key, label]) => (
          <Row key={key}>
            <Txt>{label}</Txt>
            <Switch
              accessibilityLabel={label}
              value={prefs[key as "haptics" | "push" | "reducedMotion"]}
              onValueChange={(v) => prefs.set({ [key]: v })}
            />
          </Row>
        ))}
      </Panel>
      <Txt size={20}>Appearance</Txt>
      <Row>
        {(["system", "light", "dark"] as const).map((d) => (
          <Button
            key={d}
            title={d[0].toUpperCase() + d.slice(1)}
            secondary={prefs.dark !== d}
            onPress={() => prefs.set({ dark: d })}
          />
        ))}
      </Row>
      <Button
        secondary
        title="Advanced Rules & saved presets"
        onPress={() => router.push("/rules")}
      />
      <Button
        secondary
        title="How to play"
        onPress={() => router.push("/how-to-play")}
      />
      <Button
        secondary
        title="Log out"
        onPress={() =>
          void signOut()
            .then(() => router.replace("/"))
            .catch(setError)
        }
      />
      <Panel>
        <Txt size={19}>Delete account</Txt>
        <Txt muted size={13}>
          This permanently removes your account and profile. Game history is
          retained with an anonymous participant ID.
        </Txt>
        <Field
          label="Password (optional with email verification)"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <ErrorText error={error} />
        <Button
          secondary
          title="Permanently delete my account"
          onPress={() =>
            Alert.alert("Delete your account?", "This cannot be undone.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => {
                  void auth
                    .deleteUser({
                      ...(password ? { password } : {}),
                      callbackURL: "cabo://",
                    })
                    .then(async (r) => {
                      if (r.error) throw new Error(r.error.message);
                      if (r.data?.message === "User deleted") {
                        await signOut();
                        router.replace("/");
                      } else
                        Alert.alert(
                          "Check your email",
                          "Follow the verification link to finish deleting your account.",
                        );
                    })
                    .catch(setError);
                },
              },
            ])
          }
        />
      </Panel>
    </Screen>
  );
}

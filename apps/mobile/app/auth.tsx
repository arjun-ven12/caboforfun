import React, { useState, useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { API, auth, intent } from "../src/client";
import { Screen, Title, Field, Button, ErrorText, Txt } from "../src/ui";
export default function Auth() {
  const params = useLocalSearchParams<{ mode?: string; token?: string }>();
  const [mode, setMode] = useState(params.mode || "login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const { data: session } = auth.useSession();
  const { data: features } = useQuery({
    queryKey: ["auth-features"],
    queryFn: async () => {
      const response = await fetch(`${API}/client-config`);
      if (!response.ok) throw new Error("Account options could not be loaded");
      return response.json() as Promise<{
        emailVerificationRequired: boolean;
        passwordResetAvailable: boolean;
        googleSignIn: boolean;
        appleSignIn: boolean;
      }>;
    },
  });
  useEffect(() => {
    if (session && mode !== "reset")
      void intent
        .get()
        .then((token) => router.replace(token ? `/join/${token}` : "/(main)"));
  }, [session?.user.id]);
  async function run(fn: () => Promise<any>) {
    setBusy(true);
    setError(undefined);
    try {
      const r = await fn();
      if (r?.error) throw new Error(r.error.message);
      if (mode === "forgot" || mode === "verify")
        setMessage("Check your email for the next step.");
      if (mode === "signup")
        setMessage(
          features?.emailVerificationRequired
            ? "Account created. Verify your email, then sign in."
            : "Account created. You can sign in.",
        );
      if (mode === "reset") {
        setMode("login");
        setMessage("Password updated. You can sign in.");
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Title
        eyebrow="Welcome to the table"
        title={
          mode === "signup"
            ? "Make yourself at home."
            : mode === "forgot"
              ? "A fresh start."
              : mode === "reset"
                ? "Choose a new password."
                : mode === "verify"
                  ? "Verify your email."
                  : "Welcome back."
        }
        detail="Your games, your friends, your little rituals."
      />
      {mode === "signup" && (
        <Field
          label="Display name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoComplete="name"
        />
      )}
      {mode !== "reset" && (
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoComplete="email"
        />
      )}
      {!["forgot", "verify"].includes(mode) && (
        <Field
          label="Password · at least 12 characters"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      )}
      <ErrorText error={error} />
      {!!message && <Txt>{message}</Txt>}
      <Button
        busy={busy}
        title={
          mode === "signup"
            ? "Create account"
            : mode === "forgot"
              ? "Send reset link"
              : mode === "reset"
                ? "Update password"
                : mode === "verify"
                  ? "Send verification email"
                  : "Log in"
        }
        onPress={() =>
          void run(() =>
            mode === "signup"
              ? auth.signUp.email({ email, password, name })
              : mode === "forgot"
                ? auth.requestPasswordReset({
                    email,
                    redirectTo: "cabo://auth?mode=reset",
                  })
                : mode === "reset"
                  ? auth.resetPassword({
                      newPassword: password,
                      token: params.token || "",
                    })
                  : mode === "verify"
                    ? auth.sendVerificationEmail({
                        email,
                        callbackURL: "cabo://auth",
                      })
                    : auth.signIn.email({ email, password }),
          )
        }
      />
      {mode === "login" && (
        <>
          {features?.googleSignIn && (
            <>
              <Button
                secondary
                title="Continue with Google"
                onPress={() =>
                  void run(() =>
                    auth.signIn.social({
                      provider: "google",
                      callbackURL: "/(main)",
                    }),
                  )
                }
              />
            </>
          )}
          {features?.appleSignIn && (
            <>
              <Button
                secondary
                title="Continue with Apple"
                onPress={() =>
                  void run(() =>
                    auth.signIn.social({
                      provider: "apple",
                      callbackURL: "/(main)",
                    }),
                  )
                }
              />
            </>
          )}
          {features?.passwordResetAvailable && (
            <>
              <Button
                secondary
                title="Forgot password"
                onPress={() => setMode("forgot")}
              />
            </>
          )}
          {features?.emailVerificationRequired && (
            <>
              <Button
                secondary
                title="Verify email"
                onPress={() => setMode("verify")}
              />
            </>
          )}
        </>
      )}
      <Button
        secondary
        title={mode === "login" ? "Create an account" : "Back to login"}
        onPress={() => {
          setMode(mode === "login" ? "signup" : "login");
          setMessage("");
          setError(undefined);
        }}
      />
    </Screen>
  );
}

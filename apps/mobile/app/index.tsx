import React from "react";
import { Redirect, router } from "expo-router";
import { auth } from "../src/client";
import { Screen, Title, Txt, Button, Emblem, Loading } from "../src/ui";
export default function Welcome() {
  const { data, isPending } = auth.useSession();
  if (isPending)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (data) return <Redirect href="/(main)" />;
  return (
    <Screen>
      <Txt
        size={13}
        style={{ letterSpacing: 8, textAlign: "center", paddingTop: 25 }}
      >
        CABO
      </Txt>
      <Emblem />
      <Title
        eyebrow="A little mystery. A lot of company."
        title={"Play your cards.\nTrust your memory."}
        detail="A quiet little card game with your favorite people. Keep your score low, and call it at just the right moment."
      />
      <Button
        title="Create an account"
        onPress={() => router.push("/auth?mode=signup")}
      />
      <Button
        secondary
        title="I already have an account"
        onPress={() => router.push("/auth")}
      />
      <Button
        secondary
        title="Learn the game"
        onPress={() => router.push("/how-to-play")}
      />
      <Txt size={12} muted>
        2–5 players · Private tables · Your rules
      </Txt>
    </Screen>
  );
}

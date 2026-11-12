import "react-native-gesture-handler";
import React, { useEffect } from "react";
import { AppState, Platform, Alert } from "react-native";
import { Stack, router } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import {
  auth,
  api,
  connect,
  disconnect,
  queryClient,
  unregisterPush,
} from "../src/client";
import { useTheme } from "../src/ui";
import { usePreferences } from "../src/preferences";
export default function Layout() {
  const c = useTheme(),
    { data: session } = auth.useSession(),
    push = usePreferences((s) => s.push);
  useEffect(() => {
    if (!session) {
      disconnect();
      return;
    }
    const open = () => {
      const s = connect();
      s.off("room:changed");
      s.off("notification");
      s.off("profile:updated");
      s.on("room:changed", ({ roomId }) => {
        void queryClient.invalidateQueries({ queryKey: ["room", roomId] });
        void queryClient.invalidateQueries({ queryKey: ["rooms"] });
      });
      s.on("profile:updated", () => {
        void queryClient.invalidateQueries();
      });
      s.on("notification", (n) => {
        void queryClient.invalidateQueries();
        if (n.kind === "challenge" || n.kind === "friend_request")
          Alert.alert(
            n.kind === "challenge"
              ? "You’re invited."
              : "A new friend request.",
            n.body,
            [
              { text: "Later", style: "cancel" },
              {
                text: "View",
                onPress: () =>
                  router.push(
                    n.kind === "challenge"
                      ? "/activity?view=invites"
                      : "/(main)/friends",
                  ),
              },
            ],
          );
      });
    };
    if (AppState.currentState === "active") open();
    const sub = AppState.addEventListener("change", (state) =>
      state === "active" ? open() : disconnect(),
    );
    return () => {
      sub.remove();
      disconnect();
    };
  }, [session?.user.id]);
  useEffect(() => {
    if (!session || Platform.OS === "web") return;
    if (!push) {
      void unregisterPush().catch(() => {});
      return;
    }
    void (async () => {
      const permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted) return;
      if (Platform.OS === "android")
        await Notifications.setNotificationChannelAsync("default", {
          name: "Game invitations",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (projectId) {
        const token = await Notifications.getExpoPushTokenAsync({ projectId });
        await api("/notifications/token", { token: token.data });
        await SecureStore.setItemAsync("cabo-push-token", token.data);
      }
    })().catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const roomId = r.notification.request.content.data?.roomId;
      if (typeof roomId === "string")
        router.push(
          r.notification.request.content.data?.kind === "challenge"
            ? "/activity?view=invites"
            : `/room/${roomId}`,
        );
    });
    return () => sub.remove();
  }, [session?.user.id, push]);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.ink,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: c.bg },
            headerBackButtonDisplayMode: "minimal",
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="auth" options={{ title: "Your account" }} />
          <Stack.Screen name="(main)" options={{ headerShown: false }} />
          <Stack.Screen name="room/[id]" options={{ title: "The table" }} />
          <Stack.Screen name="rules" options={{ title: "Advanced Rules" }} />
          <Stack.Screen
            name="join/[token]"
            options={{ title: "Your invitation" }}
          />
          <Stack.Screen name="how-to-play" options={{ title: "How to play" }} />
          <Stack.Screen name="activity" options={{ title: "Your activity" }} />
          <Stack.Screen name="join-game" options={{ title: "Join a table" }} />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

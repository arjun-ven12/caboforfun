import React from "react";
import { Tabs, Redirect } from "expo-router";
import { Text } from "react-native";
import { auth } from "../../src/client";
import { Loading, useTheme } from "../../src/ui";
export default function Main() {
  const { data, isPending } = auth.useSession(),
    c = useTheme();
  if (isPending) return <Loading />;
  if (!data) return <Redirect href="/" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: {
          backgroundColor: c.bg,
          borderTopColor: c.line,
          height: 84,
          paddingTop: 8,
          paddingBottom: 22,
        },
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      {[
        ["index", "Play", "◇"],
        ["friends", "Friends", "♧"],
        ["profile", "You", "○"],
        ["settings", "Settings", "☷"],
      ].map(([name, title, icon]) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 25, color }}>{icon}</Text>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

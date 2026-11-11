import React from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  type ViewStyle,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path, Rect, Circle } from "react-native-svg";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  ReduceMotion,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import type { Card as CardType } from "@cabo/shared";
import { usePreferences } from "./preferences";
export function useTheme() {
  const scheme = useColorScheme(),
    pref = usePreferences((s) => s.dark);
  const dark = pref === "system" ? scheme === "dark" : pref === "dark";
  return dark
    ? {
        bg: "#171E1B",
        panel: "#232C26",
        ink: "#F2F1E8",
        muted: "#ACB9AF",
        line: "#3C4940",
        accent: "#AECDB8",
        onAccent: "#1D3528",
        red: "#F1A498",
      }
    : {
        bg: "#F5F2EB",
        panel: "#FFFEFA",
        ink: "#242D27",
        muted: "#717A70",
        line: "#E0E3D8",
        accent: "#315B48",
        onAccent: "#FFFFFF",
        red: "#A54B43",
      };
}
export function Txt({
  children,
  size = 16,
  muted = false,
  style,
}: {
  children: React.ReactNode;
  size?: number;
  muted?: boolean;
  style?: any;
}) {
  const c = useTheme();
  return (
    <Text
      style={[
        {
          fontSize: size,
          color: muted ? c.muted : c.ink,
          lineHeight: size * 1.4,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Screen({
  children,
  scroll = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
}) {
  const c = useTheme();
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: c.bg }}
      edges={["top", "left", "right"]}
    >
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.page, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}
export function Title({
  eyebrow,
  title,
  detail,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
}) {
  return (
    <View style={{ gap: 8, marginBottom: 22 }}>
      {eyebrow && (
        <Txt size={11} muted style={{ letterSpacing: 3, fontWeight: "600" }}>
          {eyebrow.toUpperCase()}
        </Txt>
      )}
      <Txt size={36} style={{ fontWeight: "500", letterSpacing: -1.7 }}>
        {title}
      </Txt>
      {detail && <Txt muted>{detail}</Txt>}
    </View>
  );
}
export function Panel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const c = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: c.panel,
          borderRadius: 24,
          padding: 20,
          gap: 14,
          borderWidth: 1,
          borderColor: c.line,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Row({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      {children}
    </View>
  );
}
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
  busy = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  busy?: boolean;
}) {
  const c = useTheme(),
    scale = useSharedValue(1),
    reduced = usePreferences((s) => s.reducedMotion);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View style={animated}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: disabled || busy }}
        disabled={disabled || busy}
        onPressIn={() => {
          scale.value = withSpring(0.975, {
            reduceMotion: reduced ? ReduceMotion.Always : ReduceMotion.System,
          });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, {
            reduceMotion: reduced ? ReduceMotion.Always : ReduceMotion.System,
          });
        }}
        onPress={() => {
          if (usePreferences.getState().haptics) void Haptics.selectionAsync();
          onPress();
        }}
        style={{
          minHeight: 52,
          borderRadius: 17,
          paddingHorizontal: 20,
          paddingVertical: 14,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: secondary ? c.panel : c.accent,
          borderColor: c.line,
          borderWidth: secondary ? 1 : 0,
          opacity: disabled ? 0.45 : 1,
        }}
      >
        {busy ? (
          <ActivityIndicator color={secondary ? c.ink : c.onAccent} />
        ) : (
          <Text
            style={{
              fontSize: 15,
              fontWeight: "600",
              color: secondary ? c.ink : c.onAccent,
            }}
          >
            {title}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const c = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Txt size={13} muted>
        {label}
      </Txt>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.muted}
        autoCapitalize="none"
        {...props}
        style={[
          {
            borderWidth: 1,
            borderColor: c.line,
            borderRadius: 15,
            minHeight: 52,
            paddingHorizontal: 16,
            color: c.ink,
            backgroundColor: c.panel,
            fontSize: 16,
          },
          props.style,
        ]}
      />
    </View>
  );
}
export function ErrorText({ error }: { error: unknown }) {
  const c = useTheme();
  return error ? (
    <Text accessibilityRole="alert" style={{ color: c.red, lineHeight: 22 }}>
      {error instanceof Error
        ? error.message.replaceAll("_", " ")
        : String(error)}
    </Text>
  ) : null;
}
export function Loading() {
  return <ActivityIndicator style={{ padding: 30 }} />;
}
export function Card({
  card,
  selected = false,
  onPress,
  small = false,
  label,
}: {
  card?: CardType;
  selected?: boolean;
  onPress?: () => void;
  small?: boolean;
  label?: string;
}) {
  const c = useTheme();
  const width = small ? 43 : 68,
    height = small ? 61 : 98;
  const red = card?.suit === "hearts" || card?.suit === "diamonds";
  const symbol = card
    ? { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠", none: "✧" }[
        card.suit
      ]
    : "";
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : "image"}
      accessibilityLabel={
        label ||
        (card
          ? `${card.rank} ${card.suit}, ${card.points} points`
          : "Face down card")
      }
      accessibilityState={{ selected }}
      onPress={onPress}
      disabled={!onPress}
      style={{
        width,
        height,
        borderRadius: 10,
        borderWidth: selected ? 3 : 1,
        borderColor: selected ? c.accent : card ? c.line : "#51745E",
        backgroundColor: card ? "#FFFEF8" : "#315744",
        transform: [{ translateY: selected ? -7 : 0 }],
        padding: 5,
        justifyContent: "space-between",
        shadowColor: "#102619",
        shadowOpacity: 0.1,
        shadowOffset: { width: 0, height: 3 },
        shadowRadius: 5,
      }}
    >
      {card ? (
        <>
          <Text
            style={{
              fontWeight: "600",
              fontSize: small ? 14 : 20,
              color: red ? "#A54B43" : "#253C2D",
            }}
          >
            {card.rank}
          </Text>
          <Text
            style={{
              fontSize: small ? 20 : 30,
              textAlign: "center",
              color: red ? "#A54B43" : "#253C2D",
            }}
          >
            {symbol}
          </Text>
        </>
      ) : (
        <Svg width="100%" height="100%" viewBox="0 0 60 90">
          <Rect
            x="3"
            y="3"
            width="54"
            height="84"
            rx="6"
            stroke="#A9B99A"
            strokeWidth=".6"
            fill="none"
          />
          <Path
            d="M30 16L49 45 30 74 11 45Z M30 29L40 45 30 61 20 45Z"
            stroke="#D2D5AF"
            strokeWidth="1"
            fill="none"
          />
          <Circle cx="30" cy="45" r="3" fill="#D2D5AF" />
        </Svg>
      )}
    </Pressable>
  );
}
export function Emblem() {
  return (
    <View style={{ alignItems: "center", paddingVertical: 28 }}>
      <Svg width={150} height={160} viewBox="0 0 150 160">
        <Rect
          x="24"
          y="13"
          width="88"
          height="126"
          rx="15"
          fill="#D8DFC9"
          transform="rotate(-12 68 76)"
        />
        <Rect
          x="40"
          y="20"
          width="88"
          height="126"
          rx="15"
          fill="#315744"
          transform="rotate(8 84 83)"
        />
        <Path
          d="M84 43L108 83 84 123 60 83Z M84 58L98 83 84 108 70 83Z"
          stroke="#E0DBB9"
          strokeWidth="1.5"
          fill="none"
        />
      </Svg>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { padding: 24, gap: 18, paddingBottom: 40 },
});

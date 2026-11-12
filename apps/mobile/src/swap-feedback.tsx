import React, {
  useEffect,
  useRef,
  useState,
  createContext,
  useContext,
} from "react";
import { View, AccessibilityInfo, type ViewInstance } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import type {
  AuthorizedGameView,
  SwapEvent,
  PublicIdentity,
} from "@cabo/shared";
import { Panel, Txt, useTheme } from "./ui";
import { usePreferences } from "./preferences";
const seen = new Map<string, number>();
export function Identity({ person }: { person?: PublicIdentity }) {
  return (
    <View style={{ flexShrink: 1, gap: 2 }}>
      <Txt style={{ fontWeight: "600", flexShrink: 1 }}>
        {person?.displayName || "Player"}
      </Txt>
      {person?.username && (
        <Txt muted size={12} style={{ flexShrink: 1 }}>
          @{person.username}
        </Txt>
      )}
    </View>
  );
}
export function swapMessage(
  e: SwapEvent,
  viewer: string,
  people: Record<string, PublicIdentity>,
) {
  const actor = people[e.actorId]?.displayName || "A player",
    other = people[e.opponentId]?.displayName || "a player";
  return viewer === e.actorId
    ? `You swapped card ${e.actorIndex + 1} with ${other} · their card ${e.opponentIndex + 1}`
    : viewer === e.opponentId
      ? `${actor} swapped a card with you · your card ${e.opponentIndex + 1}`
      : `${actor} swapped card ${e.actorIndex + 1} with ${other} · card ${e.opponentIndex + 1}`;
}
export function useSwapFeedback(
  g: AuthorizedGameView,
  userId: string,
  clockOffset: number,
) {
  const [event, setEvent] = useState<SwapEvent>();
  const currentRound = useRef(g.round);
  currentRound.current = g.round;
  useEffect(() => setEvent(undefined), [g.round]);
  const prefs = usePreferences();
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      timersRef.current.forEach(clearTimeout);
    };
  }, []);
  const key = `cabo-swaps-${userId}-${g.matchId}`;
  useEffect(() => {
    let live = true;
    void (async () => {
      const saved =
        seen.get(key) ??
        Number((await SecureStore.getItemAsync(key).catch(() => null)) || 0);
      if (!live) return;
      let high = Math.max(saved, seen.get(key) || 0);
      for (const e of g.swapHistory) {
        if (e.sequence <= high) continue;
        high = e.sequence;
        // History is retained, but old reconnect events never replay their motion.
        if (Date.now() + clockOffset - e.occurredAt < 2500) {
          timersRef.current.push(
            setTimeout(
              () => {
                if (!alive.current || currentRound.current !== e.round) return;
                setEvent(e);
                if (prefs.haptics)
                  void Haptics.selectionAsync().catch(() => {});
              },
              Math.max(0, e.animateAt - Date.now() - clockOffset),
            ),
          );
        }
      }
      seen.set(key, high);
      await SecureStore.setItemAsync(key, String(high)).catch(() => {});
    })();
    return () => {
      live = false;
    };
  }, [key, g.swapHistory.at(-1)?.id]);
  useEffect(() => {
    if (!event) return;
    const t = setTimeout(() => setEvent(undefined), 3500);
    return () => clearTimeout(t);
  }, [event?.id]);
  return event;
}
type NativeView = ViewInstance;
type Bounds = { x: number; y: number; width: number; height: number };
const Slots = createContext<React.MutableRefObject<
  Map<string, NativeView>
> | null>(null);
const measure = (view: NativeView) =>
  new Promise<Bounds>((resolve) =>
    view.measureInWindow((x, y, width, height) =>
      resolve({ x, y, width, height }),
    ),
  );
function FlyingBack({
  from,
  to,
  progress,
}: {
  from: Bounds;
  to: Bounds;
  progress: ReturnType<typeof useSharedValue<number>>;
}) {
  const c = useTheme();
  const style = useAnimatedStyle(() => ({
    position: "absolute",
    left: from.x + (to.x - from.x) * progress.value,
    top: from.y + (to.y - from.y) * progress.value,
    width: from.width + (to.width - from.width) * progress.value,
    height: from.height + (to.height - from.height) * progress.value,
    opacity: progress.value < 1 ? 1 : 0,
    transform: [{ rotate: `${Math.sin(progress.value * Math.PI) * 8}deg` }],
  }));
  return (
    <Animated.View
      style={[
        {
          backgroundColor: c.accent,
          borderRadius: 13,
          borderWidth: 3,
          borderColor: c.line,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Txt style={{ color: c.onAccent }}>◇</Txt>
    </Animated.View>
  );
}
export function SwapSurface({
  children,
  event,
}: {
  children: React.ReactNode;
  event?: SwapEvent;
}) {
  const refs = useRef(new Map<string, NativeView>()),
    root = useRef<NativeView>(null),
    prefs = usePreferences(),
    progress = useSharedValue(1);
  const [flight, setFlight] = useState<[Bounds, Bounds]>();
  useEffect(() => {
    if (!event || prefs.reducedMotion) return;
    let live = true;
    void (async () => {
      if (await AccessibilityInfo.isReduceMotionEnabled()) return;
      const actor = refs.current.get(`${event.actorId}:${event.actorIndex}`),
        other = refs.current.get(`${event.opponentId}:${event.opponentIndex}`);
      if (!root.current || !actor || !other) return;
      const [r, a, b] = await Promise.all([
        measure(root.current),
        measure(actor),
        measure(other),
      ]);
      if (!live) return;
      setFlight([
        { ...a, x: a.x - r.x, y: a.y - r.y },
        { ...b, x: b.x - r.x, y: b.y - r.y },
      ]);
      progress.value = 0;
      progress.value = withTiming(1, { duration: 480 });
    })();
    return () => {
      live = false;
    };
  }, [event?.id]);
  return (
    <Slots.Provider value={refs}>
      <View ref={root} collapsable={false} style={{ position: "relative" }}>
        {children}
        {flight && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1000,
            }}
          >
            <FlyingBack from={flight[0]} to={flight[1]} progress={progress} />
            <FlyingBack from={flight[1]} to={flight[0]} progress={progress} />
          </View>
        )}
      </View>
    </Slots.Provider>
  );
}
export function SwapSlot({
  event,
  owner,
  index,
  children,
}: {
  event?: SwapEvent;
  owner: string;
  index: number;
  children: React.ReactNode;
}) {
  const refs = useContext(Slots),
    c = useTheme(),
    glow = useSharedValue(0);
  const affected =
    !!event &&
    ((event.actorId === owner && event.actorIndex === index) ||
      (event.opponentId === owner && event.opponentIndex === index));
  useEffect(() => {
    if (affected)
      glow.value = withSequence(
        withTiming(1, { duration: 100 }),
        withTiming(0, { duration: 2200 }),
      );
  }, [event?.id, affected]);
  const highlight = useAnimatedStyle(() => ({ opacity: glow.value }));
  return (
    <View
      ref={(node) => {
        if (node) refs?.current.set(`${owner}:${index}`, node);
        else refs?.current.delete(`${owner}:${index}`);
      }}
      collapsable={false}
      style={{ position: "relative" }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: -4,
            left: -4,
            right: -4,
            bottom: -4,
            borderRadius: 17,
            borderWidth: 2,
            borderColor: c.accent,
          },
          highlight,
        ]}
      />
      {children}
    </View>
  );
}
export function SwapBanner({
  event,
  viewer,
  people,
}: {
  event?: SwapEvent;
  viewer: string;
  people: Record<string, PublicIdentity>;
}) {
  if (!event) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 2000 }}
    >
      <Panel>
        <View accessibilityLiveRegion="polite">
          <Txt size={14}>{swapMessage(event, viewer, people)}</Txt>
          {[event.actorId, event.opponentId].map(
            (id) =>
              people[id]?.username && (
                <Txt key={id} muted size={11}>
                  @{people[id].username}
                </Txt>
              ),
          )}
        </View>
      </Panel>
    </View>
  );
}

import { identities } from "./identity.js";
import type { PublicIdentity } from "@cabo/shared";
import { db } from "./db.js";
export type NotifyEmit = (
  userId: string,
  notification: {
    id: string;
    kind: string;
    body: string;
    roomId?: string;
    actor?: PublicIdentity;
  },
) => void;
let emit: NotifyEmit = () => {};
export function setNotificationEmitter(fn: NotifyEmit) {
  emit = fn;
}
export async function notify(
  userId: string,
  kind: string,
  body: string,
  roomId?: string,
  actorId?: string,
) {
  const actor = actorId ? (await identities([actorId]))[actorId] : undefined;
  if (actor) body = `${actor.displayName}: ${body}`;
  const n = await db.notification.create({
    data: { userId, kind, body, roomId, actorId },
  });
  emit(userId, { id: n.id, kind, body, roomId, actor });
  const tokens = await db.pushToken.findMany({ where: { userId } });
  if (!tokens.length) return;
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.EXPO_ACCESS_TOKEN
        ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
        : {}),
    },
    body: JSON.stringify(
      tokens.map((t) => ({
        to: t.token,
        title: "CABO",
        body,
        data: { roomId, kind },
        sound: "default",
      })),
    ),
  });
  if (!response.ok) throw new Error("PUSH_DELIVERY_FAILED");
}

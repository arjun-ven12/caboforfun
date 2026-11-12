import { z } from "zod";
import { commandSchema, type PlayerView, type SwapEvent } from "./engine";
export const envelopeSchema = z.object({
  roomId: z.string().min(1).max(100),
  actionId: z.uuid(),
  version: z.number().int().positive(),
  command: commandSchema,
});
export type Envelope = z.infer<typeof envelopeSchema>;
export type Ack<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
export type PublicIdentity = {
  userId: string;
  displayName: string;
  username: string | null;
  kind?: "human" | "bot";
  difficulty?: string;
  personality?: string;
  avatar?: number;
};
export type AuthorizedGameView = PlayerView & {
  matchId: string;
  matchStartedAt: number;
  identities: Record<string, PublicIdentity>;
};
export type SwapNotification = {
  roomId: string;
  matchId: string;
  event: SwapEvent;
  actor: PublicIdentity;
  opponent: PublicIdentity;
  serverTime: number;
};
export interface ClientEvents {
  "game:command": (
    input: Envelope,
    ack: (r: Ack<AuthorizedGameView>) => void,
  ) => void;
  "room:sync": (roomId: string, ack: (r: Ack<unknown>) => void) => void;
}
export interface ServerEvents {
  "game:swap": (event: SwapNotification) => void;
  "profile:updated": (identity: PublicIdentity) => void;
  "game:state": (
    view: AuthorizedGameView & { roomId: string; serverTime: number },
  ) => void;
  "room:changed": (room: { roomId: string }) => void;
  notification: (notification: {
    id: string;
    kind: string;
    body: string;
    roomId?: string;
    actor?: PublicIdentity;
  }) => void;
}

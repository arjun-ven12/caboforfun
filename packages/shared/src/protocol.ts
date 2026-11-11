import { z } from "zod";
import { commandSchema, type PlayerView } from "./engine";
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
export interface ClientEvents {
  "game:command": (input: Envelope, ack: (r: Ack<PlayerView>) => void) => void;
  "room:sync": (roomId: string, ack: (r: Ack<unknown>) => void) => void;
}
export interface ServerEvents {
  "game:state": (view: PlayerView & { roomId: string }) => void;
  "room:changed": (room: { roomId: string }) => void;
  notification: (notification: {
    id: string;
    kind: string;
    body: string;
    roomId?: string;
  }) => void;
}

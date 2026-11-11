import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { io, type Socket } from "socket.io-client";
import { QueryClient } from "@tanstack/react-query";
import type { ClientEvents, ServerEvents } from "@cabo/shared";
export const API = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";
export const auth = createAuthClient({
  baseURL: API,
  plugins: [
    expoClient({ scheme: "cabo", storagePrefix: "cabo", storage: SecureStore }),
  ],
});
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10000 } },
});
export async function api<T = any>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const cookie = await auth.getCookie();
  const response = await fetch(`${API}/api${path}`, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    credentials: "omit",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
let socket: Socket<ServerEvents, ClientEvents> | undefined;
export function connect() {
  if (!socket)
    socket = io(API, {
      autoConnect: false,
      transports: ["websocket"],
      auth: async (cb) => cb({ cookie: await auth.getCookie() }),
    });
  if (!socket.connected) socket.connect();
  return socket;
}
export function disconnect() {
  socket?.disconnect();
}
export async function unregisterPush() {
  const token = await SecureStore.getItemAsync("cabo-push-token");
  if (token) {
    await api("/notifications/token", { token }, "DELETE");
    await SecureStore.deleteItemAsync("cabo-push-token");
  }
}
export async function signOut() {
  disconnect();
  try {
    await unregisterPush();
  } catch {
    await SecureStore.deleteItemAsync("cabo-push-token");
  }
  const result = await auth.signOut();
  if (result.error) throw new Error(result.error.message);
  queryClient.clear();
}
export const intent = {
  get: () => SecureStore.getItemAsync("cabo-invite"),
  set: (v: string) => SecureStore.setItemAsync("cabo-invite", v),
  clear: () => SecureStore.deleteItemAsync("cabo-invite"),
};

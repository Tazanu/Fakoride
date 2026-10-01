/**
 * The one socket this app opens.
 *
 * A single connection for the whole process, deliberately. Every screen that
 * wants a live event subscribes to this one rather than opening its own — a
 * second socket is a second set of keepalives, and keepalives are data a driver
 * paid for out of a day's takings.
 *
 * Reconnection is left to socket.io but tuned down: losing signal on the Soppo
 * climb is normal, so the backoff climbs to thirty seconds rather than hammering
 * a tower that is not there. The server deliberately does NOT mark him offline
 * when this drops, so a reconnect costs nothing but the handshake.
 */

import { io, type Socket } from "socket.io-client";
import { apiBaseUrl, getToken } from "@/api/client";

let socket: Socket | null = null;

/**
 * Open the socket, or hand back the one already open.
 *
 * Returns null when there is no token — the caller is signed out, and opening a
 * socket that the server will refuse is a round trip for nothing.
 */
export async function connectSocket(): Promise<Socket | null> {
  const token = await getToken();
  if (!token) return null;
  if (socket) return socket;

  socket = io(apiBaseUrl(), {
    // The server reads `handshake.auth.token`. A function, not a value, so every
    // reconnection presents the token held *now* — after "sign out everywhere"
    // that is a fresh one, and the old one would be refused.
    auth: (cb) => {
      void getToken().then((current) => cb({ token: current ?? token }));
    },
    // No long-polling fallback: it doubles the request count on a bad line and
    // the one place this app runs, websockets work.
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 2_000,
    reconnectionDelayMax: 30_000,
    timeout: 20_000,
  });
  // The server closes a session's live connection when that session is signed
  // out, and socket.io does not reconnect after a server-side close on its own.
  // One attempt: this phone may have been handed a fresh session in the same
  // moment. A phone that was genuinely signed out is refused, and stops there.
  socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect") setTimeout(() => socket?.connect(), 500);
  });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

/** Signing out. The token is about to stop being valid, so the socket must go. */
export function closeSocket(): void {
  socket?.removeAllListeners();
  socket?.close();
  socket = null;
}

/** Tell the server where he is. Cheap enough to send; never stored on the device. */
export function pushPosition(lat: number, lng: number): void {
  socket?.emit("driver:position", { lat, lng });
}

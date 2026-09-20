/**
 * The trip, as it happens.
 *
 * The rider's half of the socket. Where the driver app listens for work
 * arriving, this listens for a ride she has already booked changing under her:
 *
 *   trip:no_driver        nobody took it — the one she most needs to be told
 *   trip:accepted         somebody is coming
 *   trip:arrived          he is outside
 *   trip:started          the PIN worked and they are moving
 *   trip:completed        done
 *   trip:driver_cancelled he dropped it; we are looking again
 *
 * Everything here is a status change on one trip, so rather than hold six
 * flags this keeps the last event and a version counter. The trip screen
 * re-reads the trip from the API when the counter moves — the socket says
 * *that* something changed, and the API says what it changed to. One source of
 * truth for the trip, and the socket is not it.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import { connectSocket, closeSocket, getSocket } from "./socket";
import { useSession } from "@/session/SessionProvider";

/** What the server just told us about a trip. */
export type TripEvent =
  | "no_driver"
  | "accepted"
  | "arrived"
  | "started"
  | "completed"
  | "driver_cancelled";

type RealtimeState = {
  /** The last thing that happened, and which trip it happened to. */
  last: { tripId: string; event: TripEvent } | null;
  /** Bumped on every event. Screens watch this to know when to re-read. */
  version: number;
  /** Where the taxi is, when the trip room is being watched. */
  driverPosition: { lat: number; lng: number } | null;
  /** Join a trip's room so positions start arriving. */
  watch: (tripId: string) => void;
  connected: boolean;
};

const RealtimeContext = createContext<RealtimeState | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const [last, setLast] = useState<{ tripId: string; event: TripEvent } | null>(null);
  const [version, setVersion] = useState(0);
  const [driverPosition, setDriverPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [connected, setConnected] = useState(false);

  /** Detaches this effect's listeners without closing the shared socket. */
  const cleanup = useRef<(() => void) | null>(null);
  /** Re-joined on every reconnect, because rooms do not survive one. */
  const watching = useRef<string | null>(null);

  const watch = useCallback((tripId: string) => {
    watching.current = tripId;
    getSocket()?.emit("trip:watch", { tripId });
  }, []);

  useEffect(() => {
    if (!me) {
      closeSocket();
      setConnected(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      const socket = await connectSocket();
      if (!socket || cancelled) return;

      const onConnect = () => {
        setConnected(true);
        // A reconnect drops every room, so rejoin the one that matters or the
        // map quietly stops moving and nothing says why.
        if (watching.current) socket.emit("trip:watch", { tripId: watching.current });
      };
      const onDisconnect = () => setConnected(false);

      const bump = (event: TripEvent) => (payload: { tripId: string }) => {
        setLast({ tripId: payload.tripId, event });
        setVersion((v) => v + 1);
      };

      // Every one of these carries the same payload; only the meaning differs.
      const handlers: [string, (payload: { tripId: string }) => void][] = [
        ["trip:no_driver", bump("no_driver")],
        ["trip:accepted", bump("accepted")],
        ["trip:arrived", bump("arrived")],
        ["trip:started", bump("started")],
        ["trip:completed", bump("completed")],
        ["trip:driver_cancelled", bump("driver_cancelled")],
      ];
      for (const [name, fn] of handlers) socket.on(name, fn);

      const onPosition = (p: { lat: number; lng: number }) => setDriverPosition(p);
      socket.on("trip:position", onPosition);
      socket.on("connect", onConnect);
      socket.on("disconnect", onDisconnect);
      if (socket.connected) onConnect();

      cleanup.current = () => {
        for (const [name, fn] of handlers) socket.off(name, fn);
        socket.off("trip:position", onPosition);
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
      };
    })();

    return () => {
      cancelled = true;
      cleanup.current?.();
      cleanup.current = null;
    };
  }, [me?.id]);

  /**
   * Android kills a backgrounded socket without saying so.
   *
   * She will put the phone in her bag while she waits, which is exactly when
   * "he has arrived" needs to land.
   */
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      void connectSocket().then((socket) => setConnected(socket?.connected ?? false));
    });
    return () => sub.remove();
  }, []);

  const value = useMemo(
    () => ({ last, version, driverPosition, watch, connected }),
    [last, version, driverPosition, watch, connected],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeState {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used inside RealtimeProvider");
  return ctx;
}

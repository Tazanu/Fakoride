/**
 * Live events, and the one piece of state that cannot wait for a refresh.
 *
 * Two things arrive here and nowhere else:
 *
 *   trip:offer      a ride, with twelve seconds to answer it
 *   trip:cancelled  the rider walked away, wherever in the app he happens to be
 *
 * An offer is deliberately NOT a screen. A driver who is looking at his earnings
 * when a ride comes in must see it there, without losing what he was doing, so
 * it renders over whatever is on top. The SessionProvider comment holds here
 * too: this changes every few seconds and so keeps its own context, separate
 * from who is signed in.
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
import { AppState, Vibration } from "react-native";
import * as Haptics from "expo-haptics";
import { connectSocket, closeSocket } from "./socket";
import { shift, type TripOffer } from "@/api/driver";
import { useSession } from "@/session/SessionProvider";

type RealtimeState = {
  /** The ride on offer right now, or null. One at a time — the server only ever sends one. */
  offer: TripOffer | null;
  /** Drop the offer once it has been answered or has run out. */
  clearOffer: () => void;
  /** The trip the rider just cancelled, so the trip screen can say so and leave. */
  cancelledTripId: string | null;
  acknowledgeCancellation: () => void;
  connected: boolean;
};

const RealtimeContext = createContext<RealtimeState | null>(null);

export function DriverRealtime({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const [offer, setOffer] = useState<TripOffer | null>(null);
  const [cancelledTripId, setCancelledTripId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  /**
   * The offer's own clock.
   *
   * The server expires it regardless, but a countdown that keeps running after
   * the ride is gone is worse than no countdown — he taps accept and is told no.
   * So we drop it on our side at the same moment.
   */
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Detaches this effect's listeners without closing the shared socket. */
  const cleanup = useRef<(() => void) | null>(null);

  const clearOffer = useCallback(() => {
    if (expiry.current) clearTimeout(expiry.current);
    expiry.current = null;
    // He has answered, so the phone stops asking. A device still buzzing after
    // the decision is made reads as a bug.
    Vibration.cancel();
    setOffer(null);
  }, []);

  const acknowledgeCancellation = useCallback(() => setCancelledTripId(null), []);

  /**
   * Ask the server what he is being offered.
   *
   * The socket event is the normal way an offer arrives, and it is lost if the
   * app was asleep when it was sent. He was woken by the push instead, tapped
   * it, and the app opens here — so it asks. No vibration: the phone already
   * buzzed once for this offer.
   */
  const isDriver = Boolean(me?.driver);
  const recoverOffer = useCallback(async () => {
    if (!isDriver) return;
    try {
      const { offer: held } = await shift.currentOffer();
      if (!held) return;
      setOffer((current) => (current?.tripId === held.tripId ? current : held));
      if (expiry.current) clearTimeout(expiry.current);
      expiry.current = setTimeout(() => {
        Vibration.cancel();
        setOffer(null);
      }, held.expiresInSeconds * 1000);
    } catch {
      // Offline, or not a driver yet. The socket will bring the next one.
    }
  }, [isDriver]);

  useEffect(() => {
    if (!me?.driver) {
      closeSocket();
      setConnected(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      const socket = await connectSocket();
      if (!socket || cancelled) return;

      const onConnect = () => setConnected(true);
      const onDisconnect = () => setConnected(false);

      const onOffer = (payload: TripOffer) => {
        /**
         * Make it impossible to miss.
         *
         * The phone is in a mount on the handlebar or the dash, in sun, with an
         * engine running, and he has twelve seconds. A sheet that only appears
         * is a fare lost to a driver who happened to be looking at the road —
         * which is where he is supposed to be looking.
         *
         * Both, deliberately: the haptic is what he feels through the mount,
         * and the long vibration is what he hears on a cheap Android that
         * renders the haptic as almost nothing.
         */
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        Vibration.vibrate([0, 400, 150, 400]);

        setOffer(payload);
        if (expiry.current) clearTimeout(expiry.current);
        expiry.current = setTimeout(() => {
          Vibration.cancel();
          setOffer(null);
        }, payload.expiresInSeconds * 1000);
      };

      const onCancelled = (payload: { tripId: string }) => {
        setCancelledTripId(payload.tripId);
        // If the thing he is being offered is the thing that just died, it goes.
        setOffer((current) => (current?.tripId === payload.tripId ? null : current));
      };

      socket.on("connect", onConnect);
      socket.on("disconnect", onDisconnect);
      socket.on("trip:offer", onOffer);
      socket.on("trip:cancelled", onCancelled);
      if (socket.connected) setConnected(true);

      cleanup.current = () => {
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
        socket.off("trip:offer", onOffer);
        socket.off("trip:cancelled", onCancelled);
      };
    })();

    return () => {
      cancelled = true;
      cleanup.current?.();
      cleanup.current = null;
    };
  }, [me?.driver?.id]);


  /**
   * Android kills a backgrounded socket without telling anyone.
   *
   * Coming back to the app therefore has to re-check rather than trust the last
   * known state, or he sits on a dead connection believing he is available for
   * work and quietly gets no rides all morning.
   */
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      void connectSocket().then((socket) => setConnected(socket?.connected ?? false));
      void recoverOffer();
    });
    // And once on opening: a cold start from a tapped notification never
    // passes through "active" as a change.
    void recoverOffer();
    return () => sub.remove();
  }, [recoverOffer]);

  const value = useMemo(
    () => ({ offer, clearOffer, cancelledTripId, acknowledgeCancellation, connected }),
    [offer, clearOffer, cancelledTripId, acknowledgeCancellation, connected],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useDriverRealtime(): RealtimeState {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useDriverRealtime must be used inside DriverRealtime");
  return ctx;
}

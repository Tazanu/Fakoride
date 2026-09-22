/**
 * Who is signed in, and what the app is allowed to show them.
 *
 * Somebody signs in once and stays signed in — the token lives for thirty days
 * in the device keystore. Re-typing a phone number and waiting for an SMS every
 * time would be a reason to walk to the junction and flag a taxi instead, or,
 * for a driver, a reason to stop bothering with the app. SMS costs us money per
 * message besides.
 *
 * `me.driver` decides which half of the app opens. It is the only thing that
 * does, so there is no second notion of "mode" to get out of step with it.
 *
 * Context is the right tool here and one of the few places it is: this changes
 * perhaps twice a month. Anything that changes every few seconds — position,
 * the live offer — does not belong in context.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { auth, type Me } from "@/api/session";
import { ApiError, clearToken, getToken, setToken, setUnauthorisedHandler } from "@/api/client";

type SessionState = {
  /** Null until the stored token has been checked. Drives the splash. */
  loading: boolean;
  me: Me | null;
  /** True when we hold a token but could not reach the API to confirm it. */
  staleOffline: boolean;
  signIn: (token: string, me: Me) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [staleOffline, setStaleOffline] = useState(false);

  const load = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      setMe(await auth.me());
      setStaleOffline(false);
    } catch (err) {
      if (err instanceof ApiError && err.offline) {
        // Hold the session. She is standing at a junction with one bar, not
        // signed out — dropping her to sign-in here costs an SMS and a taxi.
        setStaleOffline(true);
      } else {
        await clearToken();
        setMe(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // The client calls this when the API rejects our token outright.
    setUnauthorisedHandler(() => {
      void clearToken().then(() => setMe(null));
    });
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      loading,
      me,
      staleOffline,
      signIn: async (token, user) => {
        await setToken(token);
        setMe(user);
        setStaleOffline(false);
      },
      signOut: async () => {
        await clearToken();
        setMe(null);
      },
      refresh: load,
    }),
    [loading, me, staleOffline, load],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

/**
 * Who is signed in, and what the app is allowed to show them.
 *
 * A driver signs in once and stays signed in — the token lives for thirty days
 * in the device keystore. Re-typing a phone number and waiting for an SMS every
 * morning would be a reason to stop using the app, and SMS costs us money per
 * message besides.
 *
 * Context is the right tool here and one of the few places it is: this changes
 * perhaps twice a month. Anything that changes every few seconds — position,
 * the live offer — does not belong in context.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { auth, type Me } from "@/api/driver";
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
        // Hold the session. He is on a mountain road, not signed out — dropping
        // him to the sign-in screen here would cost an SMS and a working shift.
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

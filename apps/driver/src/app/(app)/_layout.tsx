/**
 * The signed-in half of the app.
 *
 * Guards every screen below it, so no individual screen has to remember to.
 * A driver who loses his token mid-shift lands back on sign-in rather than on a
 * screen quietly failing every request.
 */

import { Redirect, Stack } from "expo-router";
import { useSession } from "@/session/SessionProvider";
import { RealtimeProvider } from "@/realtime/RealtimeProvider";
import { palette } from "@/theme";

export default function AppLayout() {
  const { loading, me } = useSession();

  if (loading) return null;
  if (!me) return <Redirect href="/sign-in" />;
  if (!me.driver || me.driver.status !== "ACTIVE") return <Redirect href="/apply" />;

  const c = palette("light");

  /**
   * The offer lives on the home screen now, not over the stack.
   *
   * It used to be a sheet here so it could cover any screen. The canvas puts it
   * inline instead, and that is the better call for this app: a driver looking
   * at this screen is *waiting* for work, so the offer belongs in the flow of
   * the page where his thumb already is. Two offer surfaces at once was the bug
   * that made the change obvious.
   */
  return (
    <RealtimeProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.paper },
        }}
      />
    </RealtimeProvider>
  );
}

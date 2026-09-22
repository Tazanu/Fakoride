/**
 * The driver's half.
 *
 * Guards every screen below it, so no individual screen has to remember to.
 * A driver who loses his token mid-shift lands back on sign-in rather than on
 * a screen quietly failing every request, and one who has not been approved
 * yet lands back in the application rather than on a home screen with nothing
 * it can do.
 *
 * The offer lives on the home screen, not over the stack. It used to be a
 * sheet here so it could cover any screen; the canvas puts it inline instead,
 * and that is the better call — a driver looking at this screen is *waiting*
 * for work, so the offer belongs in the flow of the page where his thumb
 * already is. Two offer surfaces at once was the bug that made it obvious.
 */

import { Redirect, Stack } from "expo-router";
import { useSession } from "@/session/SessionProvider";
import { DriverRealtime } from "@/realtime/DriverRealtime";
import { palette } from "@/theme";

export default function DriverLayout() {
  const { loading, me } = useSession();

  if (loading) return null;
  if (!me) return <Redirect href="/sign-in" />;
  if (!me.driver) return <Redirect href="/(rider)" />;
  if (me.driver.status !== "ACTIVE") return <Redirect href="/apply" />;

  const c = palette("light");

  return (
    <DriverRealtime>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.paper },
        }}
      />
    </DriverRealtime>
  );
}

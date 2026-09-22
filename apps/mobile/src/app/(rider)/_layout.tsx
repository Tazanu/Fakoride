/**
 * The rider's half.
 *
 * Guards every screen below it, so no individual screen has to remember to.
 * Thin on purpose — a rider is a phone number, and anything standing between
 * installing the app and booking a taxi is a reason to walk to the junction
 * and flag one instead.
 *
 * A driver who lands here is sent to his own side. It is the same account
 * system, so a wrong link or a stale route should not leave somebody on a
 * screen whose every request the API will refuse.
 */

import { Redirect, Stack } from "expo-router";
import { useSession } from "@/session/SessionProvider";
import { RiderRealtime } from "@/realtime/RiderRealtime";
import { palette } from "@/theme";

export default function RiderLayout() {
  const { loading, me } = useSession();

  if (loading) return null;
  if (!me) return <Redirect href="/welcome" />;
  if (me.driver) return <Redirect href="/(driver)" />;

  const c = palette("light");

  return (
    <RiderRealtime>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.paper },
        }}
      />
    </RiderRealtime>
  );
}

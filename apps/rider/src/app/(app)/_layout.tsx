/**
 * The signed-in half of the app.
 *
 * Guards every screen below it, so no individual screen has to remember to.
 * Thinner than the driver's equivalent because there is nothing to approve —
 * a rider is a phone number, and that is deliberate: anything standing between
 * installing the app and booking a taxi is a reason to walk to the junction
 * and flag one instead.
 */

import { Redirect, Stack } from "expo-router";
import { useSession } from "@/session/SessionProvider";
import { RealtimeProvider } from "@/realtime/RealtimeProvider";
import { palette } from "@/theme";

export default function AppLayout() {
  const { loading, me } = useSession();

  if (loading) return null;
  if (!me) return <Redirect href="/welcome" />;

  const c = palette("light");

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

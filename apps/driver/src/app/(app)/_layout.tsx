/**
 * The signed-in half of the app.
 *
 * Guards every screen below it, so no individual screen has to remember to.
 * A driver who loses his token mid-shift lands back on sign-in rather than on a
 * screen quietly failing every request.
 */

import { Redirect, Stack } from "expo-router";
import { useSession } from "@/session/SessionProvider";
import { palette } from "@/theme";

export default function AppLayout() {
  const { loading, me } = useSession();

  if (loading) return null;
  if (!me) return <Redirect href="/sign-in" />;
  if (!me.driver || me.driver.status !== "ACTIVE") return <Redirect href="/apply" />;

  const c = palette("light");

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.paper },
      }}
    />
  );
}

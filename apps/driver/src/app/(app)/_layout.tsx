/**
 * The signed-in half of the app.
 *
 * Guards every screen below it, so no individual screen has to remember to.
 * A driver who loses his token mid-shift lands back on sign-in rather than on a
 * screen quietly failing every request.
 */

import { View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { useSession } from "@/session/SessionProvider";
import { OfferSheet } from "@/realtime/OfferSheet";
import { RealtimeProvider } from "@/realtime/RealtimeProvider";
import { palette } from "@/theme";

export default function AppLayout() {
  const { loading, me } = useSession();

  if (loading) return null;
  if (!me) return <Redirect href="/sign-in" />;
  if (!me.driver || me.driver.status !== "ACTIVE") return <Redirect href="/apply" />;

  const c = palette("light");

  /**
   * The offer sits above the stack, not inside it.
   *
   * A ride can arrive while he is reading his earnings, and it has to be
   * answerable there — pushing a screen would throw away whatever he was doing
   * for something he may well decline.
   */
  return (
    <RealtimeProvider>
      <View style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: c.paper },
          }}
        />
        <OfferSheet />
      </View>
    </RealtimeProvider>
  );
}

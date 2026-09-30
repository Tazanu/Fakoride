/**
 * The root of the rider app.
 *
 * Holds the two things every screen below depends on: the two faces, and who
 * is signed in. Nothing renders until they resolve — a fare that
 * reflows a moment after it appears is the flash of invisible text that
 * design/README.md spends a rule avoiding, and it lands hardest on exactly the
 * cheap handsets a student on the Molyko corridor is carrying.
 */

import { useEffect, useRef } from "react";
import { Stack, useRootNavigationState, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { Archivo_600SemiBold, Archivo_700Bold } from "@expo-google-fonts/archivo";
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from "@expo-google-fonts/manrope";
import { SessionProvider, useSession } from "@/session/SessionProvider";
import { palette } from "@/theme";

void SplashScreen.preventAutoHideAsync();

/**
 * Where a tapped notification takes you.
 *
 * An offer opens the driver's home, which fetches the offer he was woken for.
 * Anything about a trip opens that trip. Handled once per notification, and
 * only once the navigator exists — navigating before the root has mounted is
 * an error expo-router throws rather than ignores.
 */
function NotificationRouting() {
  const response = Notifications.useLastNotificationResponse();
  const router = useRouter();
  const ready = Boolean(useRootNavigationState()?.key);
  const { me } = useSession();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!response || !me || !ready) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;

    const data = response.notification.request.content.data as { kind?: string; tripId?: string };
    if (data.kind === "offer") {
      if (me.driver) router.replace("/(driver)");
    } else if (typeof data.tripId === "string") {
      router.push({ pathname: "/(rider)/trip/[id]", params: { id: data.tripId } });
    }
  }, [response, me, ready, router]);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Archivo_600SemiBold,
    Archivo_700Bold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  useEffect(() => {
    // A missing font must not leave somebody staring at a splash screen. Body
    // text is bundled now too, so a failure falls back to the system face
    // everywhere rather than only in headings — still readable, still shippable.
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  const c = palette("light");

  return (
    <SafeAreaProvider>
      <SessionProvider>
        {/* Dark icons on our near-white ground. Light is the default here.
            No backgroundColor: SDK 57 makes Android edge-to-edge and the prop
            is gone, so the ground behind the bar is the screen itself. */}
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: c.paper },
            animation: "fade",
          }}
        />
        <NotificationRouting />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

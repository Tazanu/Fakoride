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
import { Notifications } from "@/notifications/available";
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
// For its side effect: defines the task Android delivers a driver's position
// to. It must exist before any screen does — see the file.
import "@/driver/presence";
import { openingRide } from "@/ui/back-to-ride";
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
function NotificationRouting({ lib }: { lib: NonNullable<typeof Notifications> }) {
  const response = lib.useLastNotificationResponse();
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
    } else if (typeof data.tripId === "string" && openingRide(data.tripId)) {
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
        {/* Not in a browser: there are no push notifications there, and the hook
            inside throws rather than returning nothing — which left the web
            build, the one used for looking at screens, a blank page. */}
        {/* Not on the web, and not in Expo Go on Android: see notifications/available. */}
        {Notifications ? <NotificationRouting lib={Notifications} /> : null}
      </SessionProvider>
    </SafeAreaProvider>
  );
}

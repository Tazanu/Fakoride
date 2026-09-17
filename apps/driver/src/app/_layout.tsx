/**
 * The root of the driver app.
 *
 * Holds the two things every screen below depends on: the display face, and who
 * is signed in. Nothing renders until the font has resolved — a fare that
 * reflows a moment after it appears is the flash of invisible text that
 * design/README.md spends a rule avoiding, and it lands hardest on exactly the
 * Android Go handsets our drivers carry.
 */

import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  BarlowSemiCondensed_600SemiBold,
  BarlowSemiCondensed_700Bold,
} from "@expo-google-fonts/barlow-semi-condensed";
import { SessionProvider } from "@/session/SessionProvider";
import { palette } from "@/theme";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BarlowSemiCondensed_600SemiBold,
    BarlowSemiCondensed_700Bold,
  });

  useEffect(() => {
    // A missing font must not leave a driver staring at a splash screen. The UI
    // face is the system one either way; only fares and headings fall back.
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
      </SessionProvider>
    </SafeAreaProvider>
  );
}

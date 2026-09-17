/**
 * Where the app opens.
 *
 * Three answers, in order: still checking, not signed in, signed in. The order
 * matters — rendering the sign-in screen for the half-second it takes to read
 * the keystore would flash a phone-number form at a driver who is already
 * signed in, every single morning.
 */

import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSession } from "@/session/SessionProvider";
import { palette } from "@/theme";

export default function Index() {
  const { loading, me } = useSession();
  const c = palette("light");

  if (loading) {
    return (
      <View style={[styles.centre, { backgroundColor: c.paper }]}>
        <ActivityIndicator size="large" color={c.action} />
      </View>
    );
  }

  if (!me) return <Redirect href="/sign-in" />;

  // Signed in but not yet a driver, or still being checked: the application
  // flow owns those, not the home screen.
  if (!me.driver || me.driver.status !== "ACTIVE") return <Redirect href="/apply" />;

  return <Redirect href="/(app)" />;
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
});

/**
 * Where the app opens.
 *
 * Three answers, in order: still checking, not signed in, signed in. The order
 * matters — rendering the welcome screen for the half-second it takes to read
 * the keystore would flash a sign-up pitch at somebody who is already signed
 * in, every single time she opens the app to book a taxi.
 *
 * There is no third state here as there is in the driver app: a rider has no
 * application to be approved, which is the point. She installs it and books.
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

  if (!me) return <Redirect href="/welcome" />;
  return <Redirect href="/(app)" />;
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
});

/**
 * Where the app opens.
 *
 * One app serves both sides, so this is the only place that decides which one
 * somebody gets, and it decides on one fact: whether the account has a driver
 * record. Nothing else — no toggle, no remembered choice, no second login.
 *
 *   still checking   → the spinner, because reading the keystore takes a moment
 *                      and flashing a sign-up pitch at somebody already signed
 *                      in is worse than a blank half-second
 *   nobody           → the welcome screen
 *   no driver record → the rider side; "Start driving" is in there for anybody
 *                      who wants it
 *   driver, mid-application → back to where he left the application
 *   driver, approved → the driver side
 *
 * A driver does not see the rider side. That is the product decision, not an
 * accident of routing: the API makes a driver's account a driver's account, and
 * booking a trip is a rider's route.
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
  if (!me.driver) return <Redirect href="/(rider)" />;
  if (me.driver.status !== "ACTIVE") return <Redirect href="/apply" />;
  return <Redirect href="/(driver)" />;
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
});

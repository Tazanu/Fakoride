/**
 * The first screen anybody sees.
 *
 * A deep teal field with the badge on it, and an ivory sheet at the bottom
 * holding the two doors into the product. The split is the point: a rider and a
 * driver want completely different things, and asking once here is cheaper than
 * a wrong guess that has to be undone later.
 *
 * The safety line sits above both buttons rather than in the small print,
 * because "every driver is checked" is the objection a first-time rider
 * actually has, and answering it before the button is the whole job of this
 * screen.
 *
 * One thing the canvas could assume and this cannot: it draws both doors
 * leading into one app. Here the driver app is a separate install, so that
 * button hands off by scheme and says so plainly when nothing answers.
 */

import { useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Svg, { Circle, Line, Path, Polygon, Rect } from "react-native-svg";
import { ShieldCheckIcon } from "@/ui/icons";
import { logoPalette, palette, radius, space, type } from "@/theme";

const c = palette("light");
const logo = logoPalette;

/** The driver app's own scheme, from its app.json. */
const DRIVER_SCHEME = "fakoride://";

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [opening, setOpening] = useState(false);

  async function openDriverApp() {
    setOpening(true);
    try {
      const can = await Linking.canOpenURL(DRIVER_SCHEME);
      if (can) {
        await Linking.openURL(DRIVER_SCHEME);
        return;
      }
      Alert.alert(
        "Driving is a separate app",
        "Fako Ride Driver is where you sign up to drive. Install it, then open it to apply.",
      );
    } catch {
      Alert.alert("Could not open it", "Install Fako Ride Driver to sign up as a driver.");
    } finally {
      setOpening(false);
    }
  }

  return (
    <View style={styles.flex}>
      <View style={[styles.hero, { paddingTop: insets.top }]}>
        <Badge />
        <View style={styles.words}>
          <Text style={styles.wordmark}>FakoRide</Text>
          <Text style={styles.tagline}>
            Taxi rides across Buea at a fixed price. You see the fare before you book.
          </Text>
        </View>
      </View>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.xl }]}>
        <View style={styles.assurance}>
          <ShieldCheckIcon size={20} color={c.actionText} />
          <Text style={styles.assuranceText}>Every driver is checked before they drive</Text>
        </View>

        <Pressable
          onPress={() => router.push("/sign-in")}
          accessibilityRole="button"
          accessibilityLabel="Continue as a rider"
          style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
        >
          <Text style={styles.primaryLabel}>Continue as a rider</Text>
        </Pressable>

        <Pressable
          onPress={() => void openDriverApp()}
          disabled={opening}
          accessibilityRole="button"
          accessibilityLabel="I drive a taxi"
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryLabel}>I drive a taxi</Text>
        </Pressable>

        <Text style={styles.terms}>
          By continuing you agree to our <Text style={styles.link}>Terms</Text> and{" "}
          <Text style={styles.link}>Privacy Policy</Text>.
        </Text>
      </View>
    </View>
  );
}

/**
 * The badge: Mount Cameroon inside two rings, over a bicycle.
 *
 * Drawn rather than shipped as an image so it stays crisp at any size and
 * recolours with the tokens. The mountain is the one thing every person in Fako
 * can see from wherever they are standing.
 */
function Badge() {
  return (
    <Svg viewBox="0 0 260 260" width={176} height={176} accessibilityLabel="FakoRide badge">
      <Circle cx={130} cy={130} r={122} fill="none" stroke={logo.mint} strokeWidth={3} />
      <Circle cx={130} cy={130} r={110} fill="none" stroke={logo.mint} strokeWidth={1.2} />
      <Polygon points="42,152 90,96 112,118 138,44 164,118 186,96 218,152" fill={logo.mint} />
      <Circle cx={98} cy={214} r={13} fill="none" stroke={logo.amber} strokeWidth={3} />
      <Circle cx={168} cy={214} r={13} fill="none" stroke={logo.amber} strokeWidth={3} />
      <Path
        d="M98 201 L120 193 L147 193 L168 201"
        fill="none"
        stroke={logo.amber}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1={147} y1={193} x2={158} y2={180} stroke={logo.amber} strokeWidth={3} strokeLinecap="round" />
      <Circle cx={133} cy={165} r={10} fill={c.paper} />
      <Rect x={121} y={173} width={24} height={24} rx={8} fill={c.paper} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c.action },
  pressed: { opacity: 0.7 },

  hero: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xl,
    paddingHorizontal: space.xxl,
  },
  words: { alignItems: "center", gap: space.md },
  wordmark: { ...type.title, fontSize: 44, lineHeight: 52, letterSpacing: -0.5, color: c.onAction },
  tagline: { ...type.body, fontSize: 17, lineHeight: 26, color: c.onActionSoft, textAlign: "center" },

  sheet: {
    backgroundColor: c.paper,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: space.xl,
    paddingTop: space.xxl,
    gap: space.md,
  },
  assurance: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingBottom: space.xs },
  assuranceText: { ...type.secondaryStrong, fontSize: 14, color: c.actionText, flexShrink: 1 },

  primary: {
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: c.action,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryPressed: { backgroundColor: c.actionPressed },
  primaryLabel: { ...type.button, color: c.onAction },

  secondary: {
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: c.card,
    borderWidth: 1.5,
    borderColor: c.action,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryLabel: { ...type.button, color: c.action },

  terms: { ...type.secondary, fontSize: 12, lineHeight: 18, color: c.muted, textAlign: "center", marginTop: space.xs },
  link: { color: c.actionText },
});

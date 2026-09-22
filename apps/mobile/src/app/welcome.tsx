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
 * Both doors lead into this app, which is what the canvas always drew. The
 * second one carries `next=apply`, so a taxi man who says so here signs in once
 * and lands in the application rather than on a rider's home screen wondering
 * where the driving went.
 */

import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Svg, { Circle, Path, Polygon, Rect } from "react-native-svg";
import { ShieldCheckIcon } from "@/ui/icons";
import { Press, Rise } from "@/ui/motion";
import { Mountain } from "@/ui/mountain";
import { logoPalette, palette, radius, space, type } from "@/theme";

const c = palette("light");
const logo = logoPalette;

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.flex}>
      <View style={[styles.hero, { paddingTop: insets.top }]}>
        <View style={styles.heroCentre}>
          <Badge />
          <View style={styles.words}>
            <Text style={styles.wordmark}>FakoRide</Text>
            <Text style={styles.tagline}>
              Taxi rides across Buea at a fixed price. You see the fare before you book.
            </Text>
          </View>
        </View>

        {/*
          The mountain sits along the bottom of the teal, under the words
          rather than behind them: a ridge running through a 44pt wordmark
          would cost more contrast than it is worth.
        */}
        <Mountain height={150} />
      </View>

      <Rise style={[styles.sheet, { paddingBottom: insets.bottom + space.xl }]}>
        <View style={styles.assurance}>
          <ShieldCheckIcon size={20} color={c.actionText} />
          <Text style={styles.assuranceText}>Every driver is checked before they drive</Text>
        </View>

        <Press
          onPress={() => router.push("/sign-in")}
          accessibilityLabel="Continue as a rider"
          style={styles.primary}
          pressedStyle={styles.primaryPressed}
        >
          <Text style={styles.primaryLabel}>Continue as a rider</Text>
        </Press>

        <Press
          onPress={() => router.push({ pathname: "/sign-in", params: { next: "apply" } })}
          accessibilityLabel="I drive a taxi"
          style={styles.secondary}
          pressedStyle={styles.pressed}
        >
          <Text style={styles.secondaryLabel}>I drive a taxi</Text>
        </Press>

        <Text style={styles.terms}>
          By continuing you agree to our{" "}
          <Text
            style={styles.link}
            accessibilityRole="link"
            onPress={() => router.push("/terms")}
          >
            Terms
          </Text>{" "}
          and{" "}
          <Text
            style={styles.link}
            accessibilityRole="link"
            onPress={() => router.push("/privacy")}
          >
            Privacy Policy
          </Text>
          .
        </Text>
      </Rise>
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
/**
 * The badge: Mount Cameroon, and a taxi under it.
 *
 * It used to be a bicycle — a rider, two wheels and handlebars — from back
 * when the wedge was bendskins. Buea runs on taxis, and a bicycle was the last
 * piece of the old plan still being shown to every person who opened the app.
 *
 * The windows are knocked out in the field colour rather than drawn. That ties
 * the mark to the teal hero it sits on, which is the only place it is used.
 */
function Badge() {
  return (
    <Svg viewBox="0 0 260 260" width={176} height={176} accessibilityLabel="FakoRide badge">
      <Circle cx={130} cy={130} r={122} fill="none" stroke={logo.mint} strokeWidth={3} />
      <Circle cx={130} cy={130} r={110} fill="none" stroke={logo.mint} strokeWidth={1.2} />
      <Polygon points="42,152 90,96 112,118 138,44 164,118 186,96 218,152" fill={logo.mint} />

      {/* The roof sign first, so the body overlaps its foot. */}
      <Rect x={120} y={156} width={26} height={10} rx={3} fill={logo.amber} />
      <Path
        d="M 74 210 L 77 195 C 78 189, 83 186, 89 186 L 104 186 L 117 171 C 119 168, 123 166, 127 166 L 151 166 C 156 166, 161 169, 163 174 L 168 186 L 179 189 C 186 191, 190 196, 190 203 L 190 210 Z"
        fill={logo.amber}
      />
      <Path
        d="M 112 184 L 122 173 C 123 171, 125 170, 128 170 L 140 170 L 140 184 Z"
        fill={c.action}
      />
      <Path
        d="M 146 170 L 150 170 C 153 170, 155 171, 156 174 L 160 184 L 146 184 Z"
        fill={c.action}
      />

      <Circle cx={101} cy={210} r={13} fill={c.action} stroke={logo.amber} strokeWidth={4} />
      <Circle cx={166} cy={210} r={13} fill={c.action} stroke={logo.amber} strokeWidth={4} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c.action },
  pressed: { opacity: 0.7 },

  // The hero holds two things now: the centred wordmark, and the ridge along
  // its bottom edge. The horizontal padding moved inward to the centred half
  // so the drawing can run the full width of the screen.
  hero: { flexGrow: 1, justifyContent: "flex-end" },
  heroCentre: {
    flex: 1,
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

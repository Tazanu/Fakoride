/**
 * The chrome both legal documents share.
 *
 * Long text, set to be read rather than scrolled past: one column, generous
 * line height, headings that actually break the page up. Somebody reads this
 * on a 5-inch screen on a bus, if they read it at all, and the usual wall of
 * justified 11pt guarantees they will not.
 *
 * Content is passed as data rather than markup so the two documents cannot
 * drift into looking like different products, and so a French translation is
 * a second content file rather than a second screen.
 */

import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { CaretLeftIcon } from "@/ui/icons";
import { Press } from "@/ui/motion";
import { palette, radius, space, touch, type } from "@/theme";

const c = palette("light");

export type Section = {
  heading: string;
  /** Paragraphs. A string starting with "• " is rendered as a bullet. */
  body: string[];
};

export function LegalPage({
  title,
  updated,
  intro,
  sections,
  footer,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: Section[];
  footer?: string;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxl },
      ]}
    >
      <Press onPress={() => router.back()} accessibilityLabel="Go back" style={styles.back}>
        <CaretLeftIcon size={24} color={c.ink} />
      </Press>

      <Text style={styles.h1}>{title}</Text>
      <Text style={styles.updated}>Last updated {updated}</Text>

      <Text style={styles.intro}>{intro}</Text>

      {sections.map((s) => (
        <View key={s.heading} style={styles.section}>
          <Text style={styles.h2}>{s.heading}</Text>
          {s.body.map((p, i) =>
            p.startsWith("• ") ? (
              <View key={i} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bullet}>{p.slice(2)}</Text>
              </View>
            ) : (
              <Text key={i} style={styles.p}>
                {p}
              </Text>
            ),
          )}
        </View>
      ))}

      {footer ? (
        <View style={styles.footer}>
          <Text style={styles.footerText}>{footer}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c.paper },
  page: { paddingHorizontal: space.xl },

  back: { width: touch.min, height: touch.min, justifyContent: "center", marginLeft: -space.sm },

  h1: { ...type.title, color: c.ink, marginTop: space.sm },
  updated: { ...type.secondary, color: c.muted, marginTop: space.xs },
  intro: { ...type.body, lineHeight: 26, color: c.inkSoft, marginTop: space.lg },

  section: { marginTop: space.xl, gap: space.sm },
  h2: { ...type.heading, color: c.ink },
  p: { ...type.body, lineHeight: 26, color: c.inkSoft },

  bulletRow: { flexDirection: "row", gap: space.sm, paddingRight: space.sm },
  bulletDot: { ...type.body, lineHeight: 26, color: c.muted },
  bullet: { ...type.body, lineHeight: 26, color: c.inkSoft, flex: 1 },

  footer: {
    marginTop: space.xxl,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: c.fillMuted,
  },
  footerText: { ...type.secondary, lineHeight: 22, color: c.muted },
});

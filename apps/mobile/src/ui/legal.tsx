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

import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { CaretLeftIcon } from "@/ui/icons";
import { useSession } from "@/session/SessionProvider";
import { Press } from "@/ui/motion";
import { S } from "@/content/strings";
import { useT } from "@/ui/i18n";
import { palette, radius, space, touch, type } from "@/theme";

const c = palette("light");

export type Section = {
  heading: string;
  /** Paragraphs. A string starting with "• " is rendered as a bullet. */
  body: string[];
};

/** One document, in the languages we have it in. */
export type Translated = {
  readonly en: { title: string; updated: string; intro: string; sections: Section[]; footer: string };
  readonly fr: { title: string; updated: string; intro: string; sections: Section[]; footer: string };
};

/**
 * A legal document, in the reader's language.
 *
 * Defaults to the account's language, and to English for somebody who has not
 * signed in — Fako is the anglophone South-West and Buea reads English. But the
 * switch is on the page, not buried in settings, because the person most likely
 * to need French is exactly the one who has no account yet: they are reading
 * this from the welcome screen, before they agree to it.
 */
export function LegalDoc({ doc }: { doc: Translated }) {
  const { me } = useSession();
  const [lang, setLang] = useState<"en" | "fr">(me?.language === "fr" ? "fr" : "en");
  const d = doc[lang];

  return (
    <LegalPage
      title={d.title}
      updated={d.updated}
      intro={d.intro}
      sections={d.sections}
      footer={d.footer}
      lang={lang}
      onLang={setLang}
    />
  );
}

export function LegalPage({
  title,
  updated,
  intro,
  sections,
  footer,
  lang,
  onLang,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: Section[];
  footer?: string;
  lang?: "en" | "fr";
  onLang?: (next: "en" | "fr") => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const t = useT();

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxl },
      ]}
    >
      <Press onPress={() => router.back()} accessibilityLabel={t(S.signIn.goBack)} style={styles.back}>
        <CaretLeftIcon size={24} color={c.ink} />
      </Press>

      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>{title}</Text>
          <Text style={styles.updated}>
            {lang === "fr" ? "Mis à jour le" : "Last updated"} {updated}
          </Text>
        </View>

        {onLang ? (
          <View style={styles.langs}>
            {(["en", "fr"] as const).map((code) => (
              <Pressable
                key={code}
                onPress={() => onLang(code)}
                accessibilityRole="button"
                accessibilityState={{ selected: lang === code }}
                accessibilityLabel={code === "en" ? "Read in English" : "Lire en français"}
                style={[styles.lang, lang === code && styles.langOn]}
              >
                <Text style={[styles.langText, lang === code && styles.langTextOn]}>
                  {code === "en" ? "EN" : "FR"}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

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

  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md, marginTop: space.sm },
  h1: { ...type.title, color: c.ink },

  /* Two letters, not a dropdown. There are two languages and there will be two. */
  langs: { flexDirection: "row", borderRadius: radius.sm, borderWidth: 1, borderColor: c.lineStrong, overflow: "hidden" },
  lang: { paddingHorizontal: space.md, paddingVertical: space.sm, minWidth: 44, alignItems: "center" },
  langOn: { backgroundColor: c.action },
  langText: { ...type.secondaryStrong, color: c.muted },
  langTextOn: { color: c.onAction },
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

/**
 * Help: how to reach a person.
 *
 * The privacy page has always told people to "call the number on the support
 * screen", and there was no support screen. A rider whose MoMo was charged
 * twice, a driver suspended who thinks it is a mistake, somebody who left a
 * phone in a taxi — each of them needs one place that says how to reach us.
 *
 * The numbers come from the server, not the app, so a change of phone does not
 * wait for everybody to install an update. With none configured the screen
 * still offers email, and the police number always.
 *
 * Reachable signed in or not: the person locked out of their account is the
 * one most likely to need it.
 */

import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { CaretLeftIcon, PhoneCallIcon, WarningIcon } from "@/ui/icons";
import { support, type SupportContacts } from "@/api/session";
import { useSession } from "@/session/SessionProvider";
import { S } from "@/content/strings";
import { useT } from "@/ui/i18n";
import { Press } from "@/ui/motion";
import { palette, radius, space, touch, type } from "@/theme";

const c = palette("light");

/** +237670000000 → 6 70 00 00 00, the way it is read aloud. */
function spaced(phone: string): string {
  const local = phone.replace(/^\+?237/, "");
  return local.replace(/^(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4 $5");
}

export default function Help() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { me } = useSession();
  const [contacts, setContacts] = useState<SupportContacts | null>(null);

  useEffect(() => {
    void support
      .get()
      .then(setContacts)
      // Offline: the email address is the one thing we can still offer.
      .catch(() => setContacts({ phone: null, whatsapp: null, email: "hello@fakoride.cm" }));
  }, []);

  const wa = contacts?.whatsapp?.replace(/^\+/, "");

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.page, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxl }]}
    >
      <Press onPress={() => router.back()} accessibilityLabel={t(S.signIn.goBack)} style={styles.back}>
        <CaretLeftIcon size={24} color={c.ink} />
      </Press>

      <Text style={styles.h1}>{t(S.help.title)}</Text>
      <Text style={styles.sub}>{t(S.help.why)}</Text>

      {contacts?.phone ? (
        <Row
          label={t(S.help.call)}
          value={spaced(contacts.phone)}
          onPress={() => void Linking.openURL(`tel:${contacts.phone}`)}
          icon
        />
      ) : null}
      {wa ? <Row label={t(S.help.whatsapp)} value={spaced(wa)} onPress={() => void Linking.openURL(`https://wa.me/${wa}`)} /> : null}
      {contacts ? (
        <Row label={t(S.help.email)} value={contacts.email} onPress={() => void Linking.openURL(`mailto:${contacts.email}`)} />
      ) : null}

      {/* Not us: when somebody is in danger, the police first, and the alarm in the app second. */}
      <Pressable
        onPress={() => void Linking.openURL("tel:117")}
        accessibilityRole="button"
        accessibilityLabel={t(S.help.police)}
        style={({ pressed }) => [styles.danger, pressed && styles.pressed]}
      >
        <WarningIcon size={20} color={c.danger} />
        <View style={styles.grow}>
          <Text style={styles.dangerTitle}>{t(S.help.police)}</Text>
          <Text style={styles.dangerWhy}>{t(S.help.policeWhy)}</Text>
        </View>
      </Pressable>

      {me ? (
        <Pressable onPress={() => router.push("/reports")} accessibilityRole="button" style={styles.link}>
          <Text style={styles.linkText}>{t(S.account.reports)}</Text>
          <Text style={styles.linkHint}>{t(S.account.reportsWhy)}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value, onPress, icon }: { label: string; value: string; onPress: () => void; icon?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.grow}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
      {icon ? <PhoneCallIcon size={22} color={c.actionText} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c.paper },
  page: { paddingHorizontal: space.xl, gap: space.md },
  pressed: { opacity: 0.6 },
  back: { width: touch.min, height: touch.min, justifyContent: "center", marginLeft: -space.sm },
  h1: { ...type.title, color: c.ink },
  sub: { ...type.bodyPlain, color: c.muted, marginBottom: space.sm },
  grow: { flexGrow: 1, flexShrink: 1 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: touch.min,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.edge,
    backgroundColor: c.card,
  },
  rowLabel: { ...type.secondary, color: c.muted },
  rowValue: { ...type.bodyStrong, color: c.ink },

  danger: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.dangerEdge,
    backgroundColor: c.card,
  },
  dangerTitle: { ...type.bodyStrong, color: c.danger },
  dangerWhy: { ...type.secondary, color: c.inkSoft },

  link: {
    gap: 2,
    marginTop: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.edge,
    backgroundColor: c.card,
  },
  linkText: { ...type.bodyStrong, color: c.ink },
  linkHint: { ...type.secondary, color: c.muted },
});

/**
 * "Call us", with a number behind it.
 *
 * The app tells people to call in the places where something has gone wrong
 * that only a person can sort out — an application refused, a plate somebody
 * else registered. It said so with no number on the screen and none anywhere
 * else in the app. This is the number, as a button that dials it.
 *
 * It comes from the server (see `support` in api/session), so the office can
 * change its phone without everybody installing a new build. Until one is set
 * this renders nothing: a button that dials nothing is the bug being fixed.
 */

import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text } from "react-native";
import { support } from "@/api/session";
import { S } from "@/content/strings";
import { useT } from "@/ui/i18n";
import { palette, touch, type } from "@/theme";

const c = palette("light");

export function CallUs() {
  const t = useT();
  const [phone, setPhone] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    void support
      .get()
      .then((s) => {
        if (!gone) setPhone(s.phone);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, []);

  if (!phone) return null;

  return (
    <Pressable
      onPress={() => void Linking.openURL(`tel:${phone}`)}
      accessibilityRole="button"
      accessibilityLabel={`${t(S.account.callUs)} ${phone}`}
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.label}>
        {t(S.account.callUs)} · {phone}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: touch.min, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.7 },
  label: { ...type.bodyStrong, color: c.actionText },
});

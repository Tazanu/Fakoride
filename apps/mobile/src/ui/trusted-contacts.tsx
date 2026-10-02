/**
 * The people told when you press Get help.
 *
 * Up to three, saved here in advance — the middle of an emergency is not the
 * moment to type a phone number. When Get help is pressed during a ride each
 * one is texted once: who, which taxi, and a link to follow the ride live.
 *
 * The screen says exactly that next to the button that adds somebody, because
 * putting a person's number into an app is a promise about what the app will
 * do with it.
 */

import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError } from "@/api/client";
import { contacts, type TrustedContact } from "@/api/session";
import { S } from "@/content/strings";
import { useT, type Phrase } from "@/ui/i18n";
import { Press } from "@/ui/motion";
import { palette, radius, space, touch, type } from "@/theme";

const c = palette("light");

function errorFor(err: unknown): Phrase {
  if (!(err instanceof ApiError)) return S.account.didNotWork;
  switch (err.code) {
    case "offline":
      return S.account.offline;
    case "bad_phone":
      return S.contacts.badPhone;
    case "own_number":
      return S.contacts.ownNumber;
    case "already_a_contact":
      return S.contacts.already;
    case "too_many_contacts":
      return S.contacts.tooMany;
    default:
      return S.account.didNotWork;
  }
}

/** +237670000001 → 6 70 00 00 01, the way it is read aloud. */
function spaced(phone: string): string {
  const local = phone.replace(/^\+237/, "");
  return local.replace(/^(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4 $5");
}

export function TrustedContacts() {
  const t = useT();
  const [list, setList] = useState<TrustedContact[] | null>(null);
  const [max, setMax] = useState(3);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Phrase | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await contacts.list();
      setList(r.contacts);
      setMax(r.max);
    } catch {
      // Not worth an alarm on the account screen; the section just stays empty.
      setList([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (name.trim().length === 0 || phone.replace(/\D/g, "").length < 9) return;
    setBusy(true);
    setError(null);
    try {
      await contacts.add(name.trim(), phone);
      setName("");
      setPhone("");
      await load();
    } catch (err) {
      setError(errorFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await contacts.remove(id);
      await load();
    } catch (err) {
      setError(errorFor(err));
    } finally {
      setBusy(false);
    }
  }

  if (list === null) return null;
  const room = list.length < max;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t(S.contacts.title)}</Text>
      <Text style={styles.hint}>{t(S.contacts.why)}</Text>

      {list.map((p) => (
        <View key={p.id} style={styles.row}>
          <View style={styles.grow}>
            <Text style={styles.name}>{p.name}</Text>
            <Text style={styles.phone}>{spaced(p.phone)}</Text>
          </View>
          <Pressable
            onPress={() => void remove(p.id)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t(S.contacts.removeOne, { name: p.name })}
            hitSlop={8}
          >
            <Text style={styles.remove}>{t(S.contacts.remove)}</Text>
          </Pressable>
        </View>
      ))}

      {room ? (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t(S.contacts.namePlaceholder)}
            placeholderTextColor={c.muted}
            autoCapitalize="words"
            editable={!busy}
            accessibilityLabel={t(S.contacts.nameLabel)}
            maxLength={40}
          />
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder={t(S.contacts.phonePlaceholder)}
            placeholderTextColor={c.muted}
            keyboardType="phone-pad"
            editable={!busy}
            accessibilityLabel={t(S.contacts.phoneLabel)}
            maxLength={20}
          />
          <Press onPress={() => void add()} disabled={busy} style={styles.add}>
            <Text style={styles.addLabel}>{t(S.contacts.add)}</Text>
          </Press>
        </View>
      ) : (
        <Text style={styles.hint}>{t(S.contacts.full, { n: max })}</Text>
      )}

      {error ? <Text style={styles.error}>{t(error)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  label: { ...type.label, color: c.inkSoft },
  hint: { ...type.secondary, color: c.muted },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.edge,
    backgroundColor: c.card,
  },
  grow: { flexGrow: 1, flexShrink: 1 },
  name: { ...type.bodyStrong, color: c.ink },
  phone: { ...type.secondary, color: c.muted },
  remove: { ...type.secondaryStrong, color: c.danger },

  form: { gap: space.sm },
  input: {
    ...type.body,
    minHeight: touch.min,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.controlEdge,
    backgroundColor: c.card,
    color: c.ink,
  },
  add: {
    minHeight: touch.min,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.action,
    alignItems: "center",
    justifyContent: "center",
  },
  addLabel: { ...type.button, color: c.actionText },
  error: { ...type.secondary, color: c.danger },
});

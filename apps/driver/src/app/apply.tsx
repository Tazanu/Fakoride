/**
 * Applying to drive, and waiting to hear back.
 *
 * One screen for two states, because they are the same moment to the person
 * holding the phone: "can I start earning yet?"
 *
 * Nothing here grants access. Verification is a human reading an S10 licence
 * off a card, and this screen's real job is to say so plainly and then keep
 * saying where things stand — a driver waiting in silence is a driver lost.
 */

import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { ApiError } from "@/api/client";
import { onboarding } from "@/api/driver";
import { useSession } from "@/session/SessionProvider";
import { palette, primaryButton, radius, space, touch, type } from "@/theme";
import { keyboardBehavior, useScrollPastKeyboard } from "@/ui/keyboard";

const c = palette("light");

function errorFor(err: unknown): string {
  if (!(err instanceof ApiError)) return "Something went wrong. Try again.";
  switch (err.code) {
    case "offline":
      return "No network. Check your connection and try again.";
    case "already_applied":
      return "You have already applied. We are checking your papers.";
    case "invalid_request":
      return "Check the plate and CNI number, then try again.";
    default:
      return "Something went wrong. Try again.";
  }
}

export default function Apply() {
  const router = useRouter();
  const { me, refresh, signOut } = useSession();
  const insets = useSafeAreaInsets();
  const scroll = useScrollPastKeyboard();

  const [name, setName] = useState(me?.name ?? "");
  const [plate, setPlate] = useState("");
  const [cni, setCni] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = me?.driver?.status ?? null;

  // Coming back to this screen is exactly when he wants to know if anything
  // changed, so re-check rather than making him restart the app.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onboarding.apply({ name: name.trim(), plate: plate.trim(), cniNumber: cni.trim() });
      await refresh();
    } catch (err) {
      setError(errorFor(err));
    } finally {
      setBusy(false);
    }
  }

  const ready = name.trim().length >= 2 && plate.trim().length >= 4 && cni.trim().length >= 5;

  if (status === "ACTIVE") {
    router.replace("/(app)");
    return null;
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={keyboardBehavior}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={[
          styles.page,
          { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl },
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await refresh();
              setRefreshing(false);
            }}
            tintColor={c.action}
          />
        }
      >
        <Text style={styles.wordmark}>FAKO RIDE</Text>

        {status === null ? (
          <View style={styles.block}>
            <Text style={styles.title}>Drive with us</Text>
            <Text style={styles.help}>
              No commission. You keep every franc of every fare. We charge a flat fee for each day you
              actually work — nothing on the days you stay home.
            </Text>

            <Text style={styles.label}>Your name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Ernest Njie"
              placeholderTextColor={c.muted}
              autoCapitalize="words"
              editable={!busy}
              accessibilityLabel="Your name"
            />

            <Text style={styles.label}>Plate on the taxi</Text>
            <TextInput
              style={styles.input}
              value={plate}
              onChangeText={(v) => setPlate(v.toUpperCase())}
              placeholder="SW 4192 B"
              placeholderTextColor={c.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!busy}
              accessibilityLabel="Plate number as painted on the taxi"
            />
            <Text style={styles.hint}>Exactly as it is painted. Riders check it before they get in.</Text>

            <Text style={styles.label}>CNI number</Text>
            <TextInput
              style={styles.input}
              value={cni}
              onChangeText={setCni}
              placeholder="123456789"
              placeholderTextColor={c.muted}
              autoCorrect={false}
              editable={!busy}
              accessibilityLabel="CNI identity card number"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              onPress={submit}
              disabled={!ready || busy}
              accessibilityRole="button"
              accessibilityLabel="Send my application"
              style={({ pressed }) => [
                styles.primary,
                (!ready || busy) && styles.primaryDisabled,
                pressed && styles.primaryPressed,
              ]}
            >
              {busy ? <ActivityIndicator color={c.onAction} /> : <Text style={styles.primaryLabel}>APPLY TO DRIVE</Text>}
            </Pressable>
          </View>
        ) : (
          <View style={styles.block}>
            <View style={[styles.badge, status === "REJECTED" || status === "SUSPENDED" ? styles.badgeBad : styles.badgeWait]}>
              <Text style={[styles.badgeText, status === "REJECTED" || status === "SUSPENDED" ? styles.badgeTextBad : styles.badgeTextWait]}>
                {status === "PENDING_REVIEW" ? "BEING CHECKED" : status === "SUSPENDED" ? "SUSPENDED" : "NOT ACCEPTED"}
              </Text>
            </View>

            <Text style={styles.title}>
              {status === "PENDING_REVIEW"
                ? "We are checking your papers"
                : status === "SUSPENDED"
                  ? "Your account is on hold"
                  : "We could not accept you"}
            </Text>

            <Text style={styles.help}>
              {status === "PENDING_REVIEW"
                ? "Bring your CNI and your S10 licence to the office so we can see them. We call you within two days."
                : "Call the office and we will explain what happened and what to do next."}
            </Text>

            <Text style={styles.hint}>Pull down to check again.</Text>
          </View>
        )}

        <Pressable
          onPress={signOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          style={styles.secondary}
        >
          <Text style={styles.secondaryLabel}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c.paper },
  page: { paddingHorizontal: space.lg, flexGrow: 1 },
  wordmark: { ...type.title, color: c.action, letterSpacing: 0.5 },
  block: { marginTop: space.xl, gap: space.sm },
  title: { ...type.heading, color: c.ink },
  help: { ...type.bodyPlain, color: c.inkSoft, marginBottom: space.sm },
  hint: { ...type.secondary, color: c.muted },
  label: { ...type.label, color: c.muted, marginTop: space.md },
  input: {
    ...type.body,
    color: c.ink,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.lineStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: touch.min,
    paddingVertical: space.sm,
  },
  error: { ...type.secondary, color: c.danger, marginTop: space.sm },
  primary: { ...primaryButton, backgroundColor: c.action, marginTop: space.lg },
  primaryPressed: { backgroundColor: c.actionPressed },
  primaryDisabled: { opacity: 0.45 },
  primaryLabel: { ...type.heading, color: c.onAction, letterSpacing: 0.5 },
  secondary: { minHeight: touch.min, alignItems: "center", justifyContent: "center", marginTop: space.xl },
  secondaryLabel: { ...type.body, color: c.muted },
  badge: { alignSelf: "flex-start", paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill },
  badgeWait: { backgroundColor: c.actionTint },
  badgeBad: { backgroundColor: c.dangerTint },
  badgeText: { ...type.label },
  badgeTextWait: { color: c.action },
  badgeTextBad: { color: c.danger },
});

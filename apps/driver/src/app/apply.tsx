/**
 * Becoming a driver.
 *
 * Steps 1 and 3 of the canvas's three. Step 2 is the photographs and lives in
 * its own screen, `documents.tsx`, because it is the only one of the three that
 * talks to the camera.
 *
 *   Step 1  who he is and what he drives — this is `/drivers/apply`
 *   Step 3  the waiting, driven by his real status
 *
 * The CNI number sits on step 1 rather than with the documents, which is where
 * the canvas puts the ID card. The API wants the number *and* the photograph:
 * the number is typed here beside the plate, and the card is photographed in
 * step 2. Keeping every typed field on one screen is worth the split.
 */

import { useCallback, useEffect, useState } from "react";
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
import { Redirect, useRouter } from "expo-router";
import Svg, { Circle, Path } from "react-native-svg";
import { CheckIcon } from "@/ui/icons";
import { ApiError } from "@/api/client";
import { geo, onboarding } from "@/api/driver";
import { useSession } from "@/session/SessionProvider";
import { keyboardBehavior, useScrollPastKeyboard } from "@/ui/keyboard";
import { Steps } from "@/ui/steps";
import { palette, radius, space, touch, type } from "@/theme";

const c = palette("light");

function errorFor(err: unknown): string {
  if (!(err instanceof ApiError)) return "That did not work. Try again.";
  switch (err.code) {
    case "offline":
      return "No network. Try again in a moment.";
    case "plate_taken":
      return "That plate is already registered. Call us if it is yours.";
    case "bad_cni":
      return "Check the CNI number — it should be nine digits.";
    default:
      return "That did not work. Try again.";
  }
}

export default function Apply() {
  const { loading, me, refresh, signOut } = useSession();

  if (loading) return null;
  if (!me) return <Redirect href="/sign-in" />;

  const status = me.driver?.status;

  if (status === "PENDING_REVIEW") return <Pending onRefresh={refresh} onSignOut={signOut} />;
  if (status === "REJECTED") return <Rejected onSignOut={signOut} />;
  return <Details />;
}

/** Step 1: who he is, and what he drives. */
function Details() {
  const router = useRouter();
  const { me, refresh } = useSession();
  const insets = useSafeAreaInsets();
  const scroll = useScrollPastKeyboard();

  const [name, setName] = useState(me?.name ?? "");
  const [plate, setPlate] = useState("");
  const [cni, setCni] = useState("");
  const [zones, setZones] = useState<{ code: string; name: string }[]>([]);
  const [homeZone, setHomeZone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void geo
      .zones()
      .then((r) => setZones(r.zones.map((z) => ({ code: z.code, name: z.name }))))
      .catch(() => undefined);
  }, []);

  const ready = name.trim().length > 1 && plate.trim().length > 3 && cni.trim().length >= 8;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onboarding.apply({
        name: name.trim(),
        plate: plate.trim(),
        cniNumber: cni.trim(),
        ...(homeZone ? { homeZone } : {}),
      });
      await refresh();
      // Straight on to the photographs — the application is not much use
      // without them, and sending him back to a waiting screen first would
      // make the documents feel optional.
      router.replace("/documents");
    } catch (err) {
      setError(errorFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={keyboardBehavior}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={[
          styles.page,
          { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Steps step={1} />

        <View style={styles.intro}>
          <Text style={styles.h1}>Tell us about you and your taxi</Text>
          <Text style={styles.sub}>
            Riders see your name, your rating and your plate number before they get in.
          </Text>
        </View>

        <View style={styles.fields}>
          <Field label="Full name, as written on your ID">
            <TextInput
              style={[styles.input, name ? styles.inputOn : null]}
              value={name}
              onChangeText={setName}
              placeholder="Epie Ndive"
              placeholderTextColor={c.muted}
              autoCapitalize="words"
              editable={!busy}
              accessibilityLabel="Full name"
            />
          </Field>

          <Field label="Mobile number" hint="Already confirmed by SMS">
            <View style={styles.readonly}>
              <Text style={styles.readonlyText}>{me?.phone ?? ""}</Text>
            </View>
          </Field>

          <Field label="Plate number on the taxi">
            <TextInput
              style={[styles.input, styles.plate, plate ? styles.inputOn : null]}
              value={plate}
              onChangeText={setPlate}
              placeholder="SW 482 CK"
              placeholderTextColor={c.muted}
              autoCapitalize="characters"
              editable={!busy}
              accessibilityLabel="Plate number"
            />
          </Field>

          <Field label="CNI number" hint="The nine digits on your national ID card">
            <TextInput
              style={[styles.input, cni ? styles.inputOn : null]}
              value={cni}
              onChangeText={(v) => setCni(v.replace(/\D/g, "").slice(0, 9))}
              placeholder="123456789"
              placeholderTextColor={c.muted}
              keyboardType="number-pad"
              editable={!busy}
              accessibilityLabel="CNI number"
            />
          </Field>

          <Field label="Where do you usually drive?">
            {/* A row of chips rather than a picker: fourteen zones is few enough
                to show, and a native select on Android is a modal he has to
                dismiss before he can see what he chose. */}
            <View style={styles.chips}>
              {zones.map((z) => {
                const on = homeZone === z.code;
                return (
                  <Pressable
                    key={z.code}
                    onPress={() => setHomeZone(on ? null : z.code)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={z.name}
                    style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{z.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.spacer} />

        <Pressable
          onPress={() => void submit()}
          disabled={busy || !ready}
          accessibilityRole="button"
          accessibilityLabel="Send my application"
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed, (busy || !ready) && styles.ctaOff]}
        >
          {busy ? (
            <ActivityIndicator color={c.onAction} />
          ) : (
            <Text style={styles.ctaLabel}>Send my application</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Step 3: the waiting, with the three things that have to happen shown in order. */
function Pending({ onRefresh, onSignOut }: { onRefresh: () => Promise<void>; onSignOut: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const check = useCallback(async () => {
    setRefreshing(true);
    await onRefresh().catch(() => undefined);
    setRefreshing(false);
  }, [onRefresh]);

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xl },
      ]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={check} tintColor={c.action} />}
    >
      <Steps step={3} />

      <View style={styles.waitingHead}>
        <WaitingClock />
        <View style={styles.waitingWords}>
          <Text style={styles.h1Centre}>We&apos;re checking your documents</Text>
          <Text style={styles.subCentre}>
            Most applications are reviewed within one working day. We&apos;ll text you as soon as
            it&apos;s done.
          </Text>
        </View>
      </View>

      <View style={styles.checklist}>
        <Progress state="done" label="Details received" />
        <Progress state="now" label="Our team is reviewing them now" />
        <Progress state="next" label="You go online and start earning" />
      </View>

      <View style={styles.spacer} />

      <Pressable
        onPress={() => router.push("/documents")}
        accessibilityRole="button"
        accessibilityLabel="Check or replace my documents"
        style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
      >
        <Text style={styles.ghostLabel}>My documents</Text>
      </Pressable>

      <Pressable
        onPress={check}
        accessibilityRole="button"
        accessibilityLabel="Check again"
        style={({ pressed }) => [styles.ghostQuiet, pressed && styles.pressed]}
      >
        <Text style={styles.ghostQuietLabel}>Check again</Text>
      </Pressable>

      <Pressable onPress={onSignOut} accessibilityRole="button" style={styles.signOut}>
        <Text style={styles.signOutLabel}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function Rejected({ onSignOut }: { onSignOut: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl },
      ]}
    >
      <View style={styles.waitingWords}>
        <Text style={styles.h1Centre}>We could not approve this application</Text>
        <Text style={styles.subCentre}>
          Call us and we will tell you exactly what was wrong. It is usually a document we could not
          read.
        </Text>
      </View>
      <View style={styles.spacer} />
      <Pressable onPress={onSignOut} accessibilityRole="button" style={styles.signOut}>
        <Text style={styles.signOutLabel}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function WaitingClock() {
  return (
    <Svg viewBox="0 0 140 140" width={128} height={128} accessibilityLabel="Under review">
      <Circle cx={70} cy={70} r={66} fill={c.actionTint} />
      <Circle cx={70} cy={70} r={50} fill="none" stroke={c.actionBright} strokeWidth={3} strokeDasharray="10 9" />
      <Path d="M70 46 V70 L86 80" fill="none" stroke={c.action} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** One line of the checklist. State is in the mark's shape, not only its colour. */
function Progress({ state, label }: { state: "done" | "now" | "next"; label: string }) {
  return (
    <View style={styles.progressRow}>
      <View style={[styles.mark, state === "done" && styles.markDone, state === "now" && styles.markNow, state === "next" && styles.markNext]}>
        {state === "done" ? <CheckIcon size={16} color={c.onAction} weight="bold" /> : null}
        {state === "now" ? <View style={styles.markNowDot} /> : null}
      </View>
      <Text style={[styles.progressLabel, state === "next" && styles.progressLabelNext]}>{label}</Text>
    </View>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c.paper },
  page: { flexGrow: 1, paddingHorizontal: space.lg },
  pressed: { opacity: 0.6 },

  intro: { gap: space.sm, marginTop: space.xl },
  h1: { ...type.title, fontSize: 28, lineHeight: 36, color: c.ink },
  h1Centre: { ...type.title, fontSize: 28, lineHeight: 36, color: c.ink, textAlign: "center" },
  sub: { ...type.bodyPlain, color: c.muted },
  subCentre: { ...type.bodyPlain, color: c.muted, textAlign: "center" },

  fields: { gap: space.lg, marginTop: space.xl },
  field: { gap: space.sm },
  label: { ...type.label, color: c.inkSoft },
  hint: { ...type.secondary, fontSize: 12, color: c.muted },

  input: {
    minHeight: 56,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.controlEdge,
    backgroundColor: c.card,
    ...type.body,
    color: c.ink,
  },
  inputOn: { borderColor: c.actionBright },
  plate: { letterSpacing: 0.5 },

  readonly: {
    minHeight: 56,
    justifyContent: "center",
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.track,
    backgroundColor: c.fillMuted,
  },
  readonlyText: { ...type.bodyStrong, fontSize: 16, color: c.inkSoft },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    minHeight: touch.min,
    justifyContent: "center",
    paddingHorizontal: space.lg,
    borderRadius: radius.chip,
    borderWidth: 1.5,
    borderColor: c.controlEdge,
    backgroundColor: c.card,
  },
  chipOn: { borderWidth: 2, borderColor: c.actionBright, backgroundColor: c.actionTint },
  chipText: { ...type.secondaryStrong, color: c.inkSoft },
  chipTextOn: { color: c.action },

  waitingHead: { alignItems: "center", gap: space.xl, marginTop: space.xxl },
  waitingWords: { alignItems: "center", gap: space.sm },

  checklist: {
    marginTop: space.xl,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.edge,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.lg,
  },
  mark: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  markDone: { backgroundColor: c.actionBright },
  markNow: { borderWidth: 2.5, borderColor: c.amber },
  markNowDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: c.amber },
  markNext: { borderWidth: 2, borderColor: c.track },
  progressLabel: { ...type.bodyStrong, color: c.ink, flexShrink: 1 },
  progressLabelNext: { ...type.body, color: c.muted },

  error: { ...type.secondary, color: c.danger, marginTop: space.md },
  spacer: { flexGrow: 1, minHeight: space.xl },

  cta: {
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: c.action,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaPressed: { backgroundColor: c.actionPressed },
  ctaOff: { opacity: 0.45 },
  ctaLabel: { ...type.button, color: c.onAction },

  ghost: {
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: c.card,
    borderWidth: 1.5,
    borderColor: c.controlEdge,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostLabel: { ...type.bodyStrong, fontSize: 16, color: c.inkSoft },
  ghostQuiet: { minHeight: touch.min, alignItems: "center", justifyContent: "center", marginTop: space.sm },
  ghostQuietLabel: { ...type.body, color: c.actionText },

  signOut: { minHeight: touch.min, alignItems: "center", justifyContent: "center", marginTop: space.md },
  signOutLabel: { ...type.body, color: c.muted },
});

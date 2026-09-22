/**
 * Step 2: your documents.
 *
 * Three photographs, and the honest truth about each: what it is, whether we
 * have it, and what happens to it. A man is being asked to photograph his
 * national ID card and his own face before he has earned anything, so the
 * screen says who can see them — "only the FakoRide team" — above the fold
 * rather than in a policy nobody opens.
 *
 * A row that has been sent looks settled: teal edge, a tick, and a quiet
 * Replace. One that has not looks like a slot waiting to be filled: a dashed
 * edge, which is the one place in this design system a dashed border earns its
 * keep — it reads as "something goes here" in a way a solid one does not.
 *
 * The amber note is at the bottom because it is advice, not an error. Blurry
 * photos are the single commonest reason an application sits for three days.
 */

import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { CameraIcon, CheckIcon, UserIcon, WarningIcon } from "@/ui/icons";
import { ApiError } from "@/api/client";
import { driverDocuments, type DocumentKind, type DocumentState } from "@/api/driver";
import { uploadDocument } from "@/api/upload";
import { useSession } from "@/session/SessionProvider";
import { Steps } from "@/ui/steps";
import { palette, radius, space, touch, type } from "@/theme";

const c = palette("light");

/** What each one is called, and why we are asking for it. */
const COPY: Record<DocumentKind, { title: string; asks: string; done: string }> = {
  NATIONAL_ID: {
    title: "National ID card",
    asks: "Tap to take a photo",
    done: "Sent",
  },
  VEHICLE_REGISTRATION: {
    title: "Car registration document",
    asks: "Tap to take a photo",
    done: "Sent",
  },
  DRIVER_PHOTO: {
    title: "Photo of your face",
    asks: "Riders see this before they get in",
    done: "Sent",
  },
};

function errorFor(err: unknown): string {
  if (!(err instanceof ApiError)) return "That did not send. Try again.";
  switch (err.code) {
    case "offline":
      return "No network. Try again in a moment.";
    case "not_an_image":
      return "That file is not a photo. Use the camera.";
    case "file_too_large":
      return "That photo is too large. Take it again.";
    case "storage_unavailable":
      return "We cannot take documents right now. Try again shortly.";
    case "not_open":
      return "This application is closed. Call us.";
    default:
      return "That did not send. Try again.";
  }
}

export default function Documents() {
  const router = useRouter();
  const { loading, me, refresh } = useSession();
  const insets = useSafeAreaInsets();

  const [state, setState] = useState<DocumentState[] | null>(null);
  const [complete, setComplete] = useState(false);
  const [sending, setSending] = useState<DocumentKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await driverDocuments.list();
      setState(r.documents);
      setComplete(r.complete);
      setError(null);
    } catch (err) {
      setError(errorFor(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function take(kind: DocumentKind) {
    setError(null);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        setError("We need the camera to take a photo of your documents.");
        return;
      }

      const shot = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        // Compressed on the phone rather than on the wire. A 4 MB original and
        // a 0.6 MB copy are equally readable by a person checking a card, and
        // one of them costs him a quarter of a day's data.
        quality: 0.6,
        allowsEditing: false,
        exif: false,
      });
      if (shot.canceled || !shot.assets[0]) return;

      setSending(kind);
      await uploadDocument(kind, shot.assets[0].uri);
      await load();
    } catch (err) {
      setError(errorFor(err));
    } finally {
      setSending(null);
    }
  }

  async function submit() {
    // Nothing to send: the photographs are already on the server. This only
    // moves him to the waiting screen, which reads his real status.
    await refresh();
    router.replace("/apply");
  }

  // After the hooks, never before: an early return above them changes the
  // hook order between renders and React tears the component down.
  if (loading) return null;
  if (!me) return <Redirect href="/sign-in" />;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xl },
      ]}
    >
      <Steps step={2} onBack={() => router.replace("/apply")} />

      <View style={styles.intro}>
        <Text style={styles.h1}>Your documents</Text>
        <Text style={styles.sub}>
          Take a clear photo of each one. Only the FakoRide team can see them.
        </Text>
      </View>

      <View style={styles.list}>
        {state === null ? (
          <View style={styles.loading}>
            <ActivityIndicator color={c.action} />
          </View>
        ) : (
          state.map((d) => (
            <DocRow
              key={d.kind}
              doc={d}
              sending={sending === d.kind}
              onPress={() => void take(d.kind)}
            />
          ))
        )}
      </View>

      <View style={styles.advice}>
        <WarningIcon size={18} color={c.hill} />
        <Text style={styles.adviceText}>
          Blurry or cut-off photos slow down your approval. Shoot in good light, flat on a table.
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.spacer} />

      <Pressable
        onPress={() => void submit()}
        disabled={!complete}
        accessibilityRole="button"
        accessibilityLabel="Submit for review"
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed, !complete && styles.ctaOff]}
      >
        <Text style={styles.ctaLabel}>Submit for review</Text>
      </Pressable>

      {!complete && state ? (
        <Text style={styles.ctaHint}>
          {state.filter((d) => d.uploaded).length} of {state.length} sent
        </Text>
      ) : null}
    </ScrollView>
  );
}

function DocRow({
  doc,
  sending,
  onPress,
}: {
  doc: DocumentState;
  sending: boolean;
  onPress: () => void;
}) {
  const copy = COPY[doc.kind];
  const done = doc.uploaded;

  return (
    <Pressable
      onPress={onPress}
      disabled={sending}
      accessibilityRole="button"
      accessibilityLabel={done ? `Replace ${copy.title}` : `Take a photo of your ${copy.title}`}
      accessibilityState={{ checked: done }}
      style={({ pressed }) => [styles.row, done ? styles.rowDone : styles.rowEmpty, pressed && styles.pressed]}
    >
      <View style={[styles.tile, done ? styles.tileDone : styles.tileEmpty]}>
        {sending ? (
          <ActivityIndicator size="small" color={done ? c.actionText : c.muted} />
        ) : done ? (
          <CheckIcon size={22} color={c.actionText} weight="bold" />
        ) : doc.kind === "DRIVER_PHOTO" ? (
          <UserIcon size={22} color={c.muted} />
        ) : (
          <CameraIcon size={22} color={c.muted} />
        )}
      </View>

      <View style={styles.rowWords}>
        <Text style={styles.rowTitle}>{copy.title}</Text>
        <Text style={[styles.rowSub, done && styles.rowSubDone]}>
          {sending ? "Sending…" : done ? copy.done : copy.asks}
        </Text>
      </View>

      {done && !sending ? (
        <View style={styles.replace}>
          <Text style={styles.replaceLabel}>Replace</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c.paper },
  page: { flexGrow: 1, paddingHorizontal: space.lg },
  pressed: { opacity: 0.7 },

  intro: { gap: space.sm, marginTop: space.xl },
  h1: { ...type.title, fontSize: 28, lineHeight: 36, color: c.ink },
  sub: { ...type.bodyPlain, color: c.muted },

  list: { gap: space.md, marginTop: space.xl },
  loading: { paddingVertical: space.xxl, alignItems: "center" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: c.card,
    minHeight: touch.min + space.xl,
  },
  /* Sent: a settled, solid teal edge. */
  rowDone: { borderWidth: 1.5, borderColor: c.actionTintEdge },
  /* Not sent: dashed, which is the one place in this system a dashed border
     earns its keep — it reads as "something goes here". */
  rowEmpty: { borderWidth: 1.5, borderStyle: "dashed", borderColor: c.controlEdge },

  tile: { width: 46, height: 46, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  tileDone: { backgroundColor: c.actionTint },
  tileEmpty: { backgroundColor: c.fillMuted },

  rowWords: { flexGrow: 1, flexShrink: 1, gap: 3 },
  rowTitle: { ...type.bodyStrong, fontFamily: type.button.fontFamily, color: c.ink },
  rowSub: { ...type.secondary, color: c.muted },
  rowSubDone: { color: c.actionText },

  replace: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: c.controlEdge,
    backgroundColor: c.card,
  },
  replaceLabel: { ...type.secondaryStrong, fontSize: 14, color: c.inkSoft },

  advice: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.sm,
    backgroundColor: c.amberTint,
  },
  adviceText: { ...type.secondary, color: c.hill, flexShrink: 1 },

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
  ctaHint: { ...type.secondary, color: c.muted, textAlign: "center", marginTop: space.sm },
});

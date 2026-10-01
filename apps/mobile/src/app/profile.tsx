/**
 * Your account.
 *
 * One screen for both sides, because one app means one account — a driver's
 * profile is a rider's profile with a vehicle attached to it, not a different
 * kind of thing.
 *
 * The photograph is the reason this screen exists. At Mile 17 on a Friday
 * evening a driver is looking for one person among twenty standing in the same
 * spot, holding nothing but a name and a number. A face solves that, and it is
 * why Bolt asks South African riders for a selfie rather than for decoration.
 * It is shown to the other person on a live trip and to nobody else, ever —
 * the API closes that door again the moment the trip ends.
 *
 * So the screen says who can see it, in words, next to the button that sets
 * it. A person handing over their face deserves to be told where it goes
 * before they tap, not in a policy they will never open.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { CameraIcon, CaretLeftIcon, UserIcon } from "@/ui/icons";
import { ApiError, fetchPhotoDataUri } from "@/api/client";
import { profile } from "@/api/session";
import { S } from "@/content/strings";
import { useT, type Phrase } from "@/ui/i18n";
import { uploadProfilePhoto } from "@/api/upload";
import { useSession } from "@/session/SessionProvider";
import { Press } from "@/ui/motion";
import { useScrollPastKeyboard } from "@/ui/keyboard";
import { palette, radius, space, touch, type } from "@/theme";

const c = palette("light");

function errorFor(err: unknown): Phrase {
  if (!(err instanceof ApiError)) return S.account.didNotWork;
  switch (err.code) {
    case "offline":
      return S.account.offline;
    case "not_an_image":
      return S.account.notAnImage;
    case "too_large":
      return S.account.tooLarge;
    default:
      return S.account.didNotWork;
  }
}

export default function Profile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scroll = useScrollPastKeyboard();
  const { me, refresh, signOut, signOutEverywhere } = useSession();
  const t = useT();

  const [photo, setPhoto] = useState<string | null>(null);
  const [name, setName] = useState(me?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<Phrase | null>(null);

  const loadPhoto = useCallback(async () => {
    if (!me?.hasPhoto) {
      setPhoto(null);
      return;
    }
    setPhoto(await fetchPhotoDataUri("/me/photo"));
  }, [me?.hasPhoto]);

  useEffect(() => {
    void loadPhoto();
  }, [loadPhoto]);

  async function take(from: "camera" | "library") {
    setError(null);
    try {
      const permission =
        from === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== "granted") {
        setError(from === "camera" ? S.account.needCamera : S.account.needPhotos);
        return;
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        // Square, and compressed on the phone. This is shown at 96 points; a
        // 4 MB original would cost a quarter of a day's data to send a face.
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.55,
        exif: false,
      };
      const shot =
        from === "camera"
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (shot.canceled || !shot.assets[0]) return;

      setBusy(true);
      await uploadProfilePhoto(shot.assets[0].uri);
      await refresh();
    } catch (err) {
      setError(errorFor(err));
    } finally {
      setBusy(false);
    }
  }

  function choosePhoto() {
    Alert.alert(t(S.account.photoAsk), t(S.account.photoAskWhy), [
      { text: t(S.account.takeOne), onPress: () => void take("camera") },
      { text: t(S.account.chooseOne), onPress: () => void take("library") },
      { text: t(S.account.cancel), style: "cancel" },
    ]);
  }

  function removePhoto() {
    Alert.alert(t(S.account.removeAsk), t(S.account.removeWhy), [
      { text: t(S.account.cancel), style: "cancel" },
      {
        text: t(S.account.remove),
        style: "destructive",
        onPress: () => {
          setBusy(true);
          void profile
            .removePhoto()
            .then(() => refresh())
            .catch((err: unknown) => setError(errorFor(err)))
            .finally(() => setBusy(false));
        },
      },
    ]);
  }

  async function setLanguage(next: "en" | "fr") {
    setBusy(true);
    setError(null);
    try {
      await profile.update({ language: next });
      await refresh();
    } catch (err) {
      setError(errorFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError(S.account.nameTooShort);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await profile.update({ name: trimmed });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(errorFor(err));
    } finally {
      setBusy(false);
    }
  }

  if (!me) return null;

  const driver = me.driver;
  const nameChanged = name.trim() !== (me.name ?? "").trim();

  return (
    <ScrollView
      ref={scroll}
      style={styles.flex}
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxl },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={t(S.signIn.goBack)}
        hitSlop={8}
        style={styles.back}
      >
        <CaretLeftIcon size={24} color={c.ink} />
      </Pressable>

      <Text style={styles.h1}>{t(S.account.title)}</Text>

      <View style={styles.portrait}>
        <Pressable
          onPress={choosePhoto}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t(me.hasPhoto ? S.account.changePhoto : S.account.addPhoto)}
          style={styles.avatarWrap}
        >
          {photo ? (
            <Image source={{ uri: photo }} style={styles.avatar} accessibilityLabel={t(S.account.photoAsk)} />
          ) : (
            <View style={[styles.avatar, styles.avatarEmpty]}>
              <UserIcon size={44} color={c.muted} />
            </View>
          )}
          <View style={styles.camera}>
            <CameraIcon size={18} color={c.onAction} />
          </View>
        </Pressable>

        <Text style={styles.portraitLine}>
          {t(me.hasPhoto ? S.account.photoPrivateSet : S.account.photoPrivateNone)}
        </Text>

        {me.hasPhoto ? (
          <Pressable onPress={removePhoto} disabled={busy} hitSlop={8}>
            <Text style={styles.remove}>{t(S.account.removePhoto)}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t(S.account.yourName)}</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t(S.account.namePlaceholder)}
          placeholderTextColor={c.muted}
          editable={!busy}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={() => nameChanged && void saveName()}
        />
        {nameChanged ? (
          <Press onPress={() => void saveName()} disabled={busy} style={styles.save}>
            <Text style={styles.saveLabel}>{t(busy ? S.account.saving : S.account.saveName)}</Text>
          </Press>
        ) : saved ? (
          <Text style={styles.saved}>{t(S.account.saved)}</Text>
        ) : null}
      </View>

      <View style={styles.facts}>
        <Fact label={t(S.account.phone)} value={me.phone} />
        {driver ? <Fact label={t(S.account.plate)} value={driver.plate} mono /> : null}
        {driver ? (
          <Fact
            label={t(S.account.vehicle)}
            value={t(driver.vehicleType === "CAR" ? S.account.taxi : S.account.moto)}
          />
        ) : null}
        {driver ? (
          <Fact
            label={t(S.account.rating)}
            value={t(S.account.ratingOf, { n: driver.rating.toFixed(1) })}
          />
        ) : null}
        {driver ? <Fact label={t(S.account.trips)} value={`${driver.tripCount}`} /> : null}
      </View>

      {error ? <Text style={styles.error}>{t(error)}</Text> : null}

      {/*
        The language switch.

        The account has carried a language since the first migration, the
        service banner arrives translated, and the legal pages have an EN/FR
        toggle — and there was nowhere to say which you wanted. A French
        speaker got a French privacy policy inside an English app.
      */}
      <View style={styles.field}>
        <Text style={styles.label}>{t(S.account.language)}</Text>
        <View style={styles.langs}>
          {(["en", "fr"] as const).map((code) => {
            const on = (me.language === "fr" ? "fr" : "en") === code;
            return (
              <Pressable
                key={code}
                onPress={() => void setLanguage(code)}
                disabled={busy || on}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.lang, on && styles.langOn]}
              >
                <Text style={[styles.langText, on && styles.langTextOn]}>
                  {t(code === "en" ? S.account.english : S.account.french)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>{t(S.account.languageWhy)}</Text>
      </View>

      {/*
        Where an answer to a complaint arrives. Without this the end-of-trip
        form was a one-way street: she could tell us something went wrong and
        never find out what we did about it.
      */}
      <Pressable
        onPress={() => router.push("/reports")}
        accessibilityRole="button"
        style={styles.rowLink}
      >
        <Text style={styles.rowLinkText}>{t(S.account.reports)}</Text>
        <Text style={styles.rowLinkHint}>{t(S.account.reportsWhy)}</Text>
      </Pressable>

      {/*
        Reachable after you have signed in, not only on the welcome screen you
        saw once and will never see again.
      */}
      <View style={styles.legal}>
        <Pressable onPress={() => router.push("/terms")} accessibilityRole="link" hitSlop={8}>
          <Text style={styles.legalLink}>{t(S.account.terms)}</Text>
        </Pressable>
        <Text style={styles.legalDot}>·</Text>
        <Pressable onPress={() => router.push("/privacy")} accessibilityRole="link" hitSlop={8}>
          <Text style={styles.legalLink}>{t(S.account.privacyShort)}</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => void signOut()} accessibilityRole="button" style={styles.signOut}>
        <Text style={styles.signOutLabel}>{t(S.account.signOut)}</Text>
      </Pressable>

      {/*
        For the phone that was stolen. Signing out only ever reached the phone
        in your hand; this reaches the others, and keeps this one signed in so
        recovering from a theft does not cost another SMS code.
      */}
      <Pressable
        onPress={() =>
          Alert.alert(t(S.account.signOutElsewhereAsk), t(S.account.signOutElsewhereWhy), [
            { text: t(S.account.cancel), style: "cancel" },
            {
              text: t(S.account.signOutElsewhereDo),
              style: "destructive",
              onPress: () => {
                setBusy(true);
                setError(null);
                void signOutEverywhere()
                  .then(() => Alert.alert(t(S.account.signOutElsewhereDone)))
                  .catch((err: unknown) => setError(errorFor(err)))
                  .finally(() => setBusy(false));
              },
            },
          ])
        }
        disabled={busy}
        accessibilityRole="button"
        hitSlop={8}
        style={styles.elsewhere}
      >
        <Text style={styles.elsewhereLabel}>{t(S.account.signOutElsewhere)}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={[styles.factValue, mono ? styles.factMono : null]}>{value}</Text>
    </View>
  );
}

const AVATAR = 112;

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c.paper },
  page: { paddingHorizontal: space.xl, gap: space.xl },

  back: { width: touch.min, height: touch.min, justifyContent: "center", marginLeft: -space.sm },
  h1: { ...type.title, color: c.ink },

  portrait: { alignItems: "center", gap: space.md },
  avatarWrap: { width: AVATAR, height: AVATAR },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: c.fill },
  avatarEmpty: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: c.lineStrong,
    borderStyle: "dashed",
  },
  camera: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.action,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: c.paper,
  },
  portraitLine: {
    ...type.secondary,
    color: c.muted,
    textAlign: "center",
    paddingHorizontal: space.md,
  },
  remove: { ...type.secondaryStrong, color: c.danger },

  field: { gap: space.sm },
  label: { ...type.label, color: c.inkSoft },
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
  save: {
    minHeight: touch.min,
    borderRadius: radius.md,
    backgroundColor: c.action,
    alignItems: "center",
    justifyContent: "center",
  },
  saveLabel: { ...type.button, color: c.onAction },
  saved: { ...type.secondary, color: c.actionText },

  facts: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.edge,
    backgroundColor: c.card,
    paddingHorizontal: space.md,
  },
  fact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.line,
  },
  factLabel: { ...type.body, color: c.muted },
  factValue: { ...type.bodyStrong, color: c.ink },
  factMono: { ...type.plate },

  error: { ...type.secondary, color: c.danger },

  langs: { flexDirection: "row", gap: space.sm },
  lang: {
    flexGrow: 1,
    minHeight: touch.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.lineStrong,
    backgroundColor: c.card,
  },
  langOn: { borderColor: c.action, backgroundColor: c.actionTint },
  langText: { ...type.body, color: c.inkSoft },
  langTextOn: { ...type.bodyStrong, color: c.actionText },
  hint: { ...type.secondary, color: c.muted },

  rowLink: {
    gap: 2,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.edge,
    backgroundColor: c.card,
  },
  rowLinkText: { ...type.bodyStrong, color: c.ink },
  rowLinkHint: { ...type.secondary, color: c.muted },

  legal: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
  legalLink: { ...type.secondaryStrong, color: c.actionText },
  legalDot: { ...type.secondary, color: c.muted },

  signOut: { minHeight: touch.min, alignItems: "center", justifyContent: "center" },
  signOutLabel: { ...type.bodyStrong, color: c.danger },
  elsewhere: { minHeight: touch.min, alignItems: "center", justifyContent: "center" },
  elsewhereLabel: { ...type.secondary, color: c.muted, textDecorationLine: "underline" },
});

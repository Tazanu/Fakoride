/**
 * Signing in: a phone number, then a six-digit code.
 *
 * The only login that works in this market. Email identifies nobody here and a
 * password is one more thing to lose.
 *
 * Two details that are not decoration:
 *
 *   the number field opens the phone keypad, not the full keyboard, because
 *   this is typed one-handed at a junction
 *
 *   every error is chosen from the API's `code`, never rendered from its
 *   message — the API answers in English and this app has to speak French too
 *
 * The code is six boxes over one invisible input rather than six real fields.
 * Six inputs means six focus jumps, and on Android a paste or an SMS autofill
 * lands in the first box and stops. One field holds the whole code; the boxes
 * are a drawing of it.
 *
 * Deviation from the canvas, stated plainly: the canvas puts "your name" on its
 * own screen after the code. The API takes the name as part of verifying, and
 * there is no endpoint to set it afterwards, so it lives on this screen. A
 * separate screen would need an API change, not a layout one.
 */

import { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CaretLeftIcon, InfoIcon } from "@/ui/icons";
import { ApiError } from "@/api/client";
import { auth } from "@/api/rider";
import { useSession } from "@/session/SessionProvider";
import { keyboardBehavior, useScrollPastKeyboard } from "@/ui/keyboard";
import { S } from "@/content/strings";
import { useT, type Phrase } from "@/ui/i18n";
import { palette, radius, space, touch, type } from "@/theme";

const c = palette("light");

const CODE_LENGTH = 6;

/** What she should read, per failure. Never the server's words. */
function errorFor(err: unknown): Phrase {
  if (!(err instanceof ApiError)) return S.signIn.wentWrong;
  switch (err.code) {
    case "offline":
      return S.signIn.noNetwork;
    case "bad_phone":
      return S.signIn.badPhone;
    case "too_many_codes":
      return S.signIn.tooManyCodes;
    case "wrong_code":
      return S.signIn.wrongCode;
    case "code_expired":
      return S.signIn.codeExpired;
    case "sms_unavailable":
      return S.signIn.smsUnavailable;
    default:
      return S.signIn.wentWrong;
  }
}

export default function SignIn() {
  const router = useRouter();
  /** "apply" when the welcome screen's "I drive a taxi" door sent us here. */
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { signIn } = useSession();
  const insets = useSafeAreaInsets();
  const scroll = useScrollPastKeyboard();
  const codeInput = useRef<TextInput>(null);
  const t = useT();

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Phrase | null>(null);
  /**
   * The code, when the local API hands it back.
   *
   * Development only and only against the console sender. On a real build the
   * field is absent and this stays null, so the hint never renders.
   */
  const [devCode, setDevCode] = useState<string | null>(null);

  const phoneReady = phone.replace(/\D/g, "").length >= 9;
  const codeReady = code.length === CODE_LENGTH;

  async function askForCode() {
    setBusy(true);
    setError(null);
    try {
      const { devCode: revealed } = await auth.requestCode(phone);
      setDevCode(revealed ?? null);
      setStep("code");
      setTimeout(() => codeInput.current?.focus(), 250);
    } catch (err) {
      setError(errorFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    setBusy(true);
    setError(null);
    try {
      const { token, user } = await auth.verifyCode({
        phone,
        code,
        ...(name.trim() ? { name: name.trim() } : {}),
      });
      await signIn(token, user);
      // "I drive a taxi" on the welcome screen sends next=apply. Everybody else
      // goes to the index, which decides from the account which side to open.
      router.replace(next === "apply" && !user.driver ? "/apply" : "/");
    } catch (err) {
      setError(errorFor(err));
      setCode("");
      setDevCode(null);
    } finally {
      setBusy(false);
    }
  }

  const onPhone = step === "phone";

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
        <Pressable
          onPress={() => (onPhone ? router.replace("/welcome") : setStep("phone"))}
          accessibilityRole="button"
          accessibilityLabel={t(S.signIn.goBack)}
          hitSlop={8}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <CaretLeftIcon size={24} color={c.ink} />
        </Pressable>

        {onPhone ? (
          <>
            <View style={styles.intro}>
              <Text style={styles.h1}>{t(S.signIn.askNumber)}</Text>
              <Text style={styles.sub}>{t(S.signIn.askNumberWhy)}</Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t(S.signIn.mobileNumber)}</Text>
              <View style={styles.phoneRow}>
                {/* Cameroon only for now, so the code is shown rather than chosen. */}
                <View style={styles.dial}>
                  <Text style={styles.dialText}>+237</Text>
                </View>
                <TextInput
                  style={[styles.input, styles.phoneInput, phone ? styles.inputActive : null]}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder={t(S.signIn.phonePlaceholder)}
                  placeholderTextColor={c.muted}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  editable={!busy}
                  accessibilityLabel={t(S.signIn.mobileNumber)}
                  returnKeyType="go"
                  onSubmitEditing={() => phoneReady && !busy && askForCode()}
                />
              </View>
            </View>

            <View style={styles.infoPanel}>
              <InfoIcon size={18} color={c.actionText} />
              <Text style={styles.infoText}>{t(S.signIn.networks)}</Text>
            </View>

            {error ? <Text style={styles.error}>{t(error)}</Text> : null}

            <View style={styles.spacer} />

            <Cta
              label={t(S.signIn.sendCode)}
              busy={busy}
              disabled={!phoneReady}
              onPress={() => void askForCode()}
            />
          </>
        ) : (
          <>
            <View style={styles.intro}>
              <Text style={styles.h1}>{t(S.signIn.enterCode)}</Text>
              <Text style={styles.sub}>
                {t(S.signIn.sentTo)} <Text style={styles.subStrong}>+237 {phone}</Text>.{" "}
                <Text style={styles.link} onPress={() => setStep("phone")}>
                  {t(S.signIn.changeNumber)}
                </Text>
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t(S.signIn.codeLabel)}</Text>

              {/* One real input, six drawn boxes. */}
              <Pressable onPress={() => codeInput.current?.focus()} accessibilityRole="none">
                <View style={styles.codeRow}>
                  {Array.from({ length: CODE_LENGTH }).map((_, i) => (
                    <View key={i} style={[styles.codeBox, i < code.length && styles.codeBoxOn]}>
                      <Text style={styles.codeDigit}>{code[i] ?? ""}</Text>
                    </View>
                  ))}
                </View>
                <TextInput
                  ref={codeInput}
                  style={styles.hiddenInput}
                  value={code}
                  onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, CODE_LENGTH))}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  maxLength={CODE_LENGTH}
                  editable={!busy}
                  accessibilityLabel={t(S.signIn.sixDigitCode)}
                />
              </Pressable>
            </View>

            {__DEV__ && devCode ? (
              <Pressable onPress={() => setCode(devCode)} accessibilityRole="button">
                <View style={styles.devPanel}>
                  <Text style={styles.devText}>{t(S.signIn.devHint)} {devCode}</Text>
                </View>
              </Pressable>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.label}>{t(S.signIn.yourName)}</Text>
              <TextInput
                style={[styles.input, name ? styles.inputActive : null]}
                value={name}
                onChangeText={setName}
                placeholder={t(S.signIn.namePlaceholder)}
                placeholderTextColor={c.muted}
                autoCapitalize="words"
                editable={!busy}
                accessibilityLabel={t(S.signIn.yourName)}
              />
              <Text style={styles.hint}>{t(S.signIn.nameHint)}</Text>
            </View>

            {error ? <Text style={styles.error}>{t(error)}</Text> : null}

            <View style={styles.spacer} />

            <Cta
              label={t(S.signIn.verify)}
              busy={busy}
              disabled={!codeReady}
              onPress={() => void submitCode()}
            />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Cta({
  label,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.cta,
        pressed && styles.ctaPressed,
        (busy || disabled) && styles.ctaOff,
      ]}
    >
      {busy ? <ActivityIndicator color={c.onAction} /> : <Text style={styles.ctaLabel}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c.paper },
  page: { flexGrow: 1, paddingHorizontal: space.xl },
  pressed: { opacity: 0.6 },

  back: {
    width: 48,
    height: 48,
    marginLeft: -space.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },

  intro: { gap: space.sm, marginTop: space.xl },
  h1: { ...type.title, color: c.ink },
  sub: { ...type.bodyPlain, color: c.muted },
  subStrong: { ...type.bodyPlain, color: c.ink, fontFamily: type.bodyStrong.fontFamily },
  link: { ...type.bodyPlain, color: c.actionText },

  field: { gap: space.sm, marginTop: space.xl },
  label: { ...type.label, color: c.inkSoft },
  hint: { ...type.secondary, color: c.muted },

  phoneRow: { flexDirection: "row", gap: space.sm },
  dial: {
    minHeight: 58,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.controlEdge,
    backgroundColor: c.card,
    alignItems: "center",
    justifyContent: "center",
  },
  dialText: { ...type.bodyStrong, color: c.ink },

  input: {
    minHeight: 58,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.controlEdge,
    backgroundColor: c.card,
    ...type.body,
    color: c.ink,
  },
  phoneInput: { flexGrow: 1, flexShrink: 1 },
  /* Typed-in fields take the bright teal edge the canvas gives a live field. */
  inputActive: { borderColor: c.actionBright },

  codeRow: { flexDirection: "row", gap: space.sm },
  codeBox: {
    flexGrow: 1,
    flexBasis: 0,
    height: 62,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: c.controlEdge,
    backgroundColor: c.card,
    alignItems: "center",
    justifyContent: "center",
  },
  codeBoxOn: { borderColor: c.actionBright },
  codeDigit: { ...type.fareSmall, color: c.ink },
  /* Off-screen rather than hidden: a display:none input cannot take focus. */
  hiddenInput: { position: "absolute", opacity: 0, height: 62, width: "100%" },

  infoPanel: {
    flexDirection: "row",
    gap: space.md,
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.sm,
    backgroundColor: c.actionTint,
  },
  infoText: { ...type.secondary, color: c.inkSoft, flexShrink: 1 },

  devPanel: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.sm,
    backgroundColor: c.amberTint,
  },
  devText: { ...type.secondaryStrong, color: c.hill },

  error: { ...type.secondary, color: c.danger, marginTop: space.md },

  spacer: { flexGrow: 1, minHeight: space.xl },

  cta: {
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: c.action,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space.lg,
  },
  ctaPressed: { backgroundColor: c.actionPressed },
  ctaOff: { opacity: 0.45 },
  ctaLabel: { ...type.button, color: c.onAction },
});

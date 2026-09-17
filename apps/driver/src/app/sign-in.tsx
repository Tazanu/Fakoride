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
import { useRouter } from "expo-router";
import { ApiError } from "@/api/client";
import { auth } from "@/api/driver";
import { useSession } from "@/session/SessionProvider";
import { keyboardBehavior, useScrollPastKeyboard } from "@/ui/keyboard";
import { palette, primaryButton, radius, space, touch, type } from "@/theme";

const c = palette("light");

/** What a rider or driver should read, per failure. Never the server's words. */
function errorFor(err: unknown): string {
  if (!(err instanceof ApiError)) return "Something went wrong. Try again.";
  switch (err.code) {
    case "offline":
      return "No network. Check your connection and try again.";
    case "bad_phone":
      return "Enter a Cameroon number, like 6 70 00 00 00.";
    case "too_many_codes":
      return "Too many codes asked for. Try again in an hour.";
    case "wrong_code":
      return "That code is not right.";
    case "code_expired":
      return "That code has expired. Ask for a new one.";
    case "sms_unavailable":
      return "We cannot send codes right now. Try again shortly.";
    default:
      return "Something went wrong. Try again.";
  }
}

export default function SignIn() {
  const router = useRouter();
  const { signIn } = useSession();
  const insets = useSafeAreaInsets();
  const codeInput = useRef<TextInput>(null);
  const scroll = useScrollPastKeyboard();

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  /**
   * The code, when the local API hands it back.
   *
   * Development only and only against the console sender — see revealsCode in
   * the API. On a real build the field is absent and this stays null, so the
   * hint below never renders.
   */
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneReady = phone.replace(/\D/g, "").length >= 9;
  const codeReady = code.length === 6;

  async function askForCode() {
    setBusy(true);
    setError(null);
    try {
      const { devCode: revealed } = await auth.requestCode(phone);
      setDevCode(revealed ?? null);
      setStep("code");
      // The keypad should already be waiting when the SMS arrives.
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
      router.replace("/");
    } catch (err) {
      setError(errorFor(err));
      setCode("");
      setDevCode(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={keyboardBehavior} keyboardVerticalOffset={insets.top}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={[styles.page, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.wordmark}>FAKO RIDE</Text>
        <Text style={styles.forWho}>For drivers</Text>

        {step === "phone" ? (
          <View style={styles.block}>
            <Text style={styles.title}>What is your number?</Text>
            <Text style={styles.help}>We send you a code to check it is you.</Text>

            {/* A visible label, not a placeholder that vanishes on first keypress. */}
            <Text style={styles.label}>Phone number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="6 70 00 00 00"
              placeholderTextColor={c.muted}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              editable={!busy}
              accessibilityLabel="Phone number"
              returnKeyType="go"
              onSubmitEditing={() => phoneReady && !busy && askForCode()}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              onPress={askForCode}
              disabled={!phoneReady || busy}
              accessibilityRole="button"
              accessibilityLabel="Send me the code"
              style={({ pressed }) => [
                styles.primary,
                (!phoneReady || busy) && styles.primaryDisabled,
                pressed && styles.primaryPressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={c.onAction} />
              ) : (
                <Text style={styles.primaryLabel}>SEND ME THE CODE</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <View style={styles.block}>
            <Text style={styles.title}>Type the code</Text>
            <Text style={styles.help}>We sent six digits to {phone}.</Text>
            {/*
              No SMS leaves the laptop in development, so the API hands the code
              back and it goes here — otherwise signing in on a handset means
              reading the server log on another screen.
            */}
            {__DEV__ && devCode ? (
              <Pressable onPress={() => setCode(devCode)} accessibilityRole="button">
                <Text style={styles.devCode}>No SMS in development. Tap to fill: {devCode}</Text>
              </Pressable>
            ) : null}

            <Text style={styles.label}>Code</Text>
            <TextInput
              ref={codeInput}
              style={[styles.input, styles.codeInput]}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              placeholderTextColor={c.muted}
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              maxLength={6}
              editable={!busy}
              accessibilityLabel="Six digit code"
            />

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

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              onPress={submitCode}
              disabled={!codeReady || busy}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              style={({ pressed }) => [
                styles.primary,
                (!codeReady || busy) && styles.primaryDisabled,
                pressed && styles.primaryPressed,
              ]}
            >
              {busy ? <ActivityIndicator color={c.onAction} /> : <Text style={styles.primaryLabel}>SIGN IN</Text>}
            </Pressable>

            <Pressable
              onPress={() => {
                setStep("phone");
                setCode("");
                setError(null);
              }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Use a different number"
              style={styles.secondary}
            >
              <Text style={styles.secondaryLabel}>Use a different number</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c.paper },
  page: { paddingHorizontal: space.lg, flexGrow: 1 },
  wordmark: { ...type.title, color: c.action, letterSpacing: 0.5 },
  forWho: { ...type.secondary, color: c.muted, marginTop: space.xs },
  block: { marginTop: space.xxl, gap: space.sm },
  title: { ...type.heading, color: c.ink },
  help: { ...type.bodyPlain, color: c.inkSoft, marginBottom: space.md },
  label: { ...type.label, color: c.muted, marginTop: space.md },
  /* Marked as scaffolding, not chrome: the hill colour is the one warning tone
     in Daylight, and nothing else on this screen uses it. */
  devCode: {
    ...type.secondary,
    color: c.hill,
    backgroundColor: c.fill,
    borderRadius: radius.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    marginBottom: space.md,
  },
  input: {
    ...type.body,
    color: c.ink,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.lineStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    // minHeight, never height: the row has to survive a longer French label.
    minHeight: touch.min,
    paddingVertical: space.sm,
  },
  codeInput: { letterSpacing: 8, fontSize: 24 },
  error: { ...type.secondary, color: c.danger, marginTop: space.sm },
  primary: { ...primaryButton, backgroundColor: c.action, marginTop: space.lg },
  primaryPressed: { backgroundColor: c.actionPressed },
  primaryDisabled: { opacity: 0.45 },
  primaryLabel: { ...type.heading, color: c.onAction, letterSpacing: 0.5 },
  secondary: {
    minHeight: touch.min,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space.sm,
  },
  secondaryLabel: { ...type.body, color: c.action },
});

/**
 * Signing in to the console.
 *
 * The same phone-and-code login the apps use, because there is only one account
 * system — an ops account is a user row with role ADMIN, granted by
 * `scripts/grant-admin.ts`. There is no separate password to leak.
 *
 * The one guard worth having: a signed-in user who is not an admin is told so
 * and signed straight back out, rather than being let into a console where
 * every request would 403.
 */

import { useState } from "react";
import { ApiError, clearToken, ops, setToken } from "@/api";

function errorFor(err: unknown): string {
  if (!(err instanceof ApiError)) return "Something went wrong. Try again.";
  switch (err.code) {
    case "offline":
      return "Could not reach the API. Is it running on port 4000?";
    case "bad_phone":
      return "Enter a Cameroon number, like 6 00 00 00 99.";
    case "wrong_code":
      return "That code is not right.";
    case "code_expired":
      return "That code has expired. Ask for a new one.";
    case "too_many_codes":
      return "Too many codes asked for. Try again in an hour.";
    default:
      return "Something went wrong. Try again.";
  }
}

export function SignIn({ onSignedIn }: { onSignedIn: (name: string | null) => void }) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const r = await ops.signIn.requestCode(phone);
      setDevCode(r.devCode ?? null);
      setStep("code");
    } catch (err) {
      setError(errorFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const r = await ops.signIn.verify(phone, code);
      if (r.user.role !== "ADMIN") {
        // Let them no further: every call inside would 403 and the console
        // would look broken rather than closed.
        clearToken();
        setError("That account is not an ops account.");
        setCode("");
        return;
      }
      setToken(r.token);
      onSignedIn(r.user.name);
    } catch (err) {
      setError(errorFor(err));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.page}>
      <form
        style={styles.card}
        onSubmit={(e) => {
          e.preventDefault();
          void (step === "phone" ? ask() : verify());
        }}
      >
        <div style={styles.brand}>
          <svg viewBox="0 0 260 260" width={40} height={40} aria-hidden="true">
            <circle cx={130} cy={130} r={122} fill="none" stroke="var(--c-action)" strokeWidth={8} />
            <polygon points="46,150 92,98 114,120 138,48 164,120 186,98 214,150" fill="var(--c-action)" />
            <circle cx={100} cy={206} r={16} fill="none" stroke="var(--c-amber)" strokeWidth={8} />
            <circle cx={166} cy={206} r={16} fill="none" stroke="var(--c-amber)" strokeWidth={8} />
          </svg>
          <div>
            <h1 style={styles.title}>Fako Ride Ops</h1>
            <p style={styles.subtitle}>
              {step === "phone" ? "Sign in with your ops number." : `Code sent to +237 ${phone}.`}
            </p>
          </div>
        </div>

        {step === "phone" ? (
          <label style={styles.field}>
            <span style={styles.label}>Mobile number</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="6 00 00 00 99"
              inputMode="numeric"
              autoComplete="tel"
              disabled={busy}
              autoFocus
            />
          </label>
        ) : (
          <>
            <label style={styles.field}>
              <span style={styles.label}>Six-digit code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                disabled={busy}
                autoFocus
                style={{ letterSpacing: "0.4em", fontWeight: 700 }}
              />
            </label>

            {devCode ? (
              <button type="button" onClick={() => setCode(devCode)} style={styles.devHint}>
                No SMS in development. Click to fill: {devCode}
              </button>
            ) : null}
          </>
        )}

        {error ? <p style={styles.error}>{error}</p> : null}

        <button
          type="submit"
          disabled={busy || (step === "phone" ? phone.replace(/\D/g, "").length < 9 : code.length !== 6)}
          style={styles.cta}
        >
          {busy ? "Working…" : step === "phone" ? "Send me the code" : "Sign in"}
        </button>

        {step === "code" ? (
          <button
            type="button"
            onClick={() => {
              setStep("phone");
              setCode("");
              setDevCode(null);
              setError(null);
            }}
            style={styles.back}
          >
            Use a different number
          </button>
        ) : null}
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { display: "grid", placeItems: "center", minHeight: "100vh", padding: 24 },
  card: {
    width: "100%",
    maxWidth: 400,
    display: "flex",
    flexDirection: "column",
    gap: 18,
    padding: 28,
    borderRadius: 16,
    background: "var(--c-card)",
    border: "1px solid var(--c-edge)",
  },
  brand: { display: "flex", alignItems: "center", gap: 14 },
  title: { fontSize: 22, color: "var(--c-ink)" },
  subtitle: { margin: "4px 0 0", fontSize: 14, color: "var(--c-muted)" },

  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: "var(--c-ink-soft)" },

  devHint: {
    padding: "10px 14px",
    borderRadius: 12,
    border: 0,
    background: "var(--c-amber-tint)",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--c-hill)",
    textAlign: "left",
  },

  error: { margin: 0, fontSize: 13, color: "var(--c-danger)" },

  cta: {
    minHeight: 48,
    borderRadius: 12,
    border: 0,
    background: "var(--c-action)",
    fontSize: 15,
    fontWeight: 700,
    color: "var(--c-on-action)",
  },
  back: {
    minHeight: 40,
    border: 0,
    background: "transparent",
    fontSize: 14,
    color: "var(--c-action-text)",
  },
};

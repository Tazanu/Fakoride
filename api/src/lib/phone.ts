/**
 * Cameroon phone numbers.
 *
 * The only identity this product has. Kept away from the auth module — which
 * opens a Redis connection on import — so scripts and tests can use it without
 * standing up the world.
 */

/** Thrown with a message a rider can act on, wrapped into an ApiError by callers. */
export class BadPhoneError extends Error {
  constructor() {
    super("Enter a Cameroon number, for example 6 70 00 00 00.");
    this.name = "BadPhoneError";
  }
}

/**
 * Normalise to E.164.
 *
 * Accepts the three forms people actually type: `670000000`, `237670000000`
 * and `+237 67 00 00 00` with any spacing or punctuation. Everything else is
 * rejected rather than guessed at — a mistyped number that silently becomes a
 * valid one sends somebody else's OTP.
 */
export function normalisePhone(input: string): string {
  const digits = input.replace(/[^\d]/g, "");
  if (digits.length === 9 && digits.startsWith("6")) return `+237${digits}`;
  if (digits.length === 12 && digits.startsWith("237")) return `+${digits}`;
  throw new BadPhoneError();
}

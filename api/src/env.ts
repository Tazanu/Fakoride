// First import in the first module that reads process.env, so a local .env is
// loaded before anything below parses it. A no-op in production, where Render
// injects the variables and no .env file exists. Without this the API crashes
// on boot with "Invalid environment" even though the file is sitting right
// there — Prisma's CLI loads .env on its own, so migrations mislead you.
import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_TTL: z.string().default("30d"),

  /** See lib/sms.ts. `console` sends nothing and is refused in production. */
  SMS_PROVIDER: z.enum(["console", "orange"]).default("console"),
  /** From the app registered on developer.orange.com. */
  ORANGE_SMS_CLIENT_ID: z.string().optional(),
  ORANGE_SMS_CLIENT_SECRET: z.string().optional(),
  /** Cameroon's development sender address. Orange assigns this, not us. */
  ORANGE_SMS_SENDER_ADDRESS: z.string().default("tel:+2370000"),
  /** Only once Orange has approved the name. Unapproved, it is left off. */
  ORANGE_SMS_SENDER_NAME: z.string().optional(),

  /**
   * "fake" moves no money and is the only safe default: an environment with no
   * credentials must never silently behave as though it had them.
   */
  MOMO_PROVIDER: z.enum(["fapshi", "fake"]).default("fake"),
  FAPSHI_API_USER: z.string().optional(),
  FAPSHI_API_KEY: z.string().optional(),
  /** Sandbox until somebody deliberately says otherwise. */
  FAPSHI_SANDBOX: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  /** Set on the Fapshi dashboard; arrives as the x-wh-secret header. */
  FAPSHI_WEBHOOK_SECRET: z.string().optional(),
  /** How long a driver may wait before we chase a payment we have not heard about. */
  PAYMENT_RECONCILE_AFTER_SECONDS: z.coerce.number().int().default(45),
  /** How often the reconciler and the access-fee sweep run. */
  PAYMENT_JOB_INTERVAL_SECONDS: z.coerce.number().int().default(30),
  /**
   * How long to leave a driver alone after his MoMo refuses the daily fee.
   * Every attempt is a USSD prompt on his handset, so this is measured in
   * hours, not seconds. Four gives him time to top up between tries.
   */
  ACCESS_FEE_RETRY_AFTER_MINUTES: z.coerce.number().int().default(240),
  /** After this many refusals we stop asking and it becomes an ops call. */
  ACCESS_FEE_MAX_ATTEMPTS: z.coerce.number().int().default(4),

  /**
   * Where driver documents are kept.
   *
   * `local` writes to DOCUMENT_DIR on this machine and is for development only.
   * `r2` is the production adapter and refuses until it is wired, which is the
   * honest failure — a store that silently drops an ID photograph is worse.
   */
  DOCUMENT_STORE: z.enum(["local", "r2"]).default("local"),
  /** Outside the repo by default. Never served statically, never committed. */
  DOCUMENT_DIR: z.string().default(".uploads"),
  /** A phone photo is 2-4 MB. Six leaves room without inviting an upload bomb. */
  DOCUMENT_MAX_BYTES: z.coerce.number().int().default(6 * 1024 * 1024),

  ACCESS_FEE_XAF: z.coerce.number().int().default(500),
  MOBILE_PAYMENT_DISCOUNT_XAF: z.coerce.number().int().default(15),
  OFFER_TTL_SECONDS: z.coerce.number().int().default(12),
  DISPATCH_RADIUS_M: z.coerce.number().int().default(2500),
});

/**
 * Settings that are fine on a laptop and wrong in front of real people.
 *
 * Each of these fails quietly in production rather than loudly: the console SMS
 * sender logs a code nobody reads, so nobody can sign in; the fake payment
 * provider says every charge succeeded, so riders ride free and drivers are
 * "paid" nothing. Better the API refuses to start than starts like that.
 */
const checked = schema.superRefine((e, ctx) => {
  if (e.NODE_ENV !== "production") return;
  if (e.SMS_PROVIDER === "console") {
    ctx.addIssue({ code: "custom", path: ["SMS_PROVIDER"], message: "is console in production — no sign-in code would ever be sent" });
  }
  if (e.MOMO_PROVIDER === "fake") {
    ctx.addIssue({ code: "custom", path: ["MOMO_PROVIDER"], message: "is fake in production — no money would ever move" });
  }
  if (e.JWT_SECRET.length < 32) {
    ctx.addIssue({ code: "custom", path: ["JWT_SECRET"], message: "must be at least 32 characters in production" });
  }
});

const parsed = checked.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";

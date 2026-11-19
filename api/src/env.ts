// First import in the first module that reads process.env, so a local .env is
// loaded before anything below parses it. A no-op in production, where Render
// injects the variables and no .env file exists. Without this the API crashes
// on boot with "Invalid environment" even though the file is sitting right
// there — Prisma's CLI loads .env on its own, so migrations mislead you.
import "dotenv/config";
import { z } from "zod";
import { normalisePhone } from "./lib/phone";

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
   * `postgres` keeps the bytes in the database, and is what production uses.
   */
  DOCUMENT_STORE: z.enum(["local", "postgres"]).default("local"),
  /** Outside the repo by default. Never served statically, never committed. */
  DOCUMENT_DIR: z.string().default(".uploads"),
  /** A phone photo is 2-4 MB. Six leaves room without inviting an upload bomb. */
  DOCUMENT_MAX_BYTES: z.coerce.number().int().default(6 * 1024 * 1024),

  /**
   * How many proxies sit in front of the API. Render puts one there, and
   * without trusting it every request seems to come from Render itself — one
   * address for the whole country, so the first flood would lock everybody out.
   * Zero locally, where nothing is in front and the header could be forged.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  /**
   * Websites allowed to call the API from a browser, comma-separated. Empty by
   * default, because nothing needs to: the app is not a browser, the ops
   * console reaches the API through a same-origin proxy, and a share link is
   * opened directly rather than fetched from another site.
   */
  CORS_ORIGINS: z
    .string()
    .default("")
    .transform((v) => v.split(",").map((o) => o.trim()).filter(Boolean)),
  /**
   * Where the API is reachable from the internet. Links the server writes into
   * text messages — a trusted contact's "follow the ride" — start with this.
   */
  PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
  /**
   * How a person reaches a person. Shown on the app's Help screen, and the
   * privacy page tells people to call it, so it lives here rather than in the
   * app — it can change without anybody installing an update. Unset, the Help
   * screen offers email only.
   */
  // Kept as digits, however it was typed into Render ("+237 6 77 00 00 07"):
  // it ends up in tel: links and text messages.
  SUPPORT_PHONE: z
    .string()
    .transform((v) => v.replace(/[^\d+]/g, "") || undefined)
    .optional(),
  /** If WhatsApp is on a different number. Defaults to SUPPORT_PHONE. */
  SUPPORT_WHATSAPP: z.string().optional(),
  SUPPORT_EMAIL: z.string().email().default("hello@fakoride.cm"),
  /** Scales every rate limit at once — 3 for a launch day on campus Wi-Fi. */
  RATE_LIMIT_MULTIPLIER: z.coerce.number().positive().default(1),

  /** Expo's push endpoint. Overridden only by the test suite, which runs a stand-in. */
  EXPO_PUSH_URL: z.string().url().default("https://exp.host/--/api/v2/push/send"),
  /** Only if "enhanced push security" is switched on for the Expo project. */
  EXPO_ACCESS_TOKEN: z.string().optional(),

  /**
   * How long a driver may go without a position before we stop offering him
   * rides, and soon after take him offline.
   *
   * His app pings every half minute while he is online, locked phone included.
   * Five minutes of silence is not a dip in signal on the Soppo climb — it is a
   * flat battery or a closed app, and every ride offered to it is twelve
   * seconds of a rider's wait thrown away. Zero switches the check off.
   */
  DRIVER_STALE_AFTER_SECONDS: z.coerce.number().int().min(0).default(300),
  /** How often the watchdog looks for quiet drivers and stuck rides. */
  WATCHDOG_INTERVAL_SECONDS: z.coerce.number().int().min(1).default(60),
  /**
   * How long a ride may stay "in progress" before we finish it ourselves.
   *
   * The longest trip on the table is Mutengene to Buea Town, well under an
   * hour. A ride still running after three has a driver who forgot to press
   * Finish, and until it ends his rider cannot book another. Zero: never.
   */
  TRIP_AUTO_FINISH_AFTER_MINUTES: z.coerce.number().int().min(0).default(180),
  /** How long a driver may hold an accepted ride without starting it. Zero: forever. */
  TRIP_PICKUP_TIMEOUT_MINUTES: z.coerce.number().int().min(0).default(60),
  /**
   * How many days an unpaid access fee may age before he cannot go online.
   *
   * A fee for Monday is asked for on Tuesday morning and retried through the
   * day. With three, he is stopped from Thursday — after every automatic
   * attempt has had its chance, and before the debt is worth walking away
   * from. Zero: never stop him.
   */
  ACCESS_FEE_BLOCK_AFTER_DAYS: z.coerce.number().int().min(0).default(3),

  /**
   * Who is texted the moment somebody presses Get help. Comma-separated
   * Cameroon numbers. The ops console shows the alarm too, but a console is
   * only watched while somebody has it open; a phone rings in a pocket.
   */
  OPS_ALERT_PHONES: z
    .string()
    .default("")
    .transform((v) => v.split(",").map((p) => p.trim()).filter(Boolean)),

  ACCESS_FEE_XAF: z.coerce.number().int().default(500),
  MOBILE_PAYMENT_DISCOUNT_XAF: z.coerce.number().int().default(15),
  OFFER_TTL_SECONDS: z.coerce.number().int().default(12),
  DISPATCH_RADIUS_M: z.coerce.number().int().default(2500),
  /**
   * How far from the nearest zone a driver may be and still go online.
   *
   * A phone that puts him in Douala — a laptop's network location usually
   * does, and so can a phone with only a cell-tower fix — went online without
   * a word. He sat there "online" while every rider in Buea was told nobody
   * was around, and neither of them could tell why. Now he is told where his
   * phone says he is. Measured to the nearest zone's centre, so it wants to be
   * comfortably wider than any one zone.
   */
  SERVICE_AREA_KM: z.coerce.number().positive().default(8),
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
  if (e.DOCUMENT_STORE === "local") {
    ctx.addIssue({ code: "custom", path: ["DOCUMENT_STORE"], message: "is local in production — ID photos would sit on a disk a redeploy can wipe" });
  }
  if (!e.PUBLIC_API_URL.startsWith("https://")) {
    ctx.addIssue({ code: "custom", path: ["PUBLIC_API_URL"], message: "must be the https address in production — it goes into links people are texted" });
  }
  if (e.OPS_ALERT_PHONES.length === 0) {
    ctx.addIssue({ code: "custom", path: ["OPS_ALERT_PHONES"], message: "is empty in production — nobody would be told when a rider presses Get help" });
  }
  // Found now, at start-up, rather than at eleven at night when the text to a
  // mistyped number silently goes nowhere.
  for (const entry of e.OPS_ALERT_PHONES) {
    try {
      normalisePhone(entry);
    } catch {
      ctx.addIssue({ code: "custom", path: ["OPS_ALERT_PHONES"], message: `holds "${entry}", which is not a Cameroon mobile number` });
    }
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

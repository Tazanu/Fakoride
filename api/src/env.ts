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

  SMS_PROVIDER: z.enum(["console", "local"]).default("console"),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().default("FAKORIDE"),

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

  ACCESS_FEE_XAF: z.coerce.number().int().default(500),
  MOBILE_PAYMENT_DISCOUNT_XAF: z.coerce.number().int().default(15),
  OFFER_TTL_SECONDS: z.coerce.number().int().default(12),
  DISPATCH_RADIUS_M: z.coerce.number().int().default(2500),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";

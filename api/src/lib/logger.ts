import pino from "pino";
import { env, isProd } from "../env";

export const logger = pino({
  level: isProd ? "info" : "debug",
  base: { service: "fako-ride-api", env: env.NODE_ENV },
  redact: {
    // A ride PIN or a bearer token in a log file is one somebody can use.
    paths: ["req.headers.authorization", "pin", "*.pin", "trip.pin", "otp"],
    censor: "[redacted]",
  },
});

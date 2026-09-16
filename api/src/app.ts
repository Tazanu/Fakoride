import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./env";
import { logger } from "./lib/logger";
import { errorHandler, notFoundHandler } from "./lib/http";
import { authRouter } from "./modules/auth";
import { geoRouter } from "./modules/geo";
import { faresRouter } from "./modules/fares";
import { driversRouter } from "./modules/drivers";
import { tripsRouter } from "./modules/trips";
import { adminRouter } from "./modules/admin";
import { demandRouter } from "./modules/demand";
import { complaintsRouter } from "./modules/safety";
import { publicShareRouter } from "./modules/share";
import { driverPaymentsRouter, paymentsWebhookRouter } from "./modules/payments/routes";

export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "256kb" }));
  app.use(pinoHttp({ logger }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "fako-ride-api", env: env.NODE_ENV });
  });

  app.use("/auth", authRouter());
  app.use("/geo", geoRouter());
  app.use("/fares", faresRouter({ mobileDiscountXaf: env.MOBILE_PAYMENT_DISCOUNT_XAF }));
  app.use("/drivers", driversRouter());
  // Mounted alongside, not inside, so the money routes stay in one file.
  app.use("/drivers", driverPaymentsRouter());
  app.use("/trips", tripsRouter());
  app.use("/demand", demandRouter());
  app.use("/admin", adminRouter());
  app.use("/complaints", complaintsRouter());
  // Unauthenticated: the person watching a trip opens a link, nothing more.
  app.use("/share", publicShareRouter());
  // The provider calls this. Authenticated by a shared secret, not a token.
  app.use("/payments", paymentsWebhookRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

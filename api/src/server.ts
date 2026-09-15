import { createServer } from "node:http";
import { env } from "./env";
import { createApp } from "./app";
import { initRealtime, closeRealtime } from "./realtime";
import { startDispatchSweeper } from "./modules/dispatch";
import { disconnectPrisma } from "./lib/prisma";
import { disconnectRedis } from "./lib/redis";
import { logger } from "./lib/logger";

const server = createServer(createApp());
initRealtime(server);
const sweeper = startDispatchSweeper();

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "Fako Ride API listening");
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down");
  clearInterval(sweeper);
  server.close();
  await closeRealtime();
  await disconnectRedis();
  await disconnectPrisma();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

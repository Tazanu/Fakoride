import { PrismaClient } from "@prisma/client";
import { isProd } from "../env";

export const prisma = new PrismaClient({
  log: isProd ? ["warn", "error"] : ["warn", "error"],
});

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

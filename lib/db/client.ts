import { PrismaClient } from "@prisma/client";

// Next.js dev mode re-evaluates modules on every hot reload. Without a global
// cache each reload opens a new pool and Postgres runs out of connections.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

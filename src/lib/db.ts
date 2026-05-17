import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

declare global {
  var __prisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const filename = url.replace(/^file:/, "");
  const adapter = new PrismaBetterSqlite3({ url: `file:${filename}` });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = global.__prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

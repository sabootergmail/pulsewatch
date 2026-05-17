import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

declare global {
  var __prisma: PrismaClient | undefined;
}

/**
 * Resolve the SQLite DB path. On Vercel (read-only fs except /tmp), we need
 * the DB in /tmp. On first cold-start we copy a seeded snapshot from the
 * deployment bundle so the dashboard isn't empty.
 */
function resolveDbPath(): string {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const target = url.replace(/^file:/, "");

  // If target is writable as-is (dev), use it directly.
  if (!process.env.VERCEL) return target;

  const tmpPath = "/tmp/pulsewatch.db";
  if (!fs.existsSync(tmpPath)) {
    const snapshot = path.join(process.cwd(), "prisma", "snapshot.db");
    if (fs.existsSync(snapshot)) {
      fs.copyFileSync(snapshot, tmpPath);
    }
  }
  return tmpPath;
}

function createClient(): PrismaClient {
  const filename = resolveDbPath();
  const adapter = new PrismaBetterSqlite3({ url: `file:${filename}` });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = global.__prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

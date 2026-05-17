import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

type ExtendedPrismaClient = ReturnType<typeof createClient>;

declare global {
  var __prisma: ExtendedPrismaClient | undefined;
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

function createClient() {
  const filename = resolveDbPath();
  const adapter = new PrismaBetterSqlite3({ url: `file:${filename}` });
  const client = new PrismaClient({ adapter });

  // AuditLog is append-only by contract (pozadavky #5, #8). Enforce it at
  // the Prisma layer so a misbehaving caller can't silently rewrite history.
  // create/createMany pass through; update/delete/upsert throw.
  return client.$extends({
    name: "audit-log-append-only",
    query: {
      auditLog: {
        update() {
          throw new Error("AuditLog is append-only — update is not permitted");
        },
        updateMany() {
          throw new Error("AuditLog is append-only — updateMany is not permitted");
        },
        upsert() {
          throw new Error("AuditLog is append-only — upsert is not permitted");
        },
        delete() {
          throw new Error("AuditLog is append-only — delete is not permitted");
        },
        deleteMany() {
          throw new Error("AuditLog is append-only — deleteMany is not permitted");
        },
      },
    },
  });
}

export const prisma: ExtendedPrismaClient = global.__prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

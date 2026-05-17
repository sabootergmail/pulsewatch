import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

/**
 * BDD spec for the AuditLog append-only invariant (pozadavky #7 unit bod 2,
 * pozadavky #8 forward-only audit log).
 *
 * The contract: AuditLog supports `create` and `createMany`. Any attempt to
 * `update`, `updateMany`, `upsert`, `delete`, or `deleteMany` must throw —
 * enforced by the Prisma client extension in `src/lib/db.ts`.
 *
 * We exercise the *real* extended client against a throwaway SQLite file
 * rather than mocking, because the invariant lives in the extension layer
 * and a mock wouldn't validate it.
 */

const TEST_DB = path.resolve(__dirname, "./audit-invariant.test.db");

beforeAll(() => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  process.env.DATABASE_URL = `file:${TEST_DB}`;
  delete process.env.VERCEL;
  execSync(`npx prisma migrate deploy`, {
    cwd: path.resolve(__dirname, ".."),
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB}` },
  });
});

afterAll(async () => {
  const { prisma } = await import("../src/lib/db");
  await prisma.$disconnect();
  // On Windows the SQLite file briefly stays locked after $disconnect;
  // swallow EBUSY rather than failing the suite on cleanup.
  try {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  } catch {
    // best-effort cleanup
  }
});

describe("AuditLog append-only invariant", () => {
  describe("Given the audit-log-append-only extension is active", () => {
    it("When create is called, then the row is written", async () => {
      const { prisma } = await import("../src/lib/db");
      const entry = await prisma.auditLog.create({
        data: { action: "monitor.create", actor: "test", metadata: null },
      });
      expect(entry.id).toBeTruthy();
      expect(entry.action).toBe("monitor.create");
    });

    it("When update is called on an existing row, then it throws", async () => {
      const { prisma } = await import("../src/lib/db");
      const entry = await prisma.auditLog.create({
        data: { action: "monitor.create", actor: "test" },
      });
      await expect(
        prisma.auditLog.update({
          where: { id: entry.id },
          data: { action: "monitor.update" },
        }),
      ).rejects.toThrow(/append-only/);
    });

    it("When updateMany is called, then it throws", async () => {
      const { prisma } = await import("../src/lib/db");
      await expect(
        prisma.auditLog.updateMany({ where: {}, data: { actor: "rewritten" } }),
      ).rejects.toThrow(/append-only/);
    });

    it("When delete is called, then it throws", async () => {
      const { prisma } = await import("../src/lib/db");
      const entry = await prisma.auditLog.create({
        data: { action: "monitor.create", actor: "test" },
      });
      await expect(
        prisma.auditLog.delete({ where: { id: entry.id } }),
      ).rejects.toThrow(/append-only/);
    });

    it("When deleteMany is called, then it throws", async () => {
      const { prisma } = await import("../src/lib/db");
      await expect(
        prisma.auditLog.deleteMany({ where: {} }),
      ).rejects.toThrow(/append-only/);
    });

    it("When upsert is called, then it throws", async () => {
      const { prisma } = await import("../src/lib/db");
      await expect(
        prisma.auditLog.upsert({
          where: { id: "nonexistent" },
          create: { action: "monitor.create", actor: "test" },
          update: { actor: "rewritten" },
        }),
      ).rejects.toThrow(/append-only/);
    });
  });
});

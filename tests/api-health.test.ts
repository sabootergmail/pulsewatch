import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Integration spec for /api/health (pozadavky #11 #5).
 *
 * Contract:
 *   - DB reachable → 200, `{ status: "ok", db: "ok" }`
 *   - DB throws on $queryRaw → 503, `{ status: "degraded", db: "fail", error }`
 *
 * The endpoint is the liveness probe — `release-verify.yml` exits non-zero
 * (and triggers autonomous rollback) if this contract is violated.
 */

vi.mock("../src/lib/db", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

import { GET } from "../src/app/api/health/route";
import { prisma } from "../src/lib/db";

const $queryRaw = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/api/health — liveness contract", () => {
  describe("Given the database is reachable", () => {
    it("When GET /api/health is called, then it returns 200 with status=ok and db=ok", async () => {
      $queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
      const res = await GET();
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; db: string };
      expect(body).toEqual(
        expect.objectContaining({ status: "ok", db: "ok" }),
      );
    });
  });

  describe("Given the database throws on $queryRaw", () => {
    it("When GET /api/health is called, then it returns 503 with db=fail", async () => {
      $queryRaw.mockRejectedValueOnce(new Error("connection refused"));
      const res = await GET();
      expect(res.status).toBe(503);
      const body = (await res.json()) as {
        status: string;
        db: string;
        error?: string;
      };
      expect(body.status).toBe("degraded");
      expect(body.db).toBe("fail");
      expect(body.error).toContain("connection refused");
    });
  });
});

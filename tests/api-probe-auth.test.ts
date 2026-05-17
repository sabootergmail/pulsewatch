import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Integration spec for /api/probe (pozadavky #11 #5).
 *
 * The route checks the Bearer secret then calls `runDueProbes()`. We stub
 * `runDueProbes` to assert that:
 *   - bad auth never invokes it
 *   - good auth invokes it once per call
 *   - idempotence is *inherited* from runDueProbes (which filters by
 *     intervalSeconds); when no monitor is due we get ran=0
 */

vi.mock("../src/lib/probe", () => ({
  runDueProbes: vi.fn().mockResolvedValue([]),
}));

import { GET, POST } from "../src/app/api/probe/route";
import { runDueProbes } from "../src/lib/probe";

const SECRET = "probe-test-secret";

beforeEach(() => {
  process.env.PROBE_SECRET = SECRET;
  vi.clearAllMocks();
});

describe("/api/probe — auth + idempotence", () => {
  describe("Given the endpoint requires Bearer PROBE_SECRET", () => {
    it("When the Authorization header is missing, then it returns 401 and does not probe", async () => {
      const res = await POST(new Request("http://localhost/api/probe"));
      expect(res.status).toBe(401);
      expect(runDueProbes).not.toHaveBeenCalled();
    });

    it("When the Bearer token is wrong, then it returns 401", async () => {
      const res = await POST(
        new Request("http://localhost/api/probe", {
          headers: { Authorization: "Bearer wrong" },
        }),
      );
      expect(res.status).toBe(401);
      expect(runDueProbes).not.toHaveBeenCalled();
    });

    it("When the Bearer token is correct, then it returns 200 and runs probes once", async () => {
      const res = await POST(
        new Request("http://localhost/api/probe", {
          headers: { Authorization: `Bearer ${SECRET}` },
        }),
      );
      expect(res.status).toBe(200);
      expect(runDueProbes).toHaveBeenCalledTimes(1);
    });

    it("When the secret is passed via ?secret= query, then it also returns 200", async () => {
      const res = await GET(
        new Request(`http://localhost/api/probe?secret=${SECRET}`),
      );
      expect(res.status).toBe(200);
      expect(runDueProbes).toHaveBeenCalledTimes(1);
    });

    it("When no monitors are due (runDueProbes returns []), then the body reports ran=0", async () => {
      (runDueProbes as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      const res = await POST(
        new Request("http://localhost/api/probe", {
          headers: { Authorization: `Bearer ${SECRET}` },
        }),
      );
      const body = (await res.json()) as { ok: boolean; ran: number };
      expect(body).toEqual(expect.objectContaining({ ok: true, ran: 0 }));
    });
  });
});

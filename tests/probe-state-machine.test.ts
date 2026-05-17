import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the persistence/notification edges. The state machine under test is
// `runProbeForMonitor` — we want to verify *what* it calls, not Prisma's
// behaviour. This keeps the test fast (no DB) and focused (no fixtures).

vi.mock("../src/lib/db", () => ({
  prisma: {
    monitor: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    check: { create: vi.fn().mockResolvedValue({}) },
    incident: {
      findFirst: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: "inc-new" }),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
}));
vi.mock("../src/lib/audit", () => ({ audit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/lib/notify", () => ({ notify: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/lib/log", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })) },
  logWith: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { runProbeForMonitor } from "../src/lib/probe";
import { prisma } from "../src/lib/db";

const monitor = {
  id: "m1",
  name: "Test",
  url: "https://example.test/health",
  method: "GET",
  expectedStatus: 200,
  intervalSeconds: 60,
  timeoutMs: 5000,
  paused: false,
  status: "unknown",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastCheckedAt: null,
};

describe("runProbeForMonitor — incident state machine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.monitor.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(monitor);
  });

  describe("Given a healthy monitor with no open incident", () => {
    it("When probe returns 200, then no incident is created", async () => {
      globalThis.fetch = vi.fn(async () => new Response("ok", { status: 200 })) as typeof fetch;
      (prisma.incident.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await runProbeForMonitor("m1");

      expect(result.status).toBe("up");
      expect(prisma.incident.create).not.toHaveBeenCalled();
      expect(prisma.incident.update).not.toHaveBeenCalled();
      expect(prisma.check.create).toHaveBeenCalledOnce();
      expect(prisma.monitor.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "up" }) }),
      );
    });
  });

  describe("Given a healthy monitor with no open incident", () => {
    it("When probe returns 500, then a new incident is opened", async () => {
      globalThis.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as typeof fetch;
      (prisma.incident.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await runProbeForMonitor("m1");

      expect(result.status).toBe("down");
      expect(prisma.incident.create).toHaveBeenCalledOnce();
      expect(prisma.incident.update).not.toHaveBeenCalled();
    });
  });

  describe("Given a failing monitor with an open incident", () => {
    it("When probe returns 500 again, then no duplicate incident is opened", async () => {
      globalThis.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as typeof fetch;
      (prisma.incident.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "inc-existing",
        startedAt: new Date(Date.now() - 60_000),
        status: "open",
      });

      const result = await runProbeForMonitor("m1");

      expect(result.status).toBe("down");
      expect(prisma.incident.create).not.toHaveBeenCalled();
      expect(prisma.incident.update).not.toHaveBeenCalled();
    });
  });

  describe("Given a failing monitor with an open incident", () => {
    it("When probe returns 200, then the open incident is resolved", async () => {
      globalThis.fetch = vi.fn(async () => new Response("ok", { status: 200 })) as typeof fetch;
      (prisma.incident.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "inc-existing",
        startedAt: new Date(Date.now() - 60_000),
        status: "open",
      });

      const result = await runProbeForMonitor("m1");

      expect(result.status).toBe("up");
      expect(prisma.incident.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "inc-existing" },
          data: expect.objectContaining({ status: "resolved" }),
        }),
      );
      expect(prisma.incident.create).not.toHaveBeenCalled();
    });
  });

  describe("Given a paused monitor", () => {
    it("When probe is invoked, then no check or incident is written", async () => {
      (prisma.monitor.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...monitor,
        paused: true,
      });

      const result = await runProbeForMonitor("m1");

      expect(result.status).toBe("paused");
      expect(prisma.check.create).not.toHaveBeenCalled();
      expect(prisma.incident.create).not.toHaveBeenCalled();
    });
  });
});

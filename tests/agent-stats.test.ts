import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * BDD spec for getAgentStats — the agent-performance dashboard's data source
 * (pozadavky #5 analytics, #7 unit bod 5). We mock Prisma to return a known
 * fixture so the math is deterministic and the test doesn't care about clock
 * skew. The function under test only does counts + arithmetic; the value of
 * this test is that someone changing the formula has to update an explicit
 * expectation.
 */

const HOUR = 60 * 60 * 1000;

// Fixtures live inside vi.hoisted() so vi.mock (which is hoisted above
// regular top-level code) can reference them without ReferenceError.
const fixtures = vi.hoisted(() => {
  const now = Date.now();
  return {
    counts: {
      "task.complete-24h": 3,
      "task.complete-7d": 5,
      "release.merge-7d": 2,
      "release.rollback-7d": 1,
    } as Record<string, number>,
    pendingApproval: 4,
    lastReleaseAt: new Date("2026-05-17T10:00:00Z"),
    lastRollbackAt: new Date("2026-05-16T08:30:00Z"),
    // 4 done tasks with durations 60s, 120s, 180s, 240s → mean 150s.
    recentDone: [
      { createdAt: new Date(now - 60_000), completedAt: new Date(now) },
      { createdAt: new Date(now - 240_000), completedAt: new Date(now - 120_000) },
      { createdAt: new Date(now - 360_000), completedAt: new Date(now - 180_000) },
      { createdAt: new Date(now - 480_000), completedAt: new Date(now - 240_000) },
    ],
  };
});

vi.mock("../src/lib/db", () => ({
  prisma: {
    auditLog: {
      count: vi.fn(({ where }: { where: { action: string; createdAt?: { gte: Date } } }) => {
        const action = where.action;
        const window = where.createdAt
          ? Date.now() - where.createdAt.gte.getTime() <= 25 * HOUR
            ? "24h"
            : "7d"
          : "all";
        const key = `${action}-${window}`;
        return Promise.resolve(fixtures.counts[key] ?? 0);
      }),
      findFirst: vi.fn(({ where }: { where: { action: string } }) => {
        if (where.action === "release.merge")
          return Promise.resolve({ createdAt: fixtures.lastReleaseAt });
        if (where.action === "release.rollback")
          return Promise.resolve({ createdAt: fixtures.lastRollbackAt });
        return Promise.resolve(null);
      }),
    },
    task: {
      count: vi.fn().mockResolvedValue(fixtures.pendingApproval),
      findMany: vi.fn().mockResolvedValue(fixtures.recentDone),
    },
  },
}));

import { getAgentStats } from "../src/lib/agentStats";

describe("getAgentStats — analytics for the dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Given a deterministic audit-log + task fixture", () => {
    it("When stats are computed, then 24h and 7d throughput match the audit-log counts", async () => {
      const stats = await getAgentStats();
      expect(stats.ticketsDoneLast24h).toBe(3);
      expect(stats.ticketsDoneLast7d).toBe(5);
    });

    it("When 2 releases merged and 1 rolled back, then success rate is 67%", async () => {
      const stats = await getAgentStats();
      expect(stats.releasesMergedLast7d).toBe(2);
      expect(stats.releasesRolledBackLast7d).toBe(1);
      expect(stats.successRate).toBe(67);
    });

    it("When no releases happened in 7d, then success rate defaults to 100", async () => {
      const { prisma } = await import("../src/lib/db");
      const count = prisma.auditLog.count as unknown as ReturnType<typeof vi.fn>;
      count.mockImplementation(() => Promise.resolve(0));

      const stats = await getAgentStats();
      expect(stats.successRate).toBe(100);
    });

    it("When 4 done tasks averaged 150s ticket→done, then avgTicketToDoneMs is 150000", async () => {
      const stats = await getAgentStats();
      expect(stats.avgTicketToDoneMs).toBe(150_000);
    });

    it("When no done tasks have completedAt, then avgTicketToDoneMs is null", async () => {
      const { prisma } = await import("../src/lib/db");
      const findMany = prisma.task.findMany as unknown as ReturnType<typeof vi.fn>;
      findMany.mockResolvedValueOnce([]);

      const stats = await getAgentStats();
      expect(stats.avgTicketToDoneMs).toBeNull();
    });

    it("When last release.merge and release.rollback exist, then their timestamps are surfaced", async () => {
      const stats = await getAgentStats();
      expect(stats.lastReleaseAt).toEqual(fixtures.lastReleaseAt);
      expect(stats.lastRollbackAt).toEqual(fixtures.lastRollbackAt);
    });
  });
});

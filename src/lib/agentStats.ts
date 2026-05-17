import { prisma } from "./db";

const HOUR = 60 * 60 * 1000;

export type AgentStats = {
  ticketsDoneLast24h: number;
  ticketsDoneLast7d: number;
  releasesMergedLast7d: number;
  releasesRolledBackLast7d: number;
  pendingApproval: number;
  successRate: number; // 0–100
  avgTicketToDoneMs: number | null;
  lastReleaseAt: Date | null;
  lastRollbackAt: Date | null;
};

export async function getAgentStats(): Promise<AgentStats> {
  const now = Date.now();
  const last24h = new Date(now - 24 * HOUR);
  const last7d = new Date(now - 7 * 24 * HOUR);

  const [done24h, done7d, merged7d, rolledBack7d, pendingApproval, lastRelease, lastRollback] =
    await Promise.all([
      prisma.auditLog.count({
        where: { action: "task.complete", createdAt: { gte: last24h } },
      }),
      prisma.auditLog.count({
        where: { action: "task.complete", createdAt: { gte: last7d } },
      }),
      prisma.auditLog.count({
        where: { action: "release.merge", createdAt: { gte: last7d } },
      }),
      prisma.auditLog.count({
        where: { action: "release.rollback", createdAt: { gte: last7d } },
      }),
      prisma.task.count({
        where: { type: "release_approval", status: "ready_for_release" },
      }),
      prisma.auditLog.findFirst({
        where: { action: "release.merge" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.auditLog.findFirst({
        where: { action: "release.rollback" },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const totalReleases = merged7d + rolledBack7d;
  const successRate =
    totalReleases === 0 ? 100 : Math.round((merged7d / totalReleases) * 100);

  // Avg ticket → done time, over the last 30 done tasks
  const recentDone = await prisma.task.findMany({
    where: { status: "done", completedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    take: 30,
    select: { createdAt: true, completedAt: true },
  });
  const avgTicketToDoneMs =
    recentDone.length === 0
      ? null
      : Math.round(
          recentDone.reduce(
            (sum, t) =>
              sum + (t.completedAt!.getTime() - t.createdAt.getTime()),
            0,
          ) / recentDone.length,
        );

  return {
    ticketsDoneLast24h: done24h,
    ticketsDoneLast7d: done7d,
    releasesMergedLast7d: merged7d,
    releasesRolledBackLast7d: rolledBack7d,
    pendingApproval,
    successRate,
    avgTicketToDoneMs,
    lastReleaseAt: lastRelease?.createdAt ?? null,
    lastRollbackAt: lastRollback?.createdAt ?? null,
  };
}

import Link from "next/link";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/StatusBadge";
import { LatencySparkline } from "@/components/LatencySparkline";
import { AgentPerformance } from "@/components/AgentPerformance";
import { formatRelative, uptimePercentage } from "@/lib/formatters";
import { getAgentStats } from "@/lib/agentStats";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [monitors, taskCounts, agentStats] = await Promise.all([
    prisma.monitor.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        checks: { orderBy: { checkedAt: "desc" }, take: 30 },
        incidents: { where: { status: "open" } },
      },
    }),
    prisma.task.groupBy({ by: ["status"], _count: { _all: true } }),
    getAgentStats(),
  ]);

  const totalMonitors = monitors.length;
  const upCount = monitors.filter((m) => m.status === "up").length;
  const downCount = monitors.filter((m) => m.status === "down").length;
  const openIncidents = monitors.reduce((sum, m) => sum + m.incidents.length, 0);
  const tasksOpen =
    taskCounts.find((t) => t.status === "backlog")?._count?._all ?? 0;
  const tasksInProgress =
    taskCounts.find((t) => t.status === "in_progress")?._count?._all ?? 0;

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Status overview</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Live view of all monitored endpoints. Refreshes on every check.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-700 uppercase tracking-wide">Service monitoring</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Monitors" value={totalMonitors} />
          <StatCard label="Operational" value={upCount} tone="up" />
          <StatCard label="Down" value={downCount} tone="down" />
          <StatCard label="Open incidents" value={openIncidents} tone={openIncidents > 0 ? "down" : "neutral"} />
          <StatCard label="Tasks: backlog" value={tasksOpen} />
          <StatCard label="Tasks: in progress" value={tasksInProgress} tone={tasksInProgress > 0 ? "up" : "neutral"} />
        </div>
      </section>

      <AgentPerformance stats={agentStats} />

      <section>
        <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-200 text-sm font-medium text-zinc-700 flex items-center justify-between">
            <span>All monitors</span>
            <Link
              href="/monitors/new"
              className="text-xs font-medium text-zinc-500 hover:text-zinc-900"
            >
              + new monitor
            </Link>
          </div>
          {monitors.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="divide-y divide-zinc-200">
              {monitors.map((m) => {
                const recent = m.checks.slice(0, 30).reverse();
                const upChecks = m.checks.filter((c) => c.status === "up").length;
                const uptime = uptimePercentage(upChecks, m.checks.length);
                const lastLatency = m.checks[0]?.latencyMs;
                return (
                  <li key={m.id} className="px-5 py-4 hover:bg-zinc-50">
                    <Link href={`/monitors/${m.id}`} className="grid grid-cols-12 gap-4 items-center">
                      <div className="col-span-4 min-w-0">
                        <div className="font-medium truncate">{m.name}</div>
                        <div className="text-xs text-zinc-500 truncate">{m.url}</div>
                      </div>
                      <div className="col-span-2">
                        <StatusBadge status={m.paused ? "paused" : m.status} />
                      </div>
                      <div className="col-span-2 text-sm text-zinc-700">
                        <div className="font-medium">{uptime}%</div>
                        <div className="text-xs text-zinc-500">last 30 checks</div>
                      </div>
                      <div className="col-span-2 text-sm text-zinc-700">
                        <div className="font-medium">
                          {lastLatency != null ? `${lastLatency}ms` : "—"}
                        </div>
                        <div className="text-xs text-zinc-500">{formatRelative(m.lastCheckedAt)}</div>
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <LatencySparkline checks={recent} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "up" | "down" | "neutral";
}) {
  const accent =
    tone === "up"
      ? "text-emerald-600"
      : tone === "down"
        ? "text-red-600"
        : "text-zinc-900";
  return (
    <div className="bg-white rounded-lg border border-zinc-200 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${accent}`}>{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-5 py-16 text-center">
      <p className="text-zinc-600 mb-4">No monitors yet.</p>
      <Link
        href="/monitors/new"
        className="inline-flex items-center rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Add your first monitor
      </Link>
    </div>
  );
}

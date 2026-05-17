import Link from "next/link";
import { formatDuration, formatRelative } from "@/lib/formatters";
import type { AgentStats } from "@/lib/agentStats";

export function AgentPerformance({ stats }: { stats: AgentStats }) {
  return (
    <section className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-200 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-zinc-900">Agent performance</h2>
          <p className="text-xs text-zinc-500">
            Throughput of the multi-agent pipeline. Numbers are computed from the audit log.
          </p>
        </div>
        {stats.pendingApproval > 0 && (
          <Link
            href="/tasks"
            className="text-xs font-medium px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 hover:bg-violet-200"
          >
            {stats.pendingApproval} waiting for approval →
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-zinc-200">
        <Cell label="Done (24h)" value={stats.ticketsDoneLast24h.toString()} />
        <Cell label="Done (7d)" value={stats.ticketsDoneLast7d.toString()} />
        <Cell
          label="Releases (7d)"
          value={stats.releasesMergedLast7d.toString()}
          sub={
            stats.releasesRolledBackLast7d > 0
              ? `+${stats.releasesRolledBackLast7d} rolled back`
              : "no rollbacks"
          }
        />
        <Cell
          label="Success rate"
          value={`${stats.successRate}%`}
          tone={stats.successRate >= 80 ? "good" : stats.successRate >= 50 ? "warn" : "bad"}
        />
        <Cell
          label="Avg ticket → done"
          value={
            stats.avgTicketToDoneMs == null
              ? "—"
              : formatDuration(stats.avgTicketToDoneMs)
          }
        />
        <Cell
          label="Last release"
          value={stats.lastReleaseAt ? formatRelative(stats.lastReleaseAt) : "—"}
          sub={
            stats.lastRollbackAt
              ? `last rollback ${formatRelative(stats.lastRollbackAt)}`
              : "no rollbacks recorded"
          }
        />
      </div>
    </section>
  );
}

function Cell({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "warn" | "bad" | "neutral";
}) {
  const accent =
    tone === "good"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "bad"
          ? "text-red-600"
          : "text-zinc-900";
  return (
    <div className="bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-2 text-xl font-semibold ${accent}`}>{value}</div>
      {sub && <div className="text-[11px] text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

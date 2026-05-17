import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/StatusBadge";
import { LatencySparkline } from "@/components/LatencySparkline";
import { formatRelative, uptimePercentage } from "@/lib/formatters";
import { deleteMonitor, togglePause, probeNow } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function MonitorDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const monitor = await prisma.monitor.findUnique({
    where: { id },
    include: {
      checks: { orderBy: { checkedAt: "desc" }, take: 60 },
      incidents: { orderBy: { startedAt: "desc" }, take: 20 },
    },
  });
  if (!monitor) notFound();

  const audit = await prisma.auditLog.findMany({
    where: { OR: [{ entityType: "Monitor", entityId: id }, { entityType: "Incident", entityId: { in: monitor.incidents.map((i) => i.id) } }] },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const upChecks = monitor.checks.filter((c) => c.status === "up").length;
  const uptime = uptimePercentage(upChecks, monitor.checks.length);
  const avgLatency =
    monitor.checks.length > 0
      ? Math.round(
          monitor.checks
            .filter((c) => c.latencyMs != null)
            .reduce((s, c) => s + (c.latencyMs ?? 0), 0) /
            Math.max(monitor.checks.filter((c) => c.latencyMs != null).length, 1),
        )
      : 0;

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">&larr; back to dashboard</Link>

      <header className="bg-white border border-zinc-200 rounded-lg p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight">{monitor.name}</h1>
              <StatusBadge status={monitor.paused ? "paused" : monitor.status} />
            </div>
            <a
              href={monitor.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-zinc-500 hover:text-zinc-900 break-all"
            >
              {monitor.url}
            </a>
            <div className="text-xs text-zinc-500 mt-1">
              {monitor.method} · every {monitor.intervalSeconds}s · expect {monitor.expectedStatus}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <form action={probeNow.bind(null, monitor.id)}>
              <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50">
                Probe now
              </button>
            </form>
            <form action={togglePause.bind(null, monitor.id)}>
              <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50">
                {monitor.paused ? "Resume" : "Pause"}
              </button>
            </form>
            <form action={deleteMonitor.bind(null, monitor.id)}>
              <button className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">
                Delete
              </button>
            </form>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          <Metric label="Uptime" value={`${uptime}%`} />
          <Metric label="Avg latency" value={`${avgLatency}ms`} />
          <Metric label="Checks recorded" value={monitor.checks.length.toString()} />
          <Metric label="Last checked" value={formatRelative(monitor.lastCheckedAt)} />
        </div>

        <div className="mt-6">
          <div className="text-xs text-zinc-500 mb-2">Latency · last {monitor.checks.length} checks</div>
          <LatencySparkline checks={monitor.checks.slice().reverse()} width={600} height={48} />
        </div>
      </header>

      <section className="bg-white border border-zinc-200 rounded-lg">
        <div className="px-5 py-3 border-b border-zinc-200 text-sm font-medium">Incidents</div>
        {monitor.incidents.length === 0 ? (
          <div className="px-5 py-6 text-sm text-zinc-500">No incidents recorded.</div>
        ) : (
          <ul className="divide-y divide-zinc-200">
            {monitor.incidents.map((inc) => (
              <li key={inc.id} className="px-5 py-3 text-sm flex items-center justify-between">
                <div>
                  <div className="font-medium">
                    {inc.summary ?? "Incident"}{" "}
                    <span className="text-xs text-zinc-500 ml-2">
                      {inc.status === "open" ? "ongoing" : "resolved"}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500">{inc.cause}</div>
                </div>
                <div className="text-xs text-zinc-500 text-right">
                  <div>started {formatRelative(inc.startedAt)}</div>
                  {inc.resolvedAt && <div>resolved {formatRelative(inc.resolvedAt)}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white border border-zinc-200 rounded-lg">
        <div className="px-5 py-3 border-b border-zinc-200 text-sm font-medium">Recent checks</div>
        {monitor.checks.length === 0 ? (
          <div className="px-5 py-6 text-sm text-zinc-500">No checks yet. Try &quot;Probe now&quot;.</div>
        ) : (
          <ul className="divide-y divide-zinc-200 text-sm">
            {monitor.checks.slice(0, 20).map((c) => (
              <li key={c.id} className="px-5 py-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusBadge status={c.status} />
                  <span className="text-xs text-zinc-500">{formatRelative(c.checkedAt)}</span>
                </div>
                <div className="text-xs text-zinc-700">
                  {c.httpStatus ? `HTTP ${c.httpStatus} · ` : ""}
                  {c.latencyMs ?? "?"}ms
                  {c.error && <span className="text-red-600 ml-2">{c.error}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white border border-zinc-200 rounded-lg">
        <div className="px-5 py-3 border-b border-zinc-200 text-sm font-medium">Audit log</div>
        {audit.length === 0 ? (
          <div className="px-5 py-6 text-sm text-zinc-500">No audit entries.</div>
        ) : (
          <ul className="divide-y divide-zinc-200 text-sm">
            {audit.map((a) => (
              <li key={a.id} className="px-5 py-2 flex items-center justify-between">
                <div>
                  <span className="font-mono text-xs">{a.action}</span>
                  <span className="text-xs text-zinc-500 ml-2">by {a.actor}</span>
                </div>
                <span className="text-xs text-zinc-500">{formatRelative(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

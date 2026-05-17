import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatRelative } from "@/lib/formatters";

export const dynamic = "force-dynamic";

export default async function IncidentsPage() {
  const incidents = await prisma.incident.findMany({
    orderBy: { startedAt: "desc" },
    include: { monitor: true },
    take: 100,
  });
  const open = incidents.filter((i) => i.status === "open");
  const resolved = incidents.filter((i) => i.status === "resolved");

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Incidents</h1>

      <IncidentList title={`Open (${open.length})`} items={open} tone="open" />
      <IncidentList title={`Resolved (${resolved.length})`} items={resolved} tone="resolved" />
    </div>
  );
}

type Item = {
  id: string;
  summary: string | null;
  cause: string | null;
  status: string;
  startedAt: Date;
  resolvedAt: Date | null;
  monitor: { id: string; name: string; url: string };
};

function IncidentList({ title, items, tone }: { title: string; items: Item[]; tone: "open" | "resolved" }) {
  return (
    <section className="bg-white border border-zinc-200 rounded-lg">
      <div className="px-5 py-3 border-b border-zinc-200 text-sm font-medium">{title}</div>
      {items.length === 0 ? (
        <div className="px-5 py-6 text-sm text-zinc-500">
          {tone === "open" ? "No open incidents — all systems operational." : "No resolved incidents yet."}
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200">
          {items.map((inc) => (
            <li key={inc.id} className="px-5 py-3 text-sm">
              <Link href={`/monitors/${inc.monitor.id}`} className="block hover:underline">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">
                      {inc.monitor.name}
                      <span
                        className={`ml-2 text-xs ${tone === "open" ? "text-red-600" : "text-zinc-500"}`}
                      >
                        {tone === "open" ? "ongoing" : "resolved"}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500">{inc.cause}</div>
                  </div>
                  <div className="text-xs text-zinc-500 text-right">
                    <div>started {formatRelative(inc.startedAt)}</div>
                    {inc.resolvedAt && <div>resolved {formatRelative(inc.resolvedAt)}</div>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

import { prisma } from "@/lib/db";
import { formatRelative } from "@/lib/formatters";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Append-only ledger of every privileged action. Used for compliance and post-incident review.
        </p>
      </div>
      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        {entries.length === 0 ? (
          <div className="px-5 py-6 text-sm text-zinc-500">No audit entries yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="text-left px-5 py-2">When</th>
                <th className="text-left px-5 py-2">Actor</th>
                <th className="text-left px-5 py-2">Action</th>
                <th className="text-left px-5 py-2">Entity</th>
                <th className="text-left px-5 py-2">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="px-5 py-2 text-xs text-zinc-500 whitespace-nowrap">{formatRelative(e.createdAt)}</td>
                  <td className="px-5 py-2 text-xs">{e.actor}</td>
                  <td className="px-5 py-2 font-mono text-xs">{e.action}</td>
                  <td className="px-5 py-2 text-xs text-zinc-700">{e.entityType ?? "—"}</td>
                  <td className="px-5 py-2 text-xs text-zinc-500 max-w-md truncate" title={e.metadata ?? ""}>
                    {e.metadata ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

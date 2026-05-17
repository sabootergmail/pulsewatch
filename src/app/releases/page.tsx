import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatRelative } from "@/lib/formatters";

export const dynamic = "force-dynamic";

const statusStyles: Record<string, string> = {
  live: "bg-emerald-100 text-emerald-700",
  previous: "bg-zinc-100 text-zinc-700",
  rolled_back: "bg-red-100 text-red-700",
};

const smokeStyles: Record<string, string> = {
  passed: "text-emerald-600",
  failed: "text-red-600",
  pending: "text-amber-600",
};

export default async function ReleasesPage() {
  const releases = await prisma.release.findMany({
    orderBy: { deployedAt: "desc" },
    take: 20,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Releases</h1>
        <p className="text-sm text-zinc-500 mt-1 max-w-2xl">
          Each successful deploy is recorded here. Use{" "}
          <span className="font-medium">Rollback</span> to revert — L1 promotes
          the previous Vercel deploy (~30 s), L2 also restores the database
          via Turso PITR, L3 opens a git revert PR through the regular agent
          pipeline.
        </p>
      </div>

      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        {releases.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-zinc-500">
            No releases recorded yet. They land here after the first
            <code className="mx-1 px-1.5 py-0.5 bg-zinc-100 rounded">release.merge</code>
            event.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="text-left px-5 py-2">Version</th>
                <th className="text-left px-5 py-2">Deployed</th>
                <th className="text-left px-5 py-2">Status</th>
                <th className="text-left px-5 py-2">Smoke test</th>
                <th className="text-right px-5 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {releases.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-2">
                    <div className="font-mono">{r.version}</div>
                    <div className="text-xs text-zinc-500">
                      {r.gitSha.slice(0, 7)}
                    </div>
                  </td>
                  <td className="px-5 py-2 text-xs text-zinc-700">
                    {formatRelative(r.deployedAt)}
                  </td>
                  <td className="px-5 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-medium ${
                        statusStyles[r.status] ?? "bg-zinc-100 text-zinc-700"
                      }`}
                    >
                      {r.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-5 py-2 text-xs">
                    <span
                      className={`font-medium ${
                        smokeStyles[r.smokeTestStatus ?? "pending"] ??
                        "text-zinc-500"
                      }`}
                    >
                      {r.smokeTestStatus ?? "—"}
                    </span>
                  </td>
                  <td className="px-5 py-2 text-right">
                    {r.status === "rolled_back" ? (
                      <span className="text-xs text-zinc-400">—</span>
                    ) : (
                      <Link
                        href={`/releases/${r.id}/rollback`}
                        className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50"
                      >
                        Rollback
                      </Link>
                    )}
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

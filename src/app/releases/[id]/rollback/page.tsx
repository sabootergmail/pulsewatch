import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { initiateRollback } from "@/lib/rollback";
import { formatRelative } from "@/lib/formatters";

export const dynamic = "force-dynamic";

export default async function RollbackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const release = await prisma.release.findUnique({ where: { id } });
  if (!release) notFound();

  if (release.status === "rolled_back") {
    return (
      <div className="max-w-xl space-y-4">
        <Link href="/releases" className="text-sm text-zinc-500 hover:text-zinc-900">
          &larr; back to releases
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {release.version} is already rolled back
        </h1>
        <p className="text-sm text-zinc-500">
          See the audit log for the full timeline.
        </p>
      </div>
    );
  }

  const previous = await prisma.release.findFirst({
    where: { deployedAt: { lt: release.deployedAt }, status: { not: "rolled_back" } },
    orderBy: { deployedAt: "desc" },
  });

  return (
    <div className="max-w-xl space-y-6">
      <Link href="/releases" className="text-sm text-zinc-500 hover:text-zinc-900">
        &larr; back to releases
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Rollback {release.version}
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Deployed {formatRelative(release.deployedAt)} · git{" "}
          <code>{release.gitSha.slice(0, 7)}</code>
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm space-y-2">
        <p className="font-medium text-amber-900">
          You&apos;re about to revert production.
        </p>
        <p className="text-amber-800">
          This is recorded in the audit log and creates a rollback ticket. The
          reason field is required — write what went wrong so the post-mortem
          isn&apos;t starting from scratch.
        </p>
        {previous ? (
          <p className="text-amber-800">
            Target: <code className="font-mono">{previous.version}</code>{" "}
            (deployed {formatRelative(previous.deployedAt)}).
          </p>
        ) : (
          <p className="text-red-700">
            ⚠ No previous release found. L1 won&apos;t have a target — choose L3
            to open a revert PR through the agent pipeline instead.
          </p>
        )}
      </div>

      <form
        action={initiateRollback}
        className="bg-white border border-zinc-200 rounded-lg p-6 space-y-4"
      >
        <input type="hidden" name="releaseId" value={release.id} />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-zinc-700">Level</legend>
          <Choice
            value="L1"
            title="L1 — code only (Vercel promote)"
            sub="~30 s. Safe iff migrations follow expand/contract. Default."
            defaultChecked
          />
          <Choice
            value="L2"
            title="L2 — code + DB (Turso PITR)"
            sub="1–5 min. For data corruption or bad migrations. Needs a PITR timestamp."
          />
          <Choice
            value="L3"
            title="L3 — git revert PR"
            sub="5–15 min. Highest audit trail. Goes through the regular release flow."
          />
        </fieldset>

        <label className="block">
          <span className="block text-xs font-medium text-zinc-700 mb-1">
            Reason (min 10 chars, mandatory)
          </span>
          <textarea
            name="reason"
            required
            minLength={10}
            rows={3}
            placeholder="What went wrong? Be specific — this lands in the audit log and the post-mortem."
            className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 outline-none"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-zinc-700 mb-1">
            PITR timestamp (required for L2)
          </span>
          <input
            type="datetime-local"
            name="pitrTimestamp"
            className="block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 outline-none"
          />
          <span className="text-xs text-zinc-500 mt-1 block">
            Turso retention: 24 h by default. See <code>DR.md</code> for the
            full procedure.
          </span>
        </label>

        <div className="pt-2 flex items-center justify-end gap-2">
          <Link
            href="/releases"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Confirm rollback
          </button>
        </div>
      </form>
    </div>
  );
}

function Choice({
  value,
  title,
  sub,
  defaultChecked,
}: {
  value: string;
  title: string;
  sub: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 p-3 rounded-md border border-zinc-200 hover:bg-zinc-50 cursor-pointer">
      <input
        type="radio"
        name="level"
        value={value}
        defaultChecked={defaultChecked}
        className="mt-1"
        required
      />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-zinc-500">{sub}</span>
      </span>
    </label>
  );
}

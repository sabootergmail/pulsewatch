import Link from "next/link";
import { prisma } from "@/lib/db";
import { TaskCard } from "@/components/TaskCard";

export const dynamic = "force-dynamic";

const COLUMNS = [
  { id: "backlog", label: "Backlog", tone: "bg-zinc-50", statuses: ["backlog"] },
  { id: "in_progress", label: "In progress", tone: "bg-amber-50", statuses: ["in_progress", "ready_for_release"] },
  { id: "done", label: "Done", tone: "bg-emerald-50", statuses: ["done", "approved", "rolled_back"] },
] as const;

export default async function TasksPage() {
  const tasks = await prisma.task.findMany({ orderBy: [{ createdAt: "desc" }] });
  const grouped = Object.fromEntries(
    COLUMNS.map((c) => [c.id, tasks.filter((t) => (c.statuses as readonly string[]).includes(t.status))]),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-zinc-500 mt-1 max-w-2xl">
            Backlog for PulseWatch itself. Each task can be{" "}
            <span className="font-medium">delegated to Claude</span> — that
            opens a GitHub issue with <code>@claude</code>, the{" "}
            <code>claude.yml</code> workflow picks it up, Claude Code Action
            opens a PR, Vercel previews it, and merging deploys to prod. The
            audit log records every step.
          </p>
        </div>
        <Link
          href="/tasks/new"
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 whitespace-nowrap"
        >
          + New task
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => (
          <div key={col.id} className={`rounded-lg border border-zinc-200 ${col.tone}`}>
            <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-700">{col.label}</span>
              <span className="text-xs text-zinc-500">{grouped[col.id].length}</span>
            </div>
            <ul className="p-3 space-y-3 min-h-[200px]">
              {grouped[col.id].length === 0 ? (
                <li className="text-xs text-zinc-400 italic px-1">empty</li>
              ) : (
                grouped[col.id].map((t) => <TaskCard key={t.id} task={t} />)
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

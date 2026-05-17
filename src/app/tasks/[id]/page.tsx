import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatRelative } from "@/lib/formatters";
import { deleteTask, updateTaskStatus, delegateToClaude } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export default async function TaskDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) notFound();

  const audit = await prisma.auditLog.findMany({
    where: { entityType: "Task", entityId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/tasks" className="text-sm text-zinc-500 hover:text-zinc-900">&larr; back to tasks</Link>

      <header className="bg-white border border-zinc-200 rounded-lg p-6 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{task.title}</h1>
          <span
            className={`text-xs uppercase tracking-wide px-2 py-0.5 rounded ${
              task.status === "done"
                ? "bg-emerald-100 text-emerald-700"
                : task.status === "in_progress"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-zinc-100 text-zinc-700"
            }`}
          >
            {task.status.replace("_", " ")}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          <span>priority: {task.priority}</span>
          <span>·</span>
          <span>created {formatRelative(task.createdAt)}</span>
          {task.assignedTo && (
            <>
              <span>·</span>
              <span>assigned to {task.assignedTo}</span>
            </>
          )}
          {task.completedAt && (
            <>
              <span>·</span>
              <span>completed {formatRelative(task.completedAt)}</span>
            </>
          )}
        </div>

        {task.description && (
          <pre className="text-sm whitespace-pre-wrap text-zinc-700 bg-zinc-50 p-3 rounded border border-zinc-200 font-mono">{task.description}</pre>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          {task.status !== "done" && (
            <form action={updateTaskStatus.bind(null, task.id)}>
              <input type="hidden" name="status" value="done" />
              <button className="text-xs px-3 py-1.5 rounded border border-zinc-300 hover:bg-zinc-50">
                Mark done
              </button>
            </form>
          )}
          {task.status === "done" && (
            <form action={updateTaskStatus.bind(null, task.id)}>
              <input type="hidden" name="status" value="backlog" />
              <button className="text-xs px-3 py-1.5 rounded border border-zinc-300 hover:bg-zinc-50">
                Reopen
              </button>
            </form>
          )}
          {task.status === "backlog" && !task.assignedTo && (
            <form action={delegateToClaude.bind(null, task.id)}>
              <button className="text-xs px-3 py-1.5 rounded bg-zinc-900 text-white hover:bg-zinc-700">
                Delegate to Claude 🤖
              </button>
            </form>
          )}
          <form action={deleteTask.bind(null, task.id)}>
            <button className="text-xs px-3 py-1.5 rounded border border-red-300 text-red-700 hover:bg-red-50">
              Delete
            </button>
          </form>
        </div>

        {(task.githubIssueUrl || task.githubPrUrl) && (
          <div className="pt-2 flex flex-wrap gap-3 text-xs">
            {task.githubIssueUrl && (
              <a
                href={task.githubIssueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                GitHub issue ↗
              </a>
            )}
            {task.githubPrUrl && (
              <a
                href={task.githubPrUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Pull request ↗
              </a>
            )}
          </div>
        )}
      </header>

      <section className="bg-white border border-zinc-200 rounded-lg">
        <div className="px-5 py-3 border-b border-zinc-200 text-sm font-medium">Audit trail</div>
        {audit.length === 0 ? (
          <div className="px-5 py-6 text-sm text-zinc-500">No audit entries.</div>
        ) : (
          <ul className="divide-y divide-zinc-200 text-sm">
            {audit.map((a) => (
              <li key={a.id} className="px-5 py-2 flex items-center justify-between">
                <span className="font-mono text-xs">{a.action}</span>
                <span className="text-xs text-zinc-500">{formatRelative(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

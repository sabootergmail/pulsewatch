import Link from "next/link";
import { formatRelative } from "@/lib/formatters";
import { updateTaskStatus, delegateToClaude } from "@/lib/tasks";
import { ApproveReleaseForm } from "./ApproveReleaseForm";

type Task = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  githubIssueUrl: string | null;
  githubPrUrl: string | null;
  previewUrl: string | null;
  summary: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

const priorityStyles: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-zinc-100 text-zinc-600",
};

const statusStyles: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-700",
  rolled_back: "bg-red-100 text-red-700",
  ready_for_release: "bg-violet-100 text-violet-700",
};

const NEXT_STATUS: Record<string, string> = {
  backlog: "in_progress",
  in_progress: "done",
  done: "backlog",
};

const NEXT_LABEL: Record<string, string> = {
  backlog: "Start →",
  in_progress: "Mark done →",
  done: "Reopen",
};

export function TaskCard({ task }: { task: Task }) {
  const isRelease = task.type === "release_approval";
  const isRollback = task.type === "rollback";
  const cardTone = isRelease
    ? "border-violet-300 bg-violet-50"
    : isRollback
      ? "border-red-300 bg-red-50"
      : "border-zinc-200 bg-white";

  return (
    <li className={`rounded-md border p-3 shadow-sm space-y-2 ${cardTone}`}>
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/tasks/${task.id}`}
          className="font-medium text-sm text-zinc-900 hover:underline line-clamp-2"
        >
          {isRelease && "🚀 "}
          {isRollback && "↩ "}
          {task.title}
        </Link>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {isRelease && (
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-200 text-violet-800">
              release
            </span>
          )}
          {statusStyles[task.status] && (
            <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${statusStyles[task.status]}`}>
              {task.status.replace("_", " ")}
            </span>
          )}
          <span
            className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${priorityStyles[task.priority] ?? priorityStyles.medium}`}
          >
            {task.priority}
          </span>
        </div>
      </div>

      {isRelease && task.summary ? (
        <p className="text-xs text-zinc-700 line-clamp-3">{task.summary}</p>
      ) : task.description ? (
        <p className="text-xs text-zinc-500 line-clamp-2">{task.description}</p>
      ) : null}

      <div className="flex items-center gap-2 text-[11px] text-zinc-500 flex-wrap">
        <span>{formatRelative(task.createdAt)}</span>
        {task.assignedTo && (
          <span className="inline-flex items-center gap-1 bg-zinc-100 rounded px-1.5 py-0.5">
            {task.assignedTo === "agent:claude" ? "🤖" : "👤"} {task.assignedTo}
          </span>
        )}
      </div>

      {(task.githubIssueUrl || task.githubPrUrl || task.previewUrl) && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          {task.githubIssueUrl && (
            <a href={task.githubIssueUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              issue ↗
            </a>
          )}
          {task.githubPrUrl && (
            <a href={task.githubPrUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              PR ↗
            </a>
          )}
          {task.previewUrl && (
            <a href={task.previewUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              preview ↗
            </a>
          )}
        </div>
      )}

      <div className="flex items-center gap-1 pt-1 flex-wrap">
        {isRelease && task.status !== "approved" && task.status !== "done" && task.status !== "rolled_back" ? (
          <ApproveReleaseForm taskId={task.id} prUrl={task.githubPrUrl} />
        ) : isRollback ? (
          <span className="text-[11px] text-red-700">rolled back</span>
        ) : (
          <>
            {NEXT_STATUS[task.status] && (
              <form action={updateTaskStatus.bind(null, task.id)}>
                <input type="hidden" name="status" value={NEXT_STATUS[task.status]} />
                <button className="text-[11px] px-2 py-1 rounded border border-zinc-300 hover:bg-zinc-50">
                  {NEXT_LABEL[task.status]}
                </button>
              </form>
            )}
            {task.status === "backlog" && !task.assignedTo && task.type === "task" && (
              <form action={delegateToClaude.bind(null, task.id)}>
                <button className="text-[11px] px-2 py-1 rounded bg-zinc-900 text-white hover:bg-zinc-700">
                  Delegate to Claude 🤖
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </li>
  );
}

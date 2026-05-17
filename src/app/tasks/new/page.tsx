import Link from "next/link";
import { createTask } from "@/lib/tasks";

export default function NewTaskPage() {
  return (
    <div className="max-w-xl">
      <Link href="/tasks" className="text-sm text-zinc-500 hover:text-zinc-900">&larr; back to tasks</Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">New task</h1>
      <p className="text-sm text-zinc-500 mt-1">
        Adds an item to the backlog. From there you can either work it yourself
        or delegate it to Claude — which opens a GitHub issue with{" "}
        <code>@claude</code>, triggering the Claude Code Action workflow.
      </p>

      <form action={createTask} className="mt-6 space-y-4 bg-white border border-zinc-200 rounded-lg p-6">
        <label className="block">
          <span className="block text-xs font-medium text-zinc-700 mb-1">Title</span>
          <input
            name="title"
            required
            placeholder="e.g. Export audit log to CSV"
            className="block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 outline-none"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-zinc-700 mb-1">Description</span>
          <textarea
            name="description"
            rows={5}
            placeholder="What needs to happen, acceptance criteria, links..."
            className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 outline-none font-mono"
          />
          <span className="text-xs text-zinc-500 mt-1 block">
            If you plan to delegate to Claude, write this as if you were briefing a
            developer in a GitHub issue — Claude reads it verbatim.
          </span>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-zinc-700 mb-1">Priority</span>
          <select
            name="priority"
            defaultValue="medium"
            className="block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 outline-none"
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>

        <div className="pt-2 flex items-center justify-end gap-2">
          <Link
            href="/tasks"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Create task
          </button>
        </div>
      </form>
    </div>
  );
}

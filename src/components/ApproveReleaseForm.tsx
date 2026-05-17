"use client";

import { useState } from "react";
import { approveRelease } from "@/lib/release";

/**
 * Two-step approval gate (pozadavky #10 bod 6).
 *
 * The Approve & deploy button is the only human gate in the agent loop —
 * one click here merges a PR and ships to prod. Anonymous-internet exposure
 * was already removed by NextAuth (pozadavky #10 body 1–3); this component
 * adds the second safeguard: a "yes I read the diff" affirmation before the
 * button is clickable, plus a prominent link to the PR on GitHub so reading
 * the diff is the path of least resistance.
 */
export function ApproveReleaseForm({
  taskId,
  prUrl,
}: {
  taskId: string;
  prUrl: string | null;
}) {
  const [reviewed, setReviewed] = useState(false);
  return (
    <div className="space-y-2 w-full">
      {prUrl && (
        <a
          href={prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:underline"
        >
          → Review the PR diff on GitHub
        </a>
      )}
      <label className="flex items-center gap-1.5 text-[11px] text-zinc-700 cursor-pointer">
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(e) => setReviewed(e.target.checked)}
          className="h-3 w-3"
        />
        <span>I have reviewed the PR diff</span>
      </label>
      <form action={approveRelease.bind(null, taskId)}>
        <button
          type="submit"
          disabled={!reviewed}
          className="text-[11px] px-2.5 py-1 rounded bg-violet-600 text-white hover:bg-violet-700 font-medium disabled:bg-zinc-300 disabled:text-zinc-500 disabled:cursor-not-allowed"
        >
          ✓ Approve &amp; deploy
        </button>
      </form>
    </div>
  );
}

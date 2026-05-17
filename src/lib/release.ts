"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { audit } from "./audit";

/**
 * Create a release_approval task. Called by the agent (claude-code-action)
 * via REST API / MCP after a PR is opened and a preview deploy is ready.
 * Returns the created task id.
 */
export async function requestReleaseApproval(input: {
  title: string;
  summary: string;
  prUrl: string;
  prNumber: number;
  previewUrl?: string;
  relatedTaskId?: string;
}) {
  // If the originating task exists, link it and mark as ready_for_release
  if (input.relatedTaskId) {
    const exists = await prisma.task.findUnique({ where: { id: input.relatedTaskId } });
    if (exists) {
      await prisma.task.update({
        where: { id: input.relatedTaskId },
        data: { status: "ready_for_release", githubPrUrl: input.prUrl, githubPrNumber: input.prNumber },
      });
    } else {
      input.relatedTaskId = undefined;
    }
  }

  const approval = await prisma.task.create({
    data: {
      title: input.title,
      summary: input.summary,
      type: "release_approval",
      status: "backlog",
      priority: "high",
      assignedTo: "agent:claude",
      githubPrUrl: input.prUrl,
      githubPrNumber: input.prNumber,
      previewUrl: input.previewUrl,
      relatedTaskId: input.relatedTaskId,
    },
  });

  await audit({
    action: "release.request",
    entityType: "Task",
    entityId: approval.id,
    actor: "agent:claude",
    metadata: { prUrl: input.prUrl, previewUrl: input.previewUrl, relatedTaskId: input.relatedTaskId },
  });

  return { id: approval.id };
}

/**
 * Approve a release_approval task. This is the ONE human-in-the-loop step
 * in the agent's autonomous loop. Merges the PR via GitHub API, then leaves
 * post-deploy smoke testing + rollback to the release-verify workflow.
 */
export async function approveRelease(id: string) {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) throw new Error("Release approval not found");
  if (task.type !== "release_approval") {
    throw new Error("Only release_approval tasks can be approved");
  }
  if (task.status === "approved" || task.status === "done") {
    throw new Error("Already approved");
  }

  await audit({
    action: "release.approve",
    entityType: "Task",
    entityId: id,
    actor: "user",
    metadata: { prUrl: task.githubPrUrl, prNumber: task.githubPrNumber },
  });

  // Merge the PR via GitHub REST API
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO ?? "sabootergmail/pulsewatch";
  if (!token) {
    // Demo-friendly fallback: mark as approved but don't actually merge.
    await prisma.task.update({
      where: { id },
      data: {
        status: "approved",
        approvedBy: "user",
        approvedAt: new Date(),
      },
    });
    revalidatePath("/tasks");
    revalidatePath(`/tasks/${id}`);
    throw new Error(
      "Approved (audit recorded), but GITHUB_TOKEN env var is not set so the PR was not auto-merged. " +
        "Set it on Vercel with `repo:write` scope to close the loop end-to-end.",
    );
  }

  if (!task.githubPrNumber) {
    throw new Error("release_approval task has no PR number");
  }

  const res = await fetch(
    `https://api.github.com/repos/${repo}/pulls/${task.githubPrNumber}/merge`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        commit_title: `Release: ${task.title}`,
        merge_method: "squash",
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub merge failed (${res.status}): ${errText}`);
  }

  await prisma.task.update({
    where: { id },
    data: {
      status: "approved",
      approvedBy: "user",
      approvedAt: new Date(),
    },
  });

  if (task.relatedTaskId) {
    await prisma.task.update({
      where: { id: task.relatedTaskId },
      data: { status: "done", completedAt: new Date() },
    });
  }

  await audit({
    action: "release.merge",
    entityType: "Task",
    entityId: id,
    actor: "agent:claude",
    metadata: { prNumber: task.githubPrNumber },
  });

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${id}`);
}

/**
 * Record a rolled-back release. Called by the release-verify workflow when
 * the post-deploy smoke test fails. The rollback itself (vercel rollback) is
 * the workflow's job; this just records the audit + status update.
 */
export async function recordRollback(input: {
  releaseTaskId: string;
  reason: string;
}) {
  const release = await prisma.task.findUnique({ where: { id: input.releaseTaskId } });
  if (!release) throw new Error("Release task not found");

  await prisma.task.update({
    where: { id: input.releaseTaskId },
    data: {
      status: "rolled_back",
      rolledBackAt: new Date(),
      rollbackReason: input.reason,
    },
  });

  if (release.relatedTaskId) {
    // Reopen the originating task — work is not done
    await prisma.task.update({
      where: { id: release.relatedTaskId },
      data: { status: "in_progress", completedAt: null },
    });
  }

  const rollbackTicket = await prisma.task.create({
    data: {
      type: "rollback",
      title: `Rollback: ${release.title}`,
      summary: input.reason,
      status: "done",
      priority: "high",
      assignedTo: "agent:claude",
      relatedTaskId: input.releaseTaskId,
      completedAt: new Date(),
    },
  });

  await audit({
    action: "release.rollback",
    entityType: "Task",
    entityId: input.releaseTaskId,
    actor: "agent:claude",
    metadata: { reason: input.reason, rollbackTicketId: rollbackTicket.id },
  });

  revalidatePath("/tasks");
}

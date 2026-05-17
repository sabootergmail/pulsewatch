"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "./db";
import { audit } from "./audit";

const taskCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional().or(z.literal("")),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
});

const TASK_STATUSES = ["backlog", "in_progress", "done"] as const;
const statusSchema = z.enum(TASK_STATUSES);

export async function createTask(formData: FormData) {
  const parsed = taskCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const task = await prisma.task.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      priority: parsed.data.priority,
    },
  });
  await audit({
    action: "task.create",
    entityType: "Task",
    entityId: task.id,
    metadata: { title: task.title, priority: task.priority },
  });
  revalidatePath("/tasks");
  redirect("/tasks");
}

export async function updateTaskStatus(id: string, formData: FormData) {
  const raw = formData.get("status");
  const parsed = statusSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Invalid status: ${raw}`);
  const status = parsed.data;
  const completedAt = status === "done" ? new Date() : null;
  const task = await prisma.task.update({
    where: { id },
    data: { status, completedAt },
  });
  await audit({
    action: status === "done" ? "task.complete" : "task.update",
    entityType: "Task",
    entityId: id,
    metadata: { status, title: task.title },
  });
  revalidatePath("/tasks");
}

export async function deleteTask(id: string) {
  const task = await prisma.task.delete({ where: { id } });
  await audit({
    action: "task.delete",
    entityType: "Task",
    entityId: id,
    metadata: { title: task.title },
  });
  revalidatePath("/tasks");
  redirect("/tasks");
}

/**
 * Delegate a task to Claude Code Action: open a GitHub issue with @claude
 * mention so the workflow in .github/workflows/claude.yml picks it up.
 * Requires GITHUB_REPO and GITHUB_TOKEN env vars.
 */
export async function delegateToClaude(id: string) {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) throw new Error("Task not found");

  const repo = process.env.GITHUB_REPO ?? "sabootergmail/pulsewatch";
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error(
      "Delegation unavailable: set GITHUB_TOKEN env var (needs 'repo' scope) to enable in-app task delegation. " +
        "For demo, paste the task body into a new issue manually with @claude on the first line.",
    );
  }

  const body = [
    "@claude please implement the following:",
    "",
    `**Task:** ${task.title}`,
    "",
    task.description ?? "_(no further detail provided)_",
    "",
    "---",
    `_Delegated from PulseWatch task \`${task.id}\`. Open a PR against \`main\`; merging triggers Vercel prod deploy._`,
  ].join("\n");

  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ title: task.title, body, labels: ["claude"] }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub issue creation failed (${res.status}): ${errText}`);
  }

  const issue = (await res.json()) as { html_url: string; number: number };

  await prisma.task.update({
    where: { id },
    data: {
      status: "in_progress",
      assignedTo: "agent:claude",
      githubIssueUrl: issue.html_url,
    },
  });

  await audit({
    action: "task.delegate",
    entityType: "Task",
    entityId: id,
    metadata: { issueUrl: issue.html_url, issueNumber: issue.number },
  });

  revalidatePath("/tasks");
}

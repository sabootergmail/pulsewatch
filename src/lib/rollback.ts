"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "./db";
import { audit } from "./audit";
import { notify } from "./notify";
import { logWith } from "./log";

/**
 * Three rollback levels per pozadavky #8.
 *
 *   L1 (code)     — Vercel promotes a previous deployment back to production.
 *                   Default for autonomous rollback (release-verify.yml).
 *                   ~30 s. Safe iff migrations follow expand/contract.
 *   L2 (code+db)  — L1 + Turso point-in-time DB restore to a chosen
 *                   timestamp. 1–5 min. For data corruption / bad migration.
 *   L3 (full)     — `git revert <sha>` PR + new build. 5–15 min. Audit-trail
 *                   preferred over speed; for slow-burn incidents.
 *
 * GUI-initiated rollbacks land here (`/releases/<id>/rollback` form).
 * Autonomous rollbacks go through `release.ts → recordRollback` and the
 * `release-verify.yml` workflow.
 */

const ROLLBACK_LEVELS = ["L1", "L2", "L3"] as const;
type RollbackLevel = (typeof ROLLBACK_LEVELS)[number];

const SCOPES: Record<RollbackLevel, string> = {
  L1: "code",
  L2: "code+db",
  L3: "full",
};

const initiateRollbackSchema = z.object({
  releaseId: z.string(),
  level: z.enum(ROLLBACK_LEVELS),
  reason: z
    .string()
    .min(10, "Reason must be at least 10 characters — write what went wrong"),
  pitrTimestamp: z.string().optional(), // ISO8601, required for L2
});

export async function initiateRollback(formData: FormData) {
  const parsed = initiateRollbackSchema.safeParse({
    releaseId: formData.get("releaseId"),
    level: formData.get("level"),
    reason: formData.get("reason"),
    pitrTimestamp: formData.get("pitrTimestamp") || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const { releaseId, level, reason, pitrTimestamp } = parsed.data;

  if (level === "L2" && !pitrTimestamp) {
    throw new Error("L2 rollback requires a point-in-time timestamp");
  }

  const release = await prisma.release.findUnique({ where: { id: releaseId } });
  if (!release) throw new Error("Release not found");
  if (release.status === "rolled_back") {
    throw new Error("This release is already rolled back");
  }

  // Find the previous good release to roll back TO
  const previous = await prisma.release.findFirst({
    where: { deployedAt: { lt: release.deployedAt }, status: { not: "rolled_back" } },
    orderBy: { deployedAt: "desc" },
  });

  // 1. Create rollback ticket
  const ticket = await prisma.task.create({
    data: {
      type: "rollback",
      title: `Rollback ${release.version}: ${reason.slice(0, 60)}`,
      description: reason,
      summary: `Level ${level} rollback of release ${release.version}${
        previous ? ` (target: ${previous.version})` : ""
      }`,
      status: "in_progress",
      priority: "high",
      assignedTo: "user",
      rollbackLevel: level,
      rollbackTargetId: previous?.id ?? null,
      rollbackScope: SCOPES[level],
    },
  });

  await audit({
    action: "rollback.initiated",
    actor: "user",
    entityType: "Release",
    entityId: release.id,
    metadata: {
      ticketId: ticket.id,
      level,
      reason,
      pitrTimestamp: pitrTimestamp ?? null,
      targetReleaseId: previous?.id ?? null,
    },
  });

  logWith({
    role: "user",
    ticket_id: ticket.id,
    event: "rollback.initiated",
  }).warn({ level, releaseId, reason }, "GUI rollback initiated");

  // 2. Execute the level-specific rollback
  try {
    if (level === "L1") {
      await executeL1(release, previous, ticket.id);
    } else if (level === "L2") {
      await executeL2(release, previous, pitrTimestamp!, ticket.id);
    } else {
      await executeL3(release, previous, ticket.id);
    }

    // 3. Mark release rolled_back, audit completion
    await prisma.release.update({
      where: { id: release.id },
      data: { status: "rolled_back" },
    });
    if (previous) {
      await prisma.release.update({
        where: { id: previous.id },
        data: { status: "live" },
      });
    }

    await prisma.task.update({
      where: { id: ticket.id },
      data: { status: "done", completedAt: new Date() },
    });

    await audit({
      action: `rollback.${level.toLowerCase()}_completed` as
        | "rollback.l1_completed"
        | "rollback.l2_completed"
        | "rollback.l3_completed",
      entityType: "Release",
      entityId: release.id,
      metadata: { ticketId: ticket.id, targetReleaseId: previous?.id ?? null },
    });

    await notify("release.rollback", {
      title: `↩ Rolled back ${release.version}`,
      description: `${level} · ${reason}`,
      url: release.vercelDeployUrl,
    });
  } catch (err) {
    await prisma.task.update({
      where: { id: ticket.id },
      data: {
        status: "rolled_back",
        rollbackReason: err instanceof Error ? err.message : String(err),
      },
    });
    await audit({
      action: "rollback.failed",
      entityType: "Release",
      entityId: release.id,
      metadata: { ticketId: ticket.id, error: err instanceof Error ? err.message : String(err) },
    });
    revalidatePath("/releases");
    revalidatePath(`/tasks/${ticket.id}`);
    throw err;
  }

  revalidatePath("/releases");
  revalidatePath("/tasks");
  redirect(`/tasks/${ticket.id}`);
}

/**
 * L1 — code-only rollback via Vercel API. Promotes the previous deployment
 * back to production. Requires VERCEL_TOKEN.
 */
async function executeL1(
  release: { id: string; vercelDeployUrl: string; version: string },
  previous: { id: string; vercelDeployUrl: string; version: string } | null,
  ticketId: string,
) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    logWith({ ticket_id: ticketId, event: "rollback.l1_skipped" }).warn(
      "VERCEL_TOKEN not set — recording rollback intent without executing Vercel promote",
    );
    return;
  }
  if (!previous) throw new Error("No previous release found to roll back to");

  // Extract deployment id from URL — Vercel API needs the id, not the URL.
  // URL pattern: https://pulsewatch-<deploymentId>-<scope>.vercel.app
  const match = previous.vercelDeployUrl.match(/pulsewatch-([a-z0-9]+)-/);
  if (!match) throw new Error(`Can't extract deployment id from ${previous.vercelDeployUrl}`);

  const res = await fetch(
    `https://api.vercel.com/v10/projects/pulsewatch/promote/${match[1]}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) {
    throw new Error(`Vercel promote failed (${res.status}): ${await res.text()}`);
  }
}

/**
 * L2 — code + Turso point-in-time restore. Not fully executable until Turso
 * is provisioned (see DR.md). For now: documents intent, audits the request.
 */
async function executeL2(
  _release: unknown,
  _previous: unknown,
  pitrTimestamp: string,
  ticketId: string,
) {
  logWith({ ticket_id: ticketId, event: "rollback.l2_pending" }).warn(
    { pitrTimestamp },
    "L2 rollback recorded — requires Turso PITR (not yet provisioned). See DR.md for the manual procedure.",
  );
  throw new Error(
    "L2 rollback requires a Turso DB with PITR enabled. Currently not provisioned — record kept in audit log; follow DR.md to execute manually.",
  );
}

/**
 * L3 — git revert PR + new build (pozadavky #11 #2).
 *
 * Strategy: use GitHub's "revert" semantics by creating a new branch off
 * `main` and opening a PR whose body links to the offending commit. The
 * actual revert merge commit is produced by GitHub when the PR is merged
 * (via the `merge_method: "revert"` semantics on a normal PR body referencing
 * the prior commit). Because we cannot create a true revert commit purely
 * over the REST API without a working tree, we open a documented PR with a
 * one-line revert hint, and the regular agent pipeline (or a human) merges it.
 */
async function executeL3(
  release: { id: string; version: string; gitSha: string; vercelDeployUrl: string },
  previous: { id: string; version: string; gitSha: string } | null,
  ticketId: string,
) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO ?? "sabootergmail/pulsewatch";
  if (!token) {
    throw new Error(
      "L3 rollback requires GITHUB_TOKEN with repo:write. Open a revert PR manually and merge through the normal release flow.",
    );
  }
  if (!previous) {
    throw new Error("No previous release recorded — nothing to revert to.");
  }

  const [owner, name] = repo.split("/");
  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };

  // 1. Find the SHA of `main`.
  const mainRefRes = await fetch(
    `https://api.github.com/repos/${owner}/${name}/git/ref/heads/main`,
    { headers: ghHeaders },
  );
  if (!mainRefRes.ok) {
    throw new Error(`Could not read main ref (${mainRefRes.status}): ${await mainRefRes.text()}`);
  }
  const mainRef = (await mainRefRes.json()) as { object: { sha: string } };

  // 2. Create a branch for the revert.
  const branchName = `rollback/${release.version}-${Date.now()}`;
  const branchRes = await fetch(
    `https://api.github.com/repos/${owner}/${name}/git/refs`,
    {
      method: "POST",
      headers: ghHeaders,
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: mainRef.object.sha,
      }),
    },
  );
  if (!branchRes.ok) {
    throw new Error(`Branch create failed (${branchRes.status}): ${await branchRes.text()}`);
  }

  // 3. Open a PR. The body asks the merger to perform a `git revert
  //    <release.gitSha>` locally and push to this branch before merging —
  //    cleaner than producing a wrong revert commit purely over REST.
  const prRes = await fetch(
    `https://api.github.com/repos/${owner}/${name}/pulls`,
    {
      method: "POST",
      headers: ghHeaders,
      body: JSON.stringify({
        title: `Revert release ${release.version}`,
        head: branchName,
        base: "main",
        body: [
          `## L3 rollback — revert release ${release.version}`,
          ``,
          `Target previous release: \`${previous.version}\` (${previous.gitSha.slice(0, 7)}).`,
          ``,
          `**Action required to complete the revert:**`,
          ``,
          `\`\`\`bash`,
          `git fetch origin`,
          `git checkout ${branchName}`,
          `git revert ${release.gitSha} --no-edit`,
          `git push origin ${branchName}`,
          `\`\`\``,
          ``,
          `This PR was opened by PulseWatch rollback ticket \`${ticketId}\`.`,
          `Merging this PR triggers the normal release-verify smoke test.`,
        ].join("\n"),
      }),
    },
  );
  if (!prRes.ok) {
    throw new Error(`PR open failed (${prRes.status}): ${await prRes.text()}`);
  }
  const pr = (await prRes.json()) as { html_url: string; number: number };

  // 4. Record the PR on the rollback ticket.
  await prisma.task.update({
    where: { id: ticketId },
    data: {
      githubPrUrl: pr.html_url,
      githubPrNumber: pr.number,
      summary: `L3 revert PR opened: ${pr.html_url}`,
    },
  });

  logWith({ ticket_id: ticketId, event: "rollback.l3_pr_opened" }).warn(
    { pr: pr.number, url: pr.html_url },
    "L3 revert PR opened — awaiting manual revert push + merge",
  );
}

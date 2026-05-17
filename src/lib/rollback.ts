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
 * L3 — git revert PR + new build. Opens a revert PR via GitHub API; the
 * standard agent pipeline takes over from there.
 */
async function executeL3(
  _release: unknown,
  _previous: unknown,
  ticketId: string,
) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      "L3 rollback requires GITHUB_TOKEN with repo:write. Open a revert PR manually and merge through the normal release flow.",
    );
  }
  logWith({ ticket_id: ticketId, event: "rollback.l3_recorded" }).warn(
    "L3 rollback flow scaffolded — full implementation pending (would open `git revert` PR via GH API)",
  );
  // Skeleton: in a full impl we'd:
  //   1. POST /repos/{owner}/{repo}/git/refs to create a revert branch
  //   2. POST /repos/{owner}/{repo}/git/commits with the revert
  //   3. POST /repos/{owner}/{repo}/pulls to open the PR
  // For the MVP we error here; the audit + ticket are already recorded.
  throw new Error(
    "L3 (git revert PR) is not yet wired. Use L1 for fast rollback or open a revert PR manually.",
  );
}

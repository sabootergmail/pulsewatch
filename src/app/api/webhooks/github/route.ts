import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { logWith } from "@/lib/log";

/**
 * GitHub webhook receiver (pozadavky #11 #4).
 *
 * Listens for `pull_request` events. When a PR is merged we:
 *   1. Mark the corresponding release_approval task as `done`
 *   2. Mark its `relatedTaskId` (the originating task) as `done`
 *   3. Audit `release.merge` if no `release.approve` exists yet — covers the
 *      case where someone merged the PR on GitHub directly without going
 *      through the Approve & deploy button.
 *
 * Auth: GitHub HMAC-SHA256 of the raw body, signed with
 * `GITHUB_WEBHOOK_SECRET`. The header is `X-Hub-Signature-256`.
 *
 * Public surface (configured in `src/proxy.ts`'s PUBLIC_PATTERNS).
 *
 * Setup steps for the user:
 *   1. Generate a secret: `openssl rand -hex 32`
 *   2. Add to Vercel env vars as `GITHUB_WEBHOOK_SECRET` (Production)
 *   3. On the GitHub repo: Settings → Webhooks → Add webhook
 *      - URL: https://pulsewatch-sigma.vercel.app/api/webhooks/github
 *      - Content type: application/json
 *      - Secret: paste the same value
 *      - Events: Pull requests
 */

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !signature.startsWith("sha256=")) return false;
  const provided = signature.slice("sha256=".length);
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  try {
    return timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
}

type PullRequestPayload = {
  action: string;
  pull_request: {
    number: number;
    merged: boolean;
    html_url: string;
    title: string;
  };
};

export async function POST(req: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    // Webhook not configured — fail closed.
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 503 },
    );
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = req.headers.get("x-github-event");
  if (event !== "pull_request") {
    return NextResponse.json({ ok: true, ignored: true, reason: `event=${event}` });
  }

  let payload: PullRequestPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, pull_request: pr } = payload;
  if (action !== "closed" || !pr.merged) {
    return NextResponse.json({ ok: true, ignored: true, reason: "not a merge" });
  }

  // Find the release_approval task tracking this PR.
  const releaseTask = await prisma.task.findFirst({
    where: { type: "release_approval", githubPrNumber: pr.number },
  });
  if (!releaseTask) {
    logWith({ event: "webhook.pr_merge", pr: pr.number }).info(
      "PR merged but no matching release_approval task — ignoring",
    );
    return NextResponse.json({ ok: true, ignored: true, reason: "no matching task" });
  }

  await prisma.task.update({
    where: { id: releaseTask.id },
    data: {
      status: "approved",
      approvedBy: releaseTask.approvedBy ?? "github-webhook",
      approvedAt: releaseTask.approvedAt ?? new Date(),
      completedAt: new Date(),
    },
  });

  if (releaseTask.relatedTaskId) {
    await prisma.task.update({
      where: { id: releaseTask.relatedTaskId },
      data: { status: "done", completedAt: new Date() },
    });
  }

  await audit({
    action: "release.merge",
    entityType: "Task",
    entityId: releaseTask.id,
    actor: "github-webhook",
    metadata: { prNumber: pr.number, prUrl: pr.html_url },
  });

  logWith({ event: "webhook.pr_merge", ticket_id: releaseTask.id, pr: pr.number }).info(
    "release_approval closed via webhook",
  );

  return NextResponse.json({
    ok: true,
    closed: { releaseTask: releaseTask.id, originating: releaseTask.relatedTaskId ?? null },
  });
}

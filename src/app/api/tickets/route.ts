import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requestReleaseApproval, recordRollback } from "@/lib/release";

/**
 * REST API for agent ↔ pulsewatch (fallback when MCP is not configured).
 *
 * Auth: `Authorization: Bearer $TICKETS_API_TOKEN`. Token is shared between
 * GitHub Actions (claude-code-action) and pulsewatch's Vercel env.
 *
 * Supported bodies:
 *   { action: "list" }                 → list all tickets
 *   { action: "create", title, description?, priority? }
 *   { action: "update", id, status?, summary? }
 *   { action: "request_release", title, summary, prUrl, prNumber, previewUrl?, relatedTaskId? }
 *   { action: "record_rollback", releaseTaskId, reason }
 *   { action: "close", id }
 */

const listBody = z.object({ action: z.literal("list") });
const createBody = z.object({
  action: z.literal("create"),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
});
const updateBody = z.object({
  action: z.literal("update"),
  id: z.string(),
  status: z.enum(["backlog", "in_progress", "ready_for_release", "approved", "done", "rolled_back"]).optional(),
  summary: z.string().optional(),
});
const requestReleaseBody = z.object({
  action: z.literal("request_release"),
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(5000),
  prUrl: z.string().url(),
  prNumber: z.coerce.number().int().min(1),
  previewUrl: z.string().url().optional(),
  relatedTaskId: z.string().optional(),
});
const recordRollbackBody = z.object({
  action: z.literal("record_rollback"),
  releaseTaskId: z.string(),
  reason: z.string().min(1).max(5000),
});
const closeBody = z.object({ action: z.literal("close"), id: z.string() });

const body = z.union([
  listBody,
  createBody,
  updateBody,
  requestReleaseBody,
  recordRollbackBody,
  closeBody,
]);

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expected = process.env.TICKETS_API_TOKEN ?? "";
  if (!expected || token !== expected) return unauthorized();

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = body.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  const data = parsed.data;

  switch (data.action) {
    case "list": {
      const tickets = await prisma.task.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
      return NextResponse.json({ tickets });
    }
    case "create": {
      const task = await prisma.task.create({
        data: {
          title: data.title,
          description: data.description ?? null,
          priority: data.priority,
        },
      });
      await audit({
        action: "task.create",
        entityType: "Task",
        entityId: task.id,
        actor: "agent:claude",
        metadata: { source: "api" },
      });
      return NextResponse.json({ ticket: task });
    }
    case "update": {
      const task = await prisma.task.update({
        where: { id: data.id },
        data: {
          ...(data.status ? { status: data.status } : {}),
          ...(data.summary !== undefined ? { summary: data.summary } : {}),
        },
      });
      await audit({
        action: "task.update",
        entityType: "Task",
        entityId: task.id,
        actor: "agent:claude",
        metadata: { status: data.status, source: "api" },
      });
      return NextResponse.json({ ticket: task });
    }
    case "request_release": {
      const result = await requestReleaseApproval(data);
      return NextResponse.json({ id: result.id });
    }
    case "record_rollback": {
      await recordRollback(data);
      return NextResponse.json({ ok: true });
    }
    case "close": {
      const task = await prisma.task.update({
        where: { id: data.id },
        data: { status: "done", completedAt: new Date() },
      });
      await audit({
        action: "task.complete",
        entityType: "Task",
        entityId: task.id,
        actor: "agent:claude",
        metadata: { source: "api" },
      });
      return NextResponse.json({ ticket: task });
    }
  }
}

export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expected = process.env.TICKETS_API_TOKEN ?? "";
  if (!expected || token !== expected) return unauthorized();

  const tickets = await prisma.task.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return NextResponse.json({ tickets });
}

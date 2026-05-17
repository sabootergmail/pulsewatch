import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Read-only audit log endpoint for MCP / external tooling. Auth: same
 * Bearer token as /api/tickets (TICKETS_API_TOKEN).
 */
export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expected = process.env.TICKETS_API_TOKEN ?? "";
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  const ticketId = url.searchParams.get("ticket_id");

  const entries = await prisma.auditLog.findMany({
    where: {
      ...(since ? { createdAt: { gt: new Date(since) } } : {}),
      ...(ticketId ? { entityType: "Task", entityId: ticketId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ entries });
}

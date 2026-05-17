import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { log } from "@/lib/log";

/**
 * Periodically prune old Check rows. The Check table grows unbounded
 * (one row per monitor per probe interval), so without retention it would
 * dominate the DB within weeks.
 *
 * Policy: delete checks older than 30 days. Audited.
 * Auth: shared PROBE_SECRET (same as the cron probe endpoint).
 */
const RETENTION_DAYS = Number(process.env.CHECK_RETENTION_DAYS ?? "30");

async function handle(req: Request) {
  const url = new URL(req.url);
  const headerSecret = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const querySecret = url.searchParams.get("secret");
  const provided = headerSecret ?? querySecret ?? "";
  const expected = process.env.PROBE_SECRET ?? "";
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.check.deleteMany({
    where: { checkedAt: { lt: cutoff } },
  });

  await audit({
    action: "maintenance.checks_pruned",
    metadata: { count: result.count, cutoff: cutoff.toISOString(), retentionDays: RETENTION_DAYS },
  });

  log.info({ pruned: result.count, cutoff: cutoff.toISOString() }, "checks pruned");

  return NextResponse.json({ ok: true, pruned: result.count, cutoff: cutoff.toISOString() });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}

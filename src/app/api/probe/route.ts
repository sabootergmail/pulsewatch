import { NextResponse } from "next/server";
import { runDueProbes } from "@/lib/probe";

/**
 * Cron endpoint. Vercel Cron / GitHub Actions / external scheduler hits this
 * with `Authorization: Bearer $PROBE_SECRET` (or `?secret=...`).
 *
 * Returns the list of probes that ran on this invocation.
 */
async function handle(req: Request) {
  const url = new URL(req.url);
  const headerSecret = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const querySecret = url.searchParams.get("secret");
  const provided = headerSecret ?? querySecret ?? "";
  const expected = process.env.PROBE_SECRET ?? "";

  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runDueProbes();
  return NextResponse.json({ ok: true, ran: results.length, results });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}

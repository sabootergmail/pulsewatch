import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "ok", time: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      {
        status: "degraded",
        db: "fail",
        error: err instanceof Error ? err.message : "unknown",
      },
      { status: 503 },
    );
  }
}

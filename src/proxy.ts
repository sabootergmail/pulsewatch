import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";

/**
 * Route protection (pozadavky #10 body 2, 3).
 *
 * Default deny. Anything NOT matched by `PUBLIC_PATHS` requires a valid
 * NextAuth session whose user passed the allowlist check in `signIn`. The
 * allowlist itself is enforced upstream — by the time middleware runs, an
 * unauthorised user simply has no session.
 *
 * Public surfaces (no session required):
 *   /api/health         — liveness probe
 *   /api/probe          — Bearer PROBE_SECRET
 *   /api/tickets        — Bearer TICKETS_API_TOKEN (agent ↔ pulsewatch)
 *   /api/webhooks/*     — HMAC verification (GitHub webhook)
 *   /api/auth/*         — NextAuth itself
 *   /login              — auth UI
 *   /_next, /favicon    — static assets
 *
 * E2E bypass: when NODE_ENV != production AND E2E_AUTH_BYPASS=1, middleware
 * waves the request through. This lets the existing Playwright suite run
 * without an OAuth dance. The combined gate prevents the bypass from being
 * usable in a Vercel production build, even if the env var leaked.
 */

const PUBLIC_PATTERNS: RegExp[] = [
  /^\/api\/health(?:\/|$)/,
  /^\/api\/probe(?:\/|$)/,
  /^\/api\/tickets(?:\/|$)/,
  /^\/api\/webhooks\//,
  /^\/api\/auth\//,
  /^\/login(?:\/|$)/,
  /^\/_next\//,
  /^\/favicon\.ico$/,
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATTERNS.some((rx) => rx.test(pathname));
}

function isE2EBypassActive(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.E2E_AUTH_BYPASS === "1"
  );
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();
  if (isE2EBypassActive()) return NextResponse.next();

  const session = await auth();
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    if (pathname !== "/login") {
      url.searchParams.set("from", pathname);
    }
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Match everything except static asset paths Next.js handles internally.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

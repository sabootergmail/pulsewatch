import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

/**
 * NextAuth v5 (App Router) — single-user GitHub OAuth + allowlist.
 *
 * Per pozadavky #10: any signed-in GitHub user whose `login` is in
 * `ALLOWED_GITHUB_LOGINS` (comma-separated) gets a session. Everyone else
 * is denied at the signIn callback — they never get a session cookie,
 * which means the middleware will redirect them as if they hadn't logged in.
 *
 * Session strategy is JWT so we don't need a session table in the DB.
 *
 * Public surfaces that don't need a session (audited at `middleware.ts`):
 *   - /api/health (liveness)
 *   - /api/probe (Bearer PROBE_SECRET)
 *   - /api/tickets (Bearer TICKETS_API_TOKEN)
 *   - /api/webhooks/* (HMAC verification)
 *   - /api/auth/* (NextAuth itself)
 *   - /login
 */
const allowedLogins = (process.env.ALLOWED_GITHUB_LOGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const isE2EBypass = process.env.E2E_AUTH_BYPASS === "1";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [GitHub],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ profile }) {
      // Belt and braces: with no allowlist configured, refuse rather than
      // silently accept everyone. The intent here is single-user access.
      if (allowedLogins.length === 0) return false;
      const login = (profile as { login?: string } | null)?.login;
      return typeof login === "string" && allowedLogins.includes(login);
    },
    async jwt({ token, profile }) {
      if (profile) {
        token.login = (profile as { login?: string }).login;
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.login) {
        (session as { login?: string }).login = token.login as string;
      }
      return session;
    },
  },
  // E2E bypass: when E2E_AUTH_BYPASS=1, fake a perpetual session so the
  // existing Playwright tests don't need to OAuth-dance every run.
  ...(isE2EBypass
    ? {
        trustHost: true,
      }
    : {}),
});

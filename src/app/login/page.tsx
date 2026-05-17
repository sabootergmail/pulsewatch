import { signIn } from "@/auth";

export const dynamic = "force-dynamic";

/**
 * Sign-in page (pozadavky #10 body 1, 8).
 *
 * One button — "Sign in with GitHub". If a non-allowlisted user gets
 * through the OAuth dance, NextAuth's signIn callback returns false, the
 * user is bounced to `?error=AccessDenied`, and we surface that here.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const { error, from } = await searchParams;

  return (
    <div className="max-w-md mx-auto mt-24 space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">PulseWatch</h1>
        <p className="text-sm text-zinc-500">
          Sign in to access tasks, monitors, and the release pipeline.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error === "AccessDenied"
            ? "Your GitHub account is not on the allowlist for this PulseWatch instance."
            : `Sign-in failed: ${error}`}
        </div>
      )}

      <form
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: from ?? "/" });
        }}
        className="space-y-3"
      >
        <button
          type="submit"
          className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 inline-flex items-center justify-center gap-2"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Sign in with GitHub
        </button>
      </form>

      <p className="text-xs text-zinc-500 text-center">
        Access is limited to allowlisted GitHub accounts. Probe and ticket
        APIs use their own Bearer tokens and do not go through this flow.
      </p>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "PulseWatch — Uptime monitoring",
  description:
    "Lightweight uptime monitoring with incident tracking and audit logs.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-zinc-50 text-zinc-900 flex flex-col">
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="inline-block size-2.5 rounded-full bg-emerald-500 animate-pulse" />
              PulseWatch
            </Link>
            <nav className="flex items-center gap-5 text-sm text-zinc-600">
              <Link href="/" className="hover:text-zinc-900">Dashboard</Link>
              <Link href="/incidents" className="hover:text-zinc-900">Incidents</Link>
              <Link href="/audit" className="hover:text-zinc-900">Audit log</Link>
              <Link
                href="/monitors/new"
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
              >
                + New monitor
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
          {children}
        </main>
        <footer className="border-t border-zinc-200 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-3 text-xs text-zinc-500 flex items-center justify-between">
            <span>PulseWatch · MVP · AI-first build</span>
            <a
              href="https://github.com/sabootergmail/pulsewatch"
              className="hover:text-zinc-900"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}

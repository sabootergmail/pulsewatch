import pino from "pino";

const isProd = process.env.NODE_ENV === "production";
// In E2E runs we drop the pino-pretty transport: it spawns worker threads
// that collide with Turbopack's SWC worker pool under `next dev`, surfacing
// as "Jest worker encountered child process exceptions" runtime dialogs
// during Playwright tests. Tests don't need pretty logs anyway.
const isE2E = process.env.E2E_AUTH_BYPASS === "1";

export const log = pino(
  isProd || isE2E
    ? { level: process.env.LOG_LEVEL ?? (isE2E ? "warn" : "info") }
    : {
        level: process.env.LOG_LEVEL ?? "debug",
        transport: { target: "pino-pretty", options: { colorize: true } },
      },
);

export type LogContext = {
  ticket_id?: string;
  role?: "orchestrator" | "architect" | "implementer" | "reviewer" | "release-ops" | "user" | "system" | "agent:claude";
  event?: string;
  monitor_id?: string;
  incident_id?: string;
  pr?: number;
};

export function logWith(ctx: LogContext) {
  return log.child(ctx);
}

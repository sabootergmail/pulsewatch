import pino from "pino";

const isProd = process.env.NODE_ENV === "production";

export const log = pino(
  isProd
    ? { level: process.env.LOG_LEVEL ?? "info" }
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
};

export function logWith(ctx: LogContext) {
  return log.child(ctx);
}

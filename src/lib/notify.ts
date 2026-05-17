import { log } from "./log";
import { audit } from "./audit";

export type NotifyEvent =
  | "incident.open"
  | "incident.resolve"
  | "release.approve"
  | "release.merge"
  | "release.rollback";

type NotifyPayload = {
  title: string;
  description?: string;
  url?: string;
  fields?: { name: string; value: string }[];
};

const COLORS: Record<NotifyEvent, number> = {
  "incident.open": 0xef4444,
  "incident.resolve": 0x10b981,
  "release.approve": 0x6d28d9,
  "release.merge": 0x10b981,
  "release.rollback": 0xef4444,
};

/**
 * Best-effort notification to Discord. If DISCORD_WEBHOOK_URL is unset,
 * this is a no-op — the function never throws. Failures are logged but
 * don't break the calling code path (releases > alerts).
 */
export async function notify(event: NotifyEvent, payload: NotifyPayload): Promise<void> {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) {
    log.debug({ event, payload, sink: "noop" }, "notify(no webhook configured)");
    return;
  }

  const embed = {
    title: payload.title,
    description: payload.description,
    url: payload.url,
    color: COLORS[event],
    fields: payload.fields,
    timestamp: new Date().toISOString(),
    footer: { text: `PulseWatch · ${event}` },
  };

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (!res.ok) {
      log.warn(
        { event, status: res.status, body: await res.text().catch(() => "") },
        "notify failed",
      );
    } else {
      log.info({ event }, "notify ok");
    }
  } catch (err) {
    log.warn({ event, err: err instanceof Error ? err.message : String(err) }, "notify threw");
  }
}

export type BeeceptorMonitor = {
  id: string;
  name: string;
  url: string;
};

export type BeeceptorIncident = {
  id: string;
  cause: string | null;
  startedAt: Date;
};

/**
 * Fire-and-forget webhook to Beeceptor (or any HTTP inspection endpoint).
 * POSTs a structured JSON payload for every `incident.open` event.
 * If BEECEPTOR_HOOK_URL is unset this is a no-op — never throws.
 */
export async function notifyBeeceptor(
  monitor: BeeceptorMonitor,
  incident: BeeceptorIncident,
): Promise<void> {
  const hookUrl = process.env.BEECEPTOR_HOOK_URL;
  if (!hookUrl) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  const body = JSON.stringify({
    event: "incident.open",
    monitor: { id: monitor.id, name: monitor.name, url: monitor.url },
    incident: {
      id: incident.id,
      cause: incident.cause,
      startedAt: incident.startedAt.toISOString(),
    },
    timestamp: new Date().toISOString(),
  });

  try {
    const res = await fetch(hookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });
    if (res.ok) {
      await audit({
        action: "incident.webhook_sent",
        entityType: "Incident",
        entityId: incident.id,
        metadata: { monitorId: monitor.id, hookUrl },
      });
    } else {
      log.warn(
        { hookUrl, status: res.status },
        "notifyBeeceptor: non-2xx response",
      );
    }
  } catch (err) {
    log.warn(
      { hookUrl, err: err instanceof Error ? err.message : String(err) },
      "notifyBeeceptor: request failed or timed out",
    );
  } finally {
    clearTimeout(timer);
  }
}

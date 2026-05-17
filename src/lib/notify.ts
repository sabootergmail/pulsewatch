import { log } from "./log";

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

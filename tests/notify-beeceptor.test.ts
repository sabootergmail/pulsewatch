import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/lib/audit", () => ({ audit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/lib/log", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  },
  logWith: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { notifyBeeceptor } from "../src/lib/notify";
import { audit } from "../src/lib/audit";
import { log } from "../src/lib/log";

const monitor = { id: "m1", name: "API", url: "https://api.test" };
const incident = { id: "inc-1", cause: "HTTP 500", startedAt: new Date("2026-01-01T00:00:00.000Z") };

describe("notifyBeeceptor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BEECEPTOR_HOOK_URL;
  });

  afterEach(() => {
    delete process.env.BEECEPTOR_HOOK_URL;
  });

  it("Given BEECEPTOR_HOOK_URL is unset, when notifyBeeceptor is called, then fetch is not called", async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch as typeof fetch;

    await notifyBeeceptor(monitor, incident);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("Given BEECEPTOR_HOOK_URL is set, when notifyBeeceptor is called, then fetch receives the correct URL and payload", async () => {
    process.env.BEECEPTOR_HOOK_URL = "https://app.beeceptor.com/test-hook";
    const mockFetch = vi.fn(async () => new Response("ok", { status: 200 }));
    globalThis.fetch = mockFetch as typeof fetch;

    await notifyBeeceptor(monitor, incident);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [calledUrl, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("https://app.beeceptor.com/test-hook");
    expect(calledInit.method).toBe("POST");
    expect((calledInit.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

    const parsedBody = JSON.parse(calledInit.body as string) as {
      event: string;
      monitor: { id: string; name: string; url: string };
      incident: { id: string; cause: string; startedAt: string };
      timestamp: string;
    };
    expect(parsedBody.event).toBe("incident.open");
    expect(parsedBody.monitor).toEqual({ id: "m1", name: "API", url: "https://api.test" });
    expect(parsedBody.incident).toEqual({
      id: "inc-1",
      cause: "HTTP 500",
      startedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(typeof parsedBody.timestamp).toBe("string");
  });

  it("Given BEECEPTOR_HOOK_URL is set and fetch returns 2xx, when notifyBeeceptor resolves, then audit is called with incident.webhook_sent", async () => {
    process.env.BEECEPTOR_HOOK_URL = "https://app.beeceptor.com/test-hook";
    globalThis.fetch = vi.fn(async () => new Response("ok", { status: 200 })) as typeof fetch;

    await notifyBeeceptor(monitor, incident);

    expect(audit).toHaveBeenCalledOnce();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "incident.webhook_sent" }),
    );
  });

  it("Given BEECEPTOR_HOOK_URL is set and fetch returns non-2xx, when notifyBeeceptor resolves, then log.warn is called and audit is not called", async () => {
    process.env.BEECEPTOR_HOOK_URL = "https://app.beeceptor.com/test-hook";
    globalThis.fetch = vi.fn(async () => new Response("error", { status: 500 })) as typeof fetch;

    await notifyBeeceptor(monitor, incident);

    expect(log.warn).toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("Given BEECEPTOR_HOOK_URL is set and fetch times out, when the AbortController fires, then log.warn is called and no error is thrown", async () => {
    process.env.BEECEPTOR_HOOK_URL = "https://app.beeceptor.com/test-hook";
    // Simulate fetch that rejects immediately with an AbortError (as if the
    // AbortController signal already fired).  We do this synchronously so we
    // don't need real timers in the test — the 3-second timer is already
    // tested implicitly by the fact that notifyBeeceptor sets one up.
    globalThis.fetch = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          // If the signal is already aborted, reject straight away.
          if (init?.signal?.aborted) {
            reject(new DOMException("The operation was aborted", "AbortError"));
            return;
          }
          // Otherwise wait for the abort event.
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        }),
    ) as typeof fetch;

    vi.useFakeTimers();
    const call = notifyBeeceptor(monitor, incident);
    await vi.advanceTimersByTimeAsync(3001);
    await expect(call).resolves.toBeUndefined();
    vi.useRealTimers();

    expect(log.warn).toHaveBeenCalled();
  });
});

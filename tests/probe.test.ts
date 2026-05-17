import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { probe } from "../src/lib/probe";

/**
 * BDD-style specs for the HTTP probe.
 * The probe is the heart of PulseWatch — these specs nail down its contract
 * so we can refactor confidently.
 */
describe("probe()", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("given the endpoint returns the expected status", () => {
    it("reports ok=true with the http status and a measured latency", async () => {
      globalThis.fetch = vi.fn(async () => new Response("hello", { status: 200 })) as typeof fetch;

      const result = await probe("https://example.test", { expectedStatus: 200 });

      expect(result.ok).toBe(true);
      expect(result.httpStatus).toBe(200);
      expect(result.error).toBeUndefined();
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("given the endpoint returns an unexpected status", () => {
    it("reports ok=false and surfaces the http status code", async () => {
      globalThis.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as typeof fetch;

      const result = await probe("https://example.test", { expectedStatus: 200 });

      expect(result.ok).toBe(false);
      expect(result.httpStatus).toBe(500);
    });
  });

  describe("given the network call throws", () => {
    it("reports ok=false and includes the error message", async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }) as typeof fetch;

      const result = await probe("https://example.test");

      expect(result.ok).toBe(false);
      expect(result.error).toBe("ECONNREFUSED");
      expect(result.httpStatus).toBeUndefined();
    });
  });

  describe("given the call exceeds the configured timeout", () => {
    it("aborts and reports a timeout error", async () => {
      // Simulate a fetch that respects the abort signal
      globalThis.fetch = vi.fn(
        (_url, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            });
          }),
      ) as typeof fetch;

      const pending = probe("https://example.test", { timeoutMs: 1000 });
      await vi.advanceTimersByTimeAsync(1100);
      const result = await pending;

      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/Timed out/);
    });
  });
});

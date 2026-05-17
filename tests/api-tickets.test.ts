import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/lib/db", () => ({
  prisma: {
    task: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
}));
vi.mock("../src/lib/audit", () => ({ audit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/lib/notify", () => ({ notify: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/lib/log", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logWith: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { POST, GET } from "../src/app/api/tickets/route";

const TOKEN = "test-token-abc";

beforeEach(() => {
  process.env.TICKETS_API_TOKEN = TOKEN;
  vi.clearAllMocks();
});

function makeReq(payload: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
}

describe("/api/tickets — auth contract", () => {
  describe("Given the endpoint requires a Bearer token", () => {
    it("When the Authorization header is missing, then it returns 401", async () => {
      const res = await POST(makeReq({ action: "list" }));
      expect(res.status).toBe(401);
    });

    it("When the Bearer token is wrong, then it returns 401", async () => {
      const res = await POST(makeReq({ action: "list" }, { Authorization: "Bearer wrong" }));
      expect(res.status).toBe(401);
    });

    it("When the Bearer token is correct, then it returns 200", async () => {
      const res = await POST(makeReq({ action: "list" }, { Authorization: `Bearer ${TOKEN}` }));
      expect(res.status).toBe(200);
    });

    it("When the GET handler is called without auth, then it returns 401", async () => {
      const req = new Request("http://localhost/api/tickets");
      const res = await GET(req);
      expect(res.status).toBe(401);
    });
  });

  describe("Given a valid token and invalid body", () => {
    it("When `action` is missing, then it returns 400", async () => {
      const res = await POST(makeReq({ wrong: "shape" }, { Authorization: `Bearer ${TOKEN}` }));
      expect(res.status).toBe(400);
    });
  });
});

#!/usr/bin/env node
// PulseWatch MCP server.
//
// Exposes PulseWatch's ticketing + audit-log surface as MCP tools so that
// LLM clients (Claude Desktop, the IDE, or any MCP-aware agent) can read
// and create tickets without needing to know the REST API shape.
//
// Transport: stdio. The server is spawned as a child process by the MCP
// client; the client speaks JSON-RPC over stdin/stdout.
//
// REST is the primary channel for the in-pipeline agent (claude-code-action
// in GitHub Actions); MCP is for ad-hoc LLM access and external tools.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const PULSEWATCH_URL = process.env.PULSEWATCH_URL ?? "http://localhost:3000";
const TOKEN = process.env.TICKETS_API_TOKEN;

if (!TOKEN) {
  console.error(
    "[pulsewatch-mcp] TICKETS_API_TOKEN env var is required. Generate one with `openssl rand -hex 24`, set it on Vercel and in your MCP client config.",
  );
  process.exit(1);
}

async function postTickets(payload) {
  const res = await fetch(`${PULSEWATCH_URL}/api/tickets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`PulseWatch ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

const TOOLS = [
  {
    name: "list_tickets",
    description:
      "List PulseWatch tickets. Optional filter narrows by status (backlog | in_progress | ready_for_release | done) or type (task | release_approval | rollback). Returns the most recent 200.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Optional status filter",
        },
        type: {
          type: "string",
          description: "Optional type filter",
        },
      },
    },
  },
  {
    name: "create_ticket",
    description:
      "Create a new PulseWatch ticket (default type: task). The agent pipeline will pick it up when delegated. Use for filing follow-up work, bug reports, or noting tech debt.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short, imperative title (<=200 chars)" },
        description: {
          type: "string",
          description: "Markdown body — what needs doing, acceptance criteria",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Default medium",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "get_audit_log",
    description:
      "Fetch the most recent audit log entries. Useful for post-incident analysis, agent observability, and building timelines of who did what.",
    inputSchema: {
      type: "object",
      properties: {
        since: {
          type: "string",
          description: "ISO timestamp; entries strictly newer than this",
        },
        ticket_id: {
          type: "string",
          description: "Only entries scoped to this ticket id",
        },
      },
    },
  },
];

const server = new Server(
  { name: "pulsewatch-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = req.params.arguments ?? {};

  try {
    if (name === "list_tickets") {
      const { tickets } = await postTickets({ action: "list" });
      let filtered = tickets;
      if (args.status) filtered = filtered.filter((t) => t.status === args.status);
      if (args.type) filtered = filtered.filter((t) => t.type === args.type);
      return {
        content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }],
      };
    }

    if (name === "create_ticket") {
      const { ticket } = await postTickets({
        action: "create",
        title: args.title,
        description: args.description,
        priority: args.priority ?? "medium",
      });
      return {
        content: [
          {
            type: "text",
            text: `Created ticket ${ticket.id}: ${ticket.title}\nURL: ${PULSEWATCH_URL}/tasks/${ticket.id}`,
          },
        ],
      };
    }

    if (name === "get_audit_log") {
      // The /api/tickets list returns tickets; for audit we hit a dedicated
      // endpoint. We piggy-back on the same auth for simplicity.
      const url = new URL("/api/audit", PULSEWATCH_URL);
      if (args.since) url.searchParams.set("since", args.since);
      if (args.ticket_id) url.searchParams.set("ticket_id", args.ticket_id);
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      if (!res.ok) throw new Error(`audit ${res.status}: ${await res.text()}`);
      return {
        content: [{ type: "text", text: await res.text() }],
      };
    }

    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    };
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: err instanceof Error ? err.message : String(err),
        },
      ],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[pulsewatch-mcp] connected via stdio");

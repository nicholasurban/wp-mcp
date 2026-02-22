#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WordPressAPI } from "./api.js";
import { PostTypeRegistry } from "./registry.js";
import { FeedbackStore } from "./feedback.js";
import { TOOL_NAME, TOOL_DESCRIPTION, TOOL_SCHEMA, toolHandler, ToolParams, ToolContext } from "./tool.js";
import { setupOAuth } from "./oauth.js";
import path from "node:path";

const server = new McpServer({
  name: "wp-mcp-server",
  version: "1.0.0",
});

async function main(): Promise<void> {
  // Required env vars
  const siteUrl = process.env.WP_SITE_URL;
  const username = process.env.WP_USERNAME;
  const appPassword = process.env.WP_APP_PASSWORD;

  if (!siteUrl || !username || !appPassword) {
    console.error("ERROR: WP_SITE_URL, WP_USERNAME, and WP_APP_PASSWORD are required");
    process.exit(1);
  }

  // Data directory for persistent state
  const dataDir = process.env.DATA_DIR ?? path.join(import.meta.dirname ?? ".", "..", "data");

  const api = new WordPressAPI({
    siteUrl,
    username,
    appPassword,
    wcConsumerKey: process.env.WC_CONSUMER_KEY,
    wcConsumerSecret: process.env.WC_CONSUMER_SECRET,
  });

  const registry = new PostTypeRegistry(dataDir);
  const feedback = new FeedbackStore(dataDir);

  const ctx: ToolContext = { api, registry, feedback };

  // Register single tool
  server.tool(
    TOOL_NAME,
    TOOL_DESCRIPTION,
    TOOL_SCHEMA,
    async (params) => {
      const result = await toolHandler(ctx, params as ToolParams);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  // Transport selection
  const PORT = process.env.PORT ? Number(process.env.PORT) : null;

  if (PORT) {
    // HTTP transport with OAuth
    const express = (await import("express")).default;
    const { StreamableHTTPServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/streamableHttp.js"
    );

    const oauthClientId = process.env.MCP_OAUTH_CLIENT_ID;
    const oauthClientSecret = process.env.MCP_OAUTH_CLIENT_SECRET;
    const publicUrl = process.env.PUBLIC_URL;

    if (!oauthClientId || !oauthClientSecret || !publicUrl) {
      console.error("ERROR: MCP_OAUTH_CLIENT_ID, MCP_OAUTH_CLIENT_SECRET, and PUBLIC_URL required for HTTP");
      process.exit(1);
    }

    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    const { validateToken } = setupOAuth(app, {
      clientId: oauthClientId,
      clientSecret: oauthClientSecret,
      publicUrl,
      staticToken: process.env.MCP_AUTH_TOKEN,
    });

    app.post("/mcp", async (req, res) => {
      if (!validateToken(req)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on("close", () => transport.close());
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });

    app.get("/health", (_req, res) => res.json({ status: "ok" }));

    app.listen(PORT, () => {
      console.error(`WordPress MCP server running on http://0.0.0.0:${PORT}/mcp`);
    });
  } else {
    // Stdio transport (default for Claude Code)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("WordPress MCP server running via stdio");
  }
}

main().catch((err) => {
  console.error("Server error:", err);
  process.exit(1);
});

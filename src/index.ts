#!/usr/bin/env node
/**
 * Clay MCP Server Entry Point
 *
 * Starts the MCP server with stdio transport for Claude Desktop integration.
 *
 * Usage:
 *   CLAY_SESSION_COOKIE=... node dist/index.js
 *
 * Or configure in Claude Desktop:
 *   {
 *     "mcpServers": {
 *       "clay": {
 *         "command": "node",
 *         "args": ["/path/to/clay-mcp/dist/index.js"],
 *         "env": { "CLAY_SESSION_COOKIE": "..." }
 *       }
 *     }
 *   }
 */

import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  // Check for dry-run mode
  const dryRun = process.argv.includes('--dry-run');
  // Check for debug mode (--debug flag or CLAY_DEBUG env var)
  const debug = process.argv.includes('--debug') || process.env.CLAY_DEBUG === 'true';

  if (dryRun) {
    console.error('[clay-mcp] Running in dry-run mode - no API calls will be made');
  }
  if (debug) {
    console.error('[clay-mcp] Debug mode enabled - logging request timing');
  }

  // Create the server
  const server = createServer({ dryRun, debug });

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[clay-mcp] Server running on stdio');
}

main().catch((error) => {
  console.error('[clay-mcp] Fatal error:', error);
  process.exit(1);
});

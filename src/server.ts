/**
 * Clay MCP Server Configuration
 *
 * Sets up the MCP server with all tools and resources.
 * Uses the high-level McpServer API for cleaner code.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ClayClient } from './client.js';
import { registerTableTools } from './tools/tables.js';
import { registerRecordTools } from './tools/records.js';
import { registerFieldTools } from './tools/fields.js';
import { registerEnrichmentTools } from './tools/enrichments.js';
import { registerDiscoveryTools } from './tools/discovery.js';
import { registerRegistryTools } from './tools/registry.js';
import { registerTemplateTools } from './tools/templates.js';
import { registerSourcingTools } from './tools/sourcing.js';
import { registerCrmTools } from './tools/crm.js';
import { registerWorkflowTools } from './tools/workflows.js';
import { registerAutoMapperTools } from './tools/automapper.js';
import { registerSourceTools } from './tools/sources.js';
import { registerAuditTools } from './tools/audit.js';
import { registerTableResources } from './resources/tables.js';
import { registerWorkspaceResources } from './resources/workspaces.js';

export interface ServerConfig {
  sessionCookie?: string;
  dryRun?: boolean;
  debug?: boolean;
}

/**
 * Create and configure the Clay MCP server
 */
export function createServer(config: ServerConfig = {}): McpServer {
  // Initialize the MCP server
  const server = new McpServer({
    name: 'clay-mcp',
    version: '1.0.0',
  });

  // Initialize the Clay API client
  const client = new ClayClient({
    sessionCookie: config.sessionCookie,
    dryRun: config.dryRun,
    debug: config.debug,
  });

  // Register all tools
  registerTableTools(server, client);
  registerRecordTools(server, client);
  registerFieldTools(server, client);
  registerEnrichmentTools(server, client);
  registerDiscoveryTools(server, client);
  registerRegistryTools(server, client);
  registerTemplateTools(server, client);
  registerSourcingTools(server, client);
  registerCrmTools(server, client);
  registerWorkflowTools(server, client);
  registerAutoMapperTools(server, client);
  registerSourceTools(server, client);
  registerAuditTools(server, client);

  // Register all resources
  registerTableResources(server, client);
  registerWorkspaceResources(server, client);

  return server;
}

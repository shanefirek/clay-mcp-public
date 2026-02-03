/**
 * Sourcing Tools
 *
 * NOTE: The sourcing tools (Find Companies, Find People) now use Clay's wizard
 * endpoints and are registered in sources.ts:
 *   - clay_wizard_find_companies
 *   - clay_wizard_find_people
 *
 * The tools previously in this file used broken API approaches (sourceSettings,
 * POST /sources) that return "Invalid subscriptions" errors.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ClayClient } from '../client.js';

export function registerSourcingTools(
  _server: McpServer,
  _client: ClayClient
): void {
  // All sourcing tools moved to sources.ts (wizard-based)
  // This function is kept for backwards compatibility with the tool registration pattern
}

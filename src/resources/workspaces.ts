/**
 * Workspace Resources
 *
 * Expose Clay workspaces as browsable MCP resources.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ClayClient } from '../client.js';
import { getRegistry } from '../enrichments/index.js';

export function registerWorkspaceResources(
  server: McpServer,
  client: ClayClient
): void {
  /**
   * Resource for listing all workspaces
   * URI: clay://workspaces
   */
  server.registerResource(
    'workspaces',
    'clay://workspaces',
    {
      title: 'Clay Workspaces',
      description: 'List all workspaces available to the authenticated user',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const workspaces = await client.getMyWorkspaces();
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(workspaces, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/plain',
              text: `Error fetching workspaces: ${(error as Error).message}`,
            },
          ],
        };
      }
    }
  );

  /**
   * Resource for enrichment provider registry
   * URI: clay://enrichments
   */
  server.registerResource(
    'enrichments',
    'clay://enrichments',
    {
      title: 'Enrichment Registry',
      description:
        'Browse the local enrichment provider registry. Shows all known providers organized by category.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const registry = await getRegistry();
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(registry, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/plain',
              text: `Error fetching registry: ${(error as Error).message}`,
            },
          ],
        };
      }
    }
  );

  /**
   * Resource for available actions from API
   * URI: clay://actions
   */
  server.registerResource(
    'actions',
    'clay://actions',
    {
      title: 'Available Actions',
      description:
        'List all enrichment actions available from the Clay API. Use this to discover new providers.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        // Get first workspace to fetch actions
        const workspacesRes = (await client.getMyWorkspaces()) as {
          results?: Array<{ id: number }>;
        };
        const workspaces = workspacesRes.results || [];
        if (workspaces.length === 0) {
          throw new Error('No workspaces found');
        }
        const workspaceId = workspaces[0].id.toString();
        const actions = await client.getAvailableActions(workspaceId);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(actions, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/plain',
              text: `Error fetching actions: ${(error as Error).message}`,
            },
          ],
        };
      }
    }
  );

  /**
   * Resource for waterfall presets
   * URI: clay://waterfall-presets
   */
  server.registerResource(
    'waterfall-presets',
    'clay://waterfall-presets',
    {
      title: 'Waterfall Presets',
      description:
        'Pre-built waterfall templates for common enrichment patterns',
      mimeType: 'application/json',
    },
    async (uri) => {
      const registry = await getRegistry();

      // Build waterfall templates from registry providers
      const emailFinders = registry['email-finders'] || {};
      const phoneFinders = registry['phone-enrichment'] || {};

      const presets = {
        'email-finder-waterfall': {
          name: 'Email Finder Waterfall',
          description: 'Find work emails using multiple providers in sequence',
          providers: Object.keys(emailFinders).map(key => ({
            name: emailFinders[key].displayName,
            actionKey: emailFinders[key].actionKey,
            actionPackageId: emailFinders[key].actionPackageId,
          })),
          recommendedOrder: ['findymail', 'hunter', 'leadmagic', 'prospeo', 'dropcontact'],
        },
        'phone-finder-waterfall': {
          name: 'Phone Finder Waterfall',
          description: 'Find phone numbers using multiple providers',
          providers: Object.keys(phoneFinders).map(key => ({
            name: phoneFinders[key].displayName,
            actionKey: phoneFinders[key].actionKey,
            actionPackageId: phoneFinders[key].actionPackageId,
          })),
        },
        'categories': Object.keys(registry),
        'totalProviders': Object.values(registry).reduce(
          (sum, cat) => sum + Object.keys(cat).length, 0
        ),
      };

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(presets, null, 2),
          },
        ],
      };
    }
  );
}

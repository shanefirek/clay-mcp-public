/**
 * Discovery Tools
 *
 * Tools for discovering available enrichment actions and providers.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { ClayClient } from '../client.js';
import { getRegistry } from '../enrichments/index.js';
import type { TableId, WorkspaceId } from '../types/clay.js';

export function registerDiscoveryTools(
  server: McpServer,
  client: ClayClient
): void {
  /**
   * clay_discover - Discover all workspaces, workbooks, tables, and fields
   */
  server.registerTool(
    'clay_discover',
    {
      title: 'Discover Clay Workspace',
      description:
        'Discover all your Clay workspaces, workbooks, tables, and their columns. Use this first to find table IDs and field IDs.',
      inputSchema: {
        includeFields: z
          .boolean()
          .optional()
          .describe('Include all field details for each table. Default: true'),
      },
    },
    async ({ includeFields = true }) => {
      try {
        // Get workspaces
        const workspacesRes = (await client.getMyWorkspaces()) as {
          results?: Array<{ id: number; name: string }>;
        };
        const workspaces = workspacesRes.results || [];

        const result: Array<{
          workspace: { id: number; name: string };
          workbooks: Array<{
            id: string;
            name: string;
            tables: Array<{
              id: string;
              name: string;
              url: string;
              fields?: Array<{ id: string; name: string; type: string }>;
            }>;
          }>;
        }> = [];

        for (const ws of workspaces) {
          // Get workbooks for this workspace
          const workbooks = (await client.getWorkbooks(ws.id.toString())) as Array<{
            id: string;
            name: string;
          }>;

          const workbookData: Array<{
            id: string;
            name: string;
            tables: Array<{
              id: string;
              name: string;
              url: string;
              fields?: Array<{ id: string; name: string; type: string }>;
            }>;
          }> = [];

          for (const wb of workbooks) {
            // Get tables for this workbook
            const tables = (await client.getWorkbookTables(wb.id)) as Array<{
              id: string;
              name: string;
            }>;

            const tableData: Array<{
              id: string;
              name: string;
              url: string;
              fields?: Array<{ id: string; name: string; type: string }>;
            }> = [];

            for (const t of tables) {
              const tableInfo: {
                id: string;
                name: string;
                url: string;
                fields?: Array<{ id: string; name: string; type: string }>;
              } = {
                id: t.id,
                name: t.name,
                url: `https://app.clay.com/workbooks/${wb.id}/tables/${t.id}`,
              };

              if (includeFields) {
                try {
                  const tableDetails = (await client.getTable(t.id as TableId)) as {
                    table?: {
                      fields?: Array<{ id: string; name: string; type: string }>;
                    };
                  };
                  tableInfo.fields = tableDetails.table?.fields?.map((f) => ({
                    id: f.id,
                    name: f.name,
                    type: f.type,
                  }));
                } catch {
                  // Skip if can't fetch table details
                }
              }

              tableData.push(tableInfo);
            }

            workbookData.push({
              id: wb.id,
              name: wb.name,
              tables: tableData,
            });
          }

          result.push({
            workspace: { id: ws.id, name: ws.name },
            workbooks: workbookData,
          });
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error discovering workspace: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_list_available_actions - Discover enrichment providers from Clay API
   */
  server.registerTool(
    'clay_list_available_actions',
    {
      title: 'List Available Actions',
      description:
        'List available enrichment actions and their actionPackageIds from Clay API. Use this to discover providers for waterfall fields.',
      inputSchema: {
        workspaceId: z.string().describe('Workspace ID (numeric string)'),
      },
    },
    async ({ workspaceId }) => {
      try {
        const actions = await client.getAvailableActions(workspaceId as WorkspaceId);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(actions, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error listing available actions: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_get_waterfall_presets - Get pre-built waterfall templates from local registry
   */
  server.registerTool(
    'clay_get_waterfall_presets',
    {
      title: 'Get Waterfall Presets',
      description:
        'Get pre-built waterfall templates for common enrichment patterns (email finder, phone finder, etc.) from the local provider registry.',
      inputSchema: {},
    },
    async () => {
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
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(presets, null, 2),
          },
        ],
      };
    }
  );
}

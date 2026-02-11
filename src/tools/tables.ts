/**
 * Table Tools
 *
 * Tools for reading table schemas, listing tables, and workspace operations.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { ClayClient } from '../client.js';
import type { TableId, ViewId, FieldId, WorkspaceId } from '../types/clay.js';
import {
  tableId,
  viewId,
  fieldId,
  workspaceId,
  workbookId,
  nonEmptyString,
} from '../validation.js';

export function registerTableTools(server: McpServer, client: ClayClient): void {
  /**
   * clay_list_tables - List all tables in a workspace
   */
  server.registerTool(
    'clay_list_tables',
    {
      title: 'List Clay Tables',
      description: 'List all tables in a Clay workspace',
      inputSchema: {
        workspaceId: workspaceId('Workspace ID (numeric string)'),
      },
    },
    async ({ workspaceId: wsId }) => {
      try {
        const tables = await client.listTables(wsId as WorkspaceId);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(tables, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error listing tables: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_get_table - Get table schema with all fields
   */
  server.registerTool(
    'clay_get_table',
    {
      title: 'Get Clay Table',
      description:
        'Get table schema including all columns, formulas, enrichment configs, and views',
      inputSchema: {
        tableId: tableId(),
      },
    },
    async ({ tableId: tblId }) => {
      try {
        const table = await client.getTable(tblId as TableId);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(table, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error getting table: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_create_table - Create a new table in a workbook
   */
  server.registerTool(
    'clay_create_table',
    {
      title: 'Create Clay Table',
      description:
        'Create a new table in a Clay workbook. Returns the new table with its ID and default views.',
      inputSchema: {
        name: nonEmptyString.describe('Name for the new table'),
        workbookId: workbookId(),
        workspaceId: z.number().describe('Workspace ID (numeric)'),
        type: z
          .enum(['spreadsheet', 'company', 'people', 'jobs'])
          .optional()
          .describe(
            'Table type: spreadsheet (blank), company, people, or jobs. Default: spreadsheet'
          ),
      },
    },
    async ({ name, workbookId: wbId, workspaceId: wsId, type = 'spreadsheet' }) => {
      try {
        const result = await client.createTable(
          name,
          wbId,
          wsId,
          type
        );
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
              text: `Error creating table: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_create_workbook - Create a new workbook in a workspace
   */
  server.registerTool(
    'clay_create_workbook',
    {
      title: 'Create Clay Workbook',
      description:
        'Create a new workbook in a Clay workspace. Returns the new workbook with its ID.',
      inputSchema: {
        name: z.string().describe('Name for the new workbook'),
        workspaceId: z.number().describe('Workspace ID (numeric)'),
        parentFolderId: z.string().optional().describe('Folder ID (f_xxx) to create the workbook in'),
      },
    },
    async ({ name, workspaceId, parentFolderId }) => {
      try {
        const result = await client.createWorkbook(name, workspaceId, parentFolderId);
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
              text: `Error creating workbook: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_list_claygents - List saved Claygent configurations in a workspace
   */
  server.registerTool(
    'clay_list_claygents',
    {
      title: 'List Claygents',
      description:
        'List all saved Claygent (AI research agent) configurations in a workspace. These are reusable prompts and settings that can be applied to tables.',
      inputSchema: {
        workspaceId: z.string().describe('Workspace ID (numeric string)'),
      },
    },
    async ({ workspaceId }) => {
      try {
        const claygents = await client.listClaygents(workspaceId as WorkspaceId);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(claygents, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error listing claygents: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_list_integrations - List connected integrations in a workspace
   */
  server.registerTool(
    'clay_list_integrations',
    {
      title: 'List Integrations',
      description:
        'List all connected app accounts/integrations in a workspace (HubSpot, Google Sheets, Salesforce, etc.). Returns account IDs needed for CRM write-back actions.',
      inputSchema: {
        workspaceId: z.string().describe('Workspace ID (numeric string)'),
      },
    },
    async ({ workspaceId }) => {
      try {
        const accounts = await client.getWorkspaceAppAccounts(workspaceId as WorkspaceId);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(accounts, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error listing integrations: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_search_enrichments - Search available enrichments
   */
  server.registerTool(
    'clay_search_enrichments',
    {
      title: 'Search Enrichments',
      description:
        'Search Clay\'s enrichment catalog to find available data providers (email finders, company enrichment, etc.).',
      inputSchema: {
        workspaceId: z.string().describe('Workspace ID (numeric string)'),
        query: z.string().describe('Search query (e.g., "find email", "company data", "hubspot")'),
      },
    },
    async ({ workspaceId, query }) => {
      try {
        const results = await client.searchEnrichments(workspaceId as WorkspaceId, query);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error searching enrichments: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ==================== TABLE MANAGEMENT TOOLS ====================

  /**
   * clay_duplicate_table - Duplicate a table
   */
  server.registerTool(
    'clay_duplicate_table',
    {
      title: 'Duplicate Table',
      description:
        'Create a copy of a Clay table with all fields, views, and records.',
      inputSchema: {
        tableId: tableId('Table ID to duplicate (t_xxx format)'),
      },
    },
    async ({ tableId }) => {
      try {
        const result = await client.duplicateTable(tableId as TableId);
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
              text: `Error duplicating table: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_export_table - Export a table to CSV
   */
  server.registerTool(
    'clay_export_table',
    {
      title: 'Export Table',
      description:
        'Export a Clay table view to CSV. Returns an export job that can be polled for the download URL.',
      inputSchema: {
        tableId: tableId(),
        viewId: viewId('View ID to export (gv_xxx format)'),
      },
    },
    async ({ tableId, viewId }) => {
      try {
        // Start export
        const exportJob = await client.exportTable(
          tableId as TableId,
          viewId as ViewId
        );

        // Poll for completion (max 30 seconds)
        let result: { status: string; url?: string; id?: string } = { ...exportJob };
        const maxAttempts = 15;
        for (let i = 0; i < maxAttempts; i++) {
          if (result.status === 'COMPLETED' || result.url) {
            break;
          }
          await new Promise((r) => setTimeout(r, 2000));
          result = await client.getExportStatus(exportJob.id);
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
              text: `Error exporting table: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_share_table - Create or update a shared table link
   */
  server.registerTool(
    'clay_share_table',
    {
      title: 'Share Table',
      description:
        'Create a shareable link for a Clay table. Can be public or restricted to specific emails.',
      inputSchema: {
        tableId: tableId(),
        sharingType: z
          .enum(['public', 'private', 'restricted'])
          .optional()
          .describe('Sharing type: public (anyone with link), restricted (specific emails), private (disabled). Default: public'),
        viewId: viewId('View ID to share (gv_xxx format). If not specified, uses default view.').optional(),
        sharedUserEmails: z.string().optional().describe('Comma-separated emails for restricted sharing'),
      },
    },
    async ({ tableId, sharingType = 'public', viewId, sharedUserEmails }) => {
      try {
        // First check if shared table already exists
        let sharedTable: { id?: string } = {};
        try {
          sharedTable = await client.getSharedTableInfo(tableId as TableId) as { id?: string };
        } catch {
          // No existing shared table, create one
          sharedTable = await client.createSharedTable(tableId as TableId);
        }

        // Update settings if we have a shared table ID
        if (sharedTable?.id) {
          await client.updateSharedTable(sharedTable.id, {
            sharingType,
            viewId: viewId as ViewId | undefined,
            sharedUserEmails,
          });
        }

        // Get final state
        const result = await client.getSharedTableInfo(tableId as TableId);
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
              text: `Error sharing table: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ==================== VIEW TOOLS ====================

  /**
   * clay_duplicate_view - Duplicate a view
   */
  server.registerTool(
    'clay_duplicate_view',
    {
      title: 'Duplicate View',
      description: 'Create a copy of a view with all its filters and settings.',
      inputSchema: {
        tableId: tableId(),
        viewId: viewId('View ID to duplicate (gv_xxx format)'),
      },
    },
    async ({ tableId, viewId }) => {
      try {
        const result = await client.duplicateView(
          tableId as TableId,
          viewId as ViewId
        );
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
              text: `Error duplicating view: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_filter_view - Update view filters
   */
  server.registerTool(
    'clay_filter_view',
    {
      title: 'Filter View',
      description:
        'Set filters on a view. Supports operators: EQUAL, NOT_EQUAL, CONTAIN, NOT_CONTAIN, EMPTY, NOT_EMPTY, and more.',
      inputSchema: {
        tableId: tableId(),
        viewId: viewId(),
        combinationMode: z
          .enum(['AND', 'OR'])
          .optional()
          .describe('How to combine filters: AND (all must match) or OR (any can match). Default: AND'),
        filters: z
          .array(
            z.object({
              fieldId: fieldId('Field ID to filter on (f_xxx format)'),
              operator: z
                .string()
                .describe('Filter operator: EQUAL, NOT_EQUAL, CONTAIN, NOT_CONTAIN, EMPTY, NOT_EMPTY, HAS_ERROR, RESULTS, NO_RESULTS'),
              value: z.any().optional().describe('Filter value (not needed for EMPTY, NOT_EMPTY, etc.)'),
            })
          )
          .describe('Array of filter conditions'),
      },
    },
    async ({ tableId, viewId, combinationMode = 'AND', filters }) => {
      try {
        const result = await client.updateViewFilter(
          tableId as TableId,
          viewId as ViewId,
          {
            combinationMode,
            items: filters.map((f: { fieldId: string; operator: string; value?: unknown }) => ({
              fieldId: f.fieldId as FieldId,
              type: f.operator,
              value: f.value,
            })),
          }
        );
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
              text: `Error updating view filter: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_delete_view - Delete a view
   */
  server.registerTool(
    'clay_delete_view',
    {
      title: 'Delete View',
      description: 'Delete a view from a table. Cannot delete the default view.',
      inputSchema: {
        tableId: tableId(),
        viewId: viewId('View ID to delete (gv_xxx format)'),
      },
    },
    async ({ tableId, viewId }) => {
      try {
        await client.deleteView(tableId as TableId, viewId as ViewId);
        return {
          content: [
            {
              type: 'text' as const,
              text: `View ${viewId} deleted successfully`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error deleting view: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

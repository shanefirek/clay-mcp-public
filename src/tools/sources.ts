/**
 * Source Tools
 *
 * Tools for managing data sources, including webhooks.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { ClayClient } from '../client.js';
import type { TableId } from '../types/clay.js';
import {
  tableId,
  workspaceId,
  workbookId,
  sourceId,
  nonEmptyString,
} from '../validation.js';

export function registerSourceTools(server: McpServer, client: ClayClient): void {
  /**
   * clay_create_webhook_table - Create a table with a webhook source
   */
  server.registerTool(
    'clay_create_webhook_table',
    {
      title: 'Create Webhook Table',
      description:
        'Create a new Clay table with a webhook source. Returns the table with a webhook URL that external systems can POST data to.',
      inputSchema: {
        name: nonEmptyString.describe('Name for the webhook (becomes part of the URL slug)'),
        workbookId: workbookId('Workbook to create table in'),
        workspaceId: workspaceId('Workspace ID'),
        description: z.string().optional().describe('Description for the webhook source'),
        responseType: z.enum(['JSON', 'PLAIN_TEXT']).optional().describe('Response type when data is posted (default: PLAIN_TEXT)'),
      },
    },
    async ({ name, workbookId: wbId, workspaceId: wsId, description, responseType }) => {
      try {
        const result = await client.createWebhookTable(name, wbId, wsId, {
          description,
          responseType,
        });

        // Get the source to retrieve the webhook URL
        const table = result as { id: string };
        const sources = await client.getSources(table.id as TableId);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ table: result, sources }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error creating webhook table: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_list_sources - List sources for a table
   */
  server.registerTool(
    'clay_list_sources',
    {
      title: 'List Table Sources',
      description: 'List all data sources for a Clay table. Returns source IDs and webhook URLs.',
      inputSchema: {
        tableId: tableId(),
      },
    },
    async ({ tableId: tblId }) => {
      try {
        const sources = await client.getSources(tblId as TableId);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(sources, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error listing sources: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_get_source - Get source details
   */
  server.registerTool(
    'clay_get_source',
    {
      title: 'Get Source',
      description:
        'Get details for a specific data source, including webhook URL and configuration.',
      inputSchema: {
        sourceId: sourceId(),
      },
    },
    async ({ sourceId: srcId }) => {
      try {
        const source = await client.getSource(srcId);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(source, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error getting source: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_set_webhook_response_type - Set webhook response format
   */
  server.registerTool(
    'clay_set_webhook_response_type',
    {
      title: 'Set Webhook Response Type',
      description:
        'Set the response type for a webhook source. JSON returns structured response, PLAIN_TEXT returns simple text.',
      inputSchema: {
        sourceId: sourceId(),
        responseType: z.enum(['JSON', 'PLAIN_TEXT']).describe('Response format: JSON or PLAIN_TEXT'),
      },
    },
    async ({ sourceId: srcId, responseType }) => {
      try {
        const result = await client.setWebhookResponseType(srcId, responseType);
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
              text: `Error setting webhook response type: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_create_webhook_auth_token - Create auth token for webhook
   */
  server.registerTool(
    'clay_create_webhook_auth_token',
    {
      title: 'Create Webhook Auth Token',
      description:
        'Create an authentication token for a webhook source. Requests to the webhook will need to include this token.',
      inputSchema: {
        sourceId: sourceId(),
      },
    },
    async ({ sourceId: srcId }) => {
      try {
        const result = await client.createWebhookAuthToken(srcId);
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
              text: `Error creating webhook auth token: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_delete_source - Delete a source
   */
  server.registerTool(
    'clay_delete_source',
    {
      title: 'Delete Source',
      description: 'Delete a data source from a table. This will disable the webhook URL.',
      inputSchema: {
        sourceId: sourceId(),
      },
    },
    async ({ sourceId: srcId }) => {
      try {
        const result = await client.deleteSource(srcId);
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
              text: `Error deleting source: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_wizard_find_companies - Create Find Companies table using Clay's wizard (v3)
   */
  server.registerTool(
    'clay_wizard_find_companies',
    {
      title: 'Find Companies',
      description:
        'Create a Find Companies table using Clay\'s wizard endpoint. ' +
        'This is the SAME flow as the Clay UI - creates table with source and fields automatically.',
      inputSchema: {
        workspaceId: z.number().describe('Workspace ID (numeric)'),
        workbookId: workbookId('Workbook ID (wb_xxx format)'),
        industries: z.array(z.string()).optional().describe('Industries to include (e.g., ["Marketing Services"])'),
        industriesExclude: z.array(z.string()).optional().describe('Industries to exclude'),
        locations: z.array(z.string()).optional().describe('Locations (e.g., ["Massachusetts", "New York"])'),
        sizes: z.array(z.string()).optional().describe('Size codes: "2"=2-10, "10"=11-50, "50"=51-200, "200"=201-500'),
        types: z.array(z.string()).optional().describe('Company types (e.g., ["Privately Held"])'),
        annualRevenues: z.array(z.string()).optional().describe('Revenue ranges'),
        descriptionKeywords: z.array(z.string()).optional().describe('Keywords in description'),
        limit: z.number().optional().describe('Max companies (default: 100)'),
      },
    },
    async ({
      workspaceId: wsId,
      workbookId: wbId,
      industries,
      industriesExclude,
      locations,
      sizes,
      types,
      annualRevenues,
      descriptionKeywords,
      limit,
    }) => {
      try {
        const result = await client.wizardFindCompanies(wsId, wbId, {
          industries,
          industriesExclude,
          locations,
          sizes,
          types,
          annualRevenues,
          descriptionKeywords,
          limit,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Created Find Companies table via wizard. Companies will populate automatically.',
                  result,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error in wizard: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_wizard_find_people - Create Find People table using Clay's wizard (v3)
   */
  server.registerTool(
    'clay_wizard_find_people',
    {
      title: 'Find People',
      description:
        'Create a Find People table using Clay\'s wizard endpoint. ' +
        'Two modes: (1) Standalone - pass companyDomains directly, or ' +
        '(2) Linked - pass linkedTable config to chain from existing company table.',
      inputSchema: {
        workspaceId: z.number().describe('Workspace ID (numeric)'),
        workbookId: workbookId('Workbook ID (wb_xxx format)'),
        // Standalone mode
        companyDomains: z.array(z.string()).optional().describe('Company domains to find people at (e.g., ["stripe.com", "notion.so"])'),
        // Linked mode
        linkedTableId: tableId().optional().describe('Source company table ID (t_xxx) - for linked mode'),
        linkedViewId: z.string().optional().describe('Source view ID (gv_xxx) - for linked mode'),
        linkedFieldId: z.string().optional().describe('Field ID containing company identifiers (f_xxx) - for linked mode'),
        linkedRecordIds: z.array(z.string()).optional().describe('Record IDs from source table (r_xxx array) - for linked mode'),
        linkedCompanyIdentifiers: z.array(z.string()).optional().describe('Company identifiers (LinkedIn URLs) from source records - for linked mode'),
        // Filters
        jobTitleKeywords: z.array(z.string()).optional().describe('Job title keywords (e.g., ["VP", "Director", "Head of"])'),
        jobTitleExcludeKeywords: z.array(z.string()).optional().describe('Job titles to exclude (e.g., ["Intern", "Junior"])'),
        seniorityLevels: z.array(z.string()).optional().describe('Seniority: "owner", "founder", "c-suite", "partner", "vp", "director", "manager", "senior", "entry" (lowercase)'),
        jobFunctions: z.array(z.string()).optional().describe('Departments: "Sales", "Marketing", "Engineering", "Finance", "Operations"'),
        includePastExperiences: z.boolean().optional().describe('Include former employees (default: false)'),
        limit: z.number().optional().describe('Max people to find (default: no limit)'),
        companyIndustries: z.array(z.string()).optional().describe('Filter by company industries (e.g., ["Marketing Services"])'),
        companySizes: z.array(z.string()).optional().describe('Filter by company size (e.g., ["11-50", "51-200"])'),
        locations: z.array(z.string()).optional().describe('Filter by location (e.g., ["Massachusetts", "New York"])'),
      },
    },
    async ({
      workspaceId: wsId,
      workbookId: wbId,
      companyDomains,
      linkedTableId,
      linkedViewId,
      linkedFieldId,
      linkedRecordIds,
      linkedCompanyIdentifiers,
      jobTitleKeywords,
      jobTitleExcludeKeywords,
      seniorityLevels,
      jobFunctions,
      includePastExperiences,
      limit,
      companyIndustries,
      companySizes,
      locations,
    }) => {
      try {
        // Build linked table config if provided
        const linkedTable = linkedTableId && linkedViewId && linkedFieldId && linkedRecordIds && linkedCompanyIdentifiers
          ? {
              tableId: linkedTableId,
              viewId: linkedViewId,
              fieldId: linkedFieldId,
              recordIds: linkedRecordIds,
              companyIdentifiers: linkedCompanyIdentifiers,
            }
          : undefined;

        const result = await client.wizardFindPeople(wsId, wbId, {
          companyDomains: linkedTable ? undefined : companyDomains,
          linkedTable,
          jobTitleKeywords,
          jobTitleExcludeKeywords,
          seniorityLevels,
          jobFunctions,
          includePastExperiences,
          limit,
          companyIndustries,
          companySizes,
          locations,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Created Find People table via wizard. People will populate automatically.',
                  result,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error in wizard: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

}

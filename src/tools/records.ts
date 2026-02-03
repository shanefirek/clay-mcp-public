/**
 * Record Tools
 *
 * CRUD operations for Clay records.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { ClayClient } from '../client.js';
import type { TableId, ViewId, RecordId } from '../types/clay.js';
import { tableId, viewId, recordId, recordIdSchema } from '../validation.js';

export function registerRecordTools(server: McpServer, client: ClayClient): void {
  /**
   * clay_create_record - Create a new record
   */
  server.registerTool(
    'clay_create_record',
    {
      title: 'Create Clay Record',
      description: 'Create a new record in a Clay table',
      inputSchema: {
        tableId: tableId(),
        data: z
          .record(z.unknown())
          .optional()
          .describe('Key-value pairs of fieldId: value'),
      },
    },
    async ({ tableId, data }) => {
      try {
        // Create the record
        const record = await client.createRecord(tableId as TableId);

        // If data provided, update the record with values
        if (data && Object.keys(data).length > 0) {
          await client.updateRecord(
            tableId as TableId,
            record.id,
            data as Record<string, unknown>
          );
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(record, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error creating record: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_get_record - Get a single record by ID
   */
  server.registerTool(
    'clay_get_record',
    {
      title: 'Get Clay Record',
      description: 'Get a single record by its ID',
      inputSchema: {
        tableId: tableId(),
        recordId: recordId(),
      },
    },
    async ({ tableId, recordId }) => {
      try {
        const record = await client.getRecord(
          tableId as TableId,
          recordId as RecordId
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(record, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error getting record: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_batch_create_records - Create multiple records at once
   */
  server.registerTool(
    'clay_batch_create_records',
    {
      title: 'Batch Create Clay Records',
      description: 'Create multiple records in a Clay table at once',
      inputSchema: {
        tableId: tableId(),
        records: z
          .array(z.record(z.unknown()))
          .describe('Array of objects with fieldId: value pairs'),
      },
    },
    async ({ tableId, records }) => {
      try {
        const created = [];
        for (const data of records) {
          const record = await client.createRecord(tableId as TableId);
          if (Object.keys(data).length > 0) {
            await client.updateRecord(
              tableId as TableId,
              record.id,
              data as Record<string, unknown>
            );
          }
          created.push(record);
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ created: created.length, records: created }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error batch creating records: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_update_record - Update an existing record
   */
  server.registerTool(
    'clay_update_record',
    {
      title: 'Update Clay Record',
      description: 'Update a record in a Clay table',
      inputSchema: {
        tableId: tableId(),
        recordId: recordId(),
        data: z
          .record(z.unknown())
          .describe('Key-value pairs of fieldId: value to update'),
      },
    },
    async ({ tableId, recordId, data }) => {
      try {
        const result = await client.updateRecord(
          tableId as TableId,
          recordId as RecordId,
          data as Record<string, unknown>
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
              text: `Error updating record: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_delete_records - Delete one or more records
   */
  server.registerTool(
    'clay_delete_records',
    {
      title: 'Delete Clay Records',
      description: 'Delete one or more records from a Clay table',
      inputSchema: {
        tableId: tableId(),
        recordIds: z
          .array(recordIdSchema)
          .describe('Array of record IDs (r_xxx format) to delete'),
      },
    },
    async ({ tableId, recordIds }) => {
      try {
        await client.deleteRecords(tableId as TableId, recordIds as RecordId[]);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { success: true, deletedCount: recordIds.length },
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
              text: `Error deleting records: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_search_records - Search for records
   */
  server.registerTool(
    'clay_search_records',
    {
      title: 'Search Clay Records',
      description: 'Search for records in a Clay table view',
      inputSchema: {
        tableId: tableId(),
        viewId: viewId(),
        searchTerm: z.string().describe('Search term to find'),
      },
    },
    async ({ tableId, viewId, searchTerm }) => {
      try {
        const results = await client.searchRecords(
          tableId as TableId,
          viewId as ViewId,
          searchTerm
        );
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
              text: `Error searching records: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_bulk_fetch_records - Fetch multiple records by ID
   */
  server.registerTool(
    'clay_bulk_fetch_records',
    {
      title: 'Bulk Fetch Clay Records',
      description: 'Fetch multiple records by their IDs',
      inputSchema: {
        tableId: tableId(),
        recordIds: z
          .array(recordIdSchema)
          .describe('Array of record IDs (r_xxx format) to fetch'),
      },
    },
    async ({ tableId, recordIds }) => {
      try {
        const results = await client.bulkFetchRecords(
          tableId as TableId,
          recordIds as RecordId[]
        );
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
              text: `Error fetching records: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

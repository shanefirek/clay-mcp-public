/**
 * Record Tools
 *
 * CRUD operations for Clay records.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { ClayClient } from '../client.js';
import type { TableId, ViewId, RecordId } from '../types/clay.js';
import { tableId, viewId, recordId, recordIdSchema, fieldIdSchema, viewIdSchema } from '../validation.js';

/**
 * Resolve a viewId: if provided, use it; otherwise fetch the table's first view.
 */
async function resolveViewId(
  client: ClayClient,
  tId: TableId,
  providedViewId?: string
): Promise<ViewId> {
  if (providedViewId) return providedViewId as ViewId;
  const tableData = (await client.getTable(tId)) as {
    table?: { views?: Array<{ id: string }> };
  };
  const views = tableData.table?.views;
  if (!views || views.length === 0) {
    throw new Error('Table has no views — cannot resolve default viewId');
  }
  return views[0].id as ViewId;
}

/**
 * Strip externalContent blobs from record cells (keep only status/error).
 */
function stripExternalContent(record: Record<string, unknown>): void {
  const cells = (record as { cells?: Record<string, unknown> }).cells;
  if (!cells) return;
  for (const cell of Object.values(cells) as Array<Record<string, unknown>>) {
    if (cell && cell.externalContent) {
      const ext = cell.externalContent as Record<string, unknown>;
      const compact: Record<string, unknown> = {};
      if (ext.status !== undefined) compact.status = ext.status;
      if (ext.error !== undefined) compact.error = ext.error;
      cell.externalContent = compact;
    }
  }
}

/**
 * Filter record cells to only include specified field IDs.
 */
function filterRecordFields(
  record: Record<string, unknown>,
  fields: string[]
): void {
  const cells = (record as { cells?: Record<string, unknown> }).cells;
  if (!cells) return;
  const filtered: Record<string, unknown> = {};
  for (const fid of fields) {
    if (fid in cells) {
      filtered[fid] = cells[fid];
    }
  }
  (record as { cells: unknown }).cells = filtered;
}

export function registerRecordTools(server: McpServer, client: ClayClient): void {
  /**
   * clay_list_records - List records in a table with pagination
   */
  server.registerTool(
    'clay_list_records',
    {
      title: 'List Clay Records',
      description:
        'List records in a Clay table with pagination. Resolves the default view automatically if viewId is omitted. Returns compact records by default (externalContent stripped).',
      inputSchema: {
        tableId: tableId(),
        viewId: viewIdSchema
          .optional()
          .describe('View ID (gv_xxx format). If omitted, uses the table\'s first/default view.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Number of records to return (default 10, max 100)'),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Number of records to skip (default 0)'),
        fields: z
          .array(fieldIdSchema)
          .optional()
          .describe('Only return these field IDs (f_xxx format). If omitted, returns all fields.'),
        includeExternalContent: z
          .boolean()
          .optional()
          .describe('Include full externalContent blobs (default: false).'),
      },
    },
    async ({ tableId: tId, viewId: vId, limit = 10, offset = 0, fields, includeExternalContent = false }) => {
      try {
        const resolvedViewId = await resolveViewId(client, tId as TableId, vId);
        const allIds = await client.getViewRecordIds(tId as TableId, resolvedViewId);
        const sliced = allIds.slice(offset, offset + limit);

        let records: unknown[] = [];
        if (sliced.length > 0) {
          const result = (await client.bulkFetchRecords(
            tId as TableId,
            sliced as RecordId[]
          )) as { results?: unknown[] };
          records = result.results || [];
        }

        // Apply field filtering and externalContent stripping
        for (const rec of records as Array<Record<string, unknown>>) {
          if (fields && fields.length > 0) filterRecordFields(rec, fields);
          if (!includeExternalContent) stripExternalContent(rec);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { totalRecords: allIds.length, returned: records.length, offset, records },
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
              text: `Error listing records: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

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
      description:
        'Get a single record by its ID. By default strips externalContent blobs to keep response compact. Use fields param to return only specific field values.',
      inputSchema: {
        tableId: tableId(),
        recordId: recordId(),
        fields: z
          .array(fieldIdSchema)
          .optional()
          .describe('Only return these field IDs from the record cells (f_xxx format). If omitted, returns all fields.'),
        includeExternalContent: z
          .boolean()
          .optional()
          .describe('Include full externalContent blobs in each cell (default: false). These can be very large for enrichment fields.'),
      },
    },
    async ({ tableId, recordId, fields, includeExternalContent = false }) => {
      try {
        const record = await client.getRecord(
          tableId as TableId,
          recordId as RecordId
        );

        // Filter to requested fields
        if (fields && fields.length > 0 && record.cells) {
          const filtered: Record<string, unknown> = {};
          for (const fid of fields) {
            if (fid in record.cells) {
              filtered[fid] = record.cells[fid as keyof typeof record.cells];
            }
          }
          record.cells = filtered as typeof record.cells;
        }

        // Strip externalContent by default
        if (!includeExternalContent && record.cells) {
          for (const cell of Object.values(record.cells) as unknown as Array<Record<string, unknown>>) {
            if (cell && cell.externalContent) {
              // Keep only status and error from externalContent
              const ext = cell.externalContent as Record<string, unknown>;
              const compact: Record<string, unknown> = {};
              if (ext.status !== undefined) compact.status = ext.status;
              if (ext.error !== undefined) compact.error = ext.error;
              cell.externalContent = compact;
            }
          }
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
      description:
        'Search for records in a Clay table view. If viewId is omitted, uses the table\'s default view.',
      inputSchema: {
        tableId: tableId(),
        viewId: viewIdSchema
          .optional()
          .describe('View ID (gv_xxx format). If omitted, uses the table\'s first/default view.'),
        searchTerm: z.string().describe('Search term to find'),
      },
    },
    async ({ tableId: tId, viewId: vId, searchTerm }) => {
      try {
        const resolvedViewId = await resolveViewId(client, tId as TableId, vId);
        const results = await client.searchRecords(
          tId as TableId,
          resolvedViewId,
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
      description:
        'Fetch multiple records by their IDs, or fetch from a view with pagination if recordIds is omitted.',
      inputSchema: {
        tableId: tableId(),
        recordIds: z
          .array(recordIdSchema)
          .optional()
          .describe('Array of record IDs (r_xxx format) to fetch. If omitted, fetches from the view.'),
        viewId: viewIdSchema
          .optional()
          .describe('View ID (gv_xxx format). Used when recordIds is omitted. Defaults to first view.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe('Max records when fetching from view (default 100, max 500). Ignored when recordIds is provided.'),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Records to skip when fetching from view (default 0). Ignored when recordIds is provided.'),
      },
    },
    async ({ tableId: tId, recordIds, viewId: vId, limit = 100, offset = 0 }) => {
      try {
        let ids: string[];
        if (recordIds && recordIds.length > 0) {
          ids = recordIds;
        } else {
          const resolvedViewId = await resolveViewId(client, tId as TableId, vId);
          const allIds = await client.getViewRecordIds(tId as TableId, resolvedViewId);
          ids = allIds.slice(offset, offset + limit);
        }

        if (ids.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ results: [] }, null, 2),
              },
            ],
          };
        }

        const results = await client.bulkFetchRecords(
          tId as TableId,
          ids as RecordId[]
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

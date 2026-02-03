/**
 * Table Resources
 *
 * Expose Clay tables as browsable MCP resources.
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ClayClient } from '../client.js';
import type { TableId } from '../types/clay.js';

export function registerTableResources(
  server: McpServer,
  client: ClayClient
): void {
  /**
   * Resource template for table schema
   * URI: clay://tables/{tableId}
   */
  server.registerResource(
    'table-schema',
    new ResourceTemplate('clay://tables/{tableId}', { list: undefined }),
    {
      title: 'Clay Table Schema',
      description:
        'Get the full schema for a Clay table including fields, views, and configuration',
      mimeType: 'application/json',
    },
    async (uri, { tableId }) => {
      try {
        const table = await client.getTable(tableId as TableId);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(table, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/plain',
              text: `Error fetching table: ${(error as Error).message}`,
            },
          ],
        };
      }
    }
  );

  /**
   * Resource template for table fields
   * URI: clay://tables/{tableId}/fields
   */
  server.registerResource(
    'table-fields',
    new ResourceTemplate('clay://tables/{tableId}/fields', { list: undefined }),
    {
      title: 'Clay Table Fields',
      description:
        'Get all field definitions for a Clay table (columns, formulas, enrichments)',
      mimeType: 'application/json',
    },
    async (uri, { tableId }) => {
      try {
        const fields = await client.getTableFields(tableId as TableId);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(fields, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/plain',
              text: `Error fetching fields: ${(error as Error).message}`,
            },
          ],
        };
      }
    }
  );

  /**
   * Resource template for table record count
   * URI: clay://tables/{tableId}/count
   */
  server.registerResource(
    'table-count',
    new ResourceTemplate('clay://tables/{tableId}/count', { list: undefined }),
    {
      title: 'Clay Table Count',
      description: 'Get the number of records in a Clay table',
      mimeType: 'application/json',
    },
    async (uri, { tableId }) => {
      try {
        const count = await client.getTableCount(tableId as TableId);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(count, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/plain',
              text: `Error fetching count: ${(error as Error).message}`,
            },
          ],
        };
      }
    }
  );
}

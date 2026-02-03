/**
 * Audit Tools
 *
 * Tools for snapshotting and comparing Clay table configurations.
 * Enables drift detection and config version control.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { ClayClient } from '../client.js';
import type { TableId, WorkspaceId } from '../types/clay.js';
import { tableId, workspaceId, nonEmptyString } from '../validation.js';

interface FieldSnapshot {
  id: string;
  name: string;
  type: string;
  typeSettings?: Record<string, unknown>;
}

interface ViewSnapshot {
  id: string;
  name: string;
  filter?: unknown;
  sort?: unknown;
}

interface TableSnapshot {
  id: string;
  name: string;
  type: string;
  fields: FieldSnapshot[];
  views: ViewSnapshot[];
  snapshotAt: string;
}

interface DiffResult {
  added: string[];
  removed: string[];
  modified: Array<{
    path: string;
    before: unknown;
    after: unknown;
  }>;
}

function createTableSnapshot(table: any): TableSnapshot {
  return {
    id: table.id,
    name: table.name,
    type: table.type,
    fields: (table.fields || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      typeSettings: f.typeSettings,
    })),
    views: (table.gridViews || table.views || []).map((v: any) => ({
      id: v.id,
      name: v.name,
      filter: v.filter,
      sort: v.sort,
    })),
    snapshotAt: new Date().toISOString(),
  };
}

function diffObjects(before: any, after: any, path = ''): DiffResult {
  const result: DiffResult = { added: [], removed: [], modified: [] };

  const beforeKeys = new Set(Object.keys(before || {}));
  const afterKeys = new Set(Object.keys(after || {}));

  // Find added keys
  for (const key of afterKeys) {
    if (!beforeKeys.has(key)) {
      result.added.push(path ? `${path}.${key}` : key);
    }
  }

  // Find removed keys
  for (const key of beforeKeys) {
    if (!afterKeys.has(key)) {
      result.removed.push(path ? `${path}.${key}` : key);
    }
  }

  // Find modified values
  for (const key of beforeKeys) {
    if (afterKeys.has(key)) {
      const beforeVal = before[key];
      const afterVal = after[key];
      const currentPath = path ? `${path}.${key}` : key;

      if (typeof beforeVal === 'object' && typeof afterVal === 'object' && beforeVal !== null && afterVal !== null) {
        if (Array.isArray(beforeVal) && Array.isArray(afterVal)) {
          // Compare arrays by stringifying (simple approach)
          if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
            result.modified.push({ path: currentPath, before: beforeVal, after: afterVal });
          }
        } else {
          // Recurse into objects
          const nested = diffObjects(beforeVal, afterVal, currentPath);
          result.added.push(...nested.added);
          result.removed.push(...nested.removed);
          result.modified.push(...nested.modified);
        }
      } else if (beforeVal !== afterVal) {
        result.modified.push({ path: currentPath, before: beforeVal, after: afterVal });
      }
    }
  }

  return result;
}

function diffSnapshots(before: TableSnapshot, after: TableSnapshot): {
  fields: { added: string[]; removed: string[]; modified: string[] };
  views: { added: string[]; removed: string[]; modified: string[] };
  configChanges: DiffResult['modified'];
} {
  // Diff fields
  const beforeFields = new Map(before.fields.map(f => [f.id, f]));
  const afterFields = new Map(after.fields.map(f => [f.id, f]));

  const fieldDiff = {
    added: [] as string[],
    removed: [] as string[],
    modified: [] as string[],
  };

  for (const [id, field] of afterFields) {
    if (!beforeFields.has(id)) {
      fieldDiff.added.push(`${field.name} (${field.type})`);
    } else {
      const beforeField = beforeFields.get(id)!;
      if (JSON.stringify(beforeField.typeSettings) !== JSON.stringify(field.typeSettings)) {
        fieldDiff.modified.push(`${field.name}: config changed`);
      }
      if (beforeField.name !== field.name) {
        fieldDiff.modified.push(`${beforeField.name} → ${field.name}`);
      }
    }
  }

  for (const [id, field] of beforeFields) {
    if (!afterFields.has(id)) {
      fieldDiff.removed.push(`${field.name} (${field.type})`);
    }
  }

  // Diff views
  const beforeViews = new Map(before.views.map(v => [v.id, v]));
  const afterViews = new Map(after.views.map(v => [v.id, v]));

  const viewDiff = {
    added: [] as string[],
    removed: [] as string[],
    modified: [] as string[],
  };

  for (const [id, view] of afterViews) {
    if (!beforeViews.has(id)) {
      viewDiff.added.push(view.name);
    } else {
      const beforeView = beforeViews.get(id)!;
      if (JSON.stringify(beforeView.filter) !== JSON.stringify(view.filter) ||
          JSON.stringify(beforeView.sort) !== JSON.stringify(view.sort)) {
        viewDiff.modified.push(`${view.name}: filter/sort changed`);
      }
      if (beforeView.name !== view.name) {
        viewDiff.modified.push(`${beforeView.name} → ${view.name}`);
      }
    }
  }

  for (const [id, view] of beforeViews) {
    if (!afterViews.has(id)) {
      viewDiff.removed.push(view.name);
    }
  }

  // Config changes
  const configChanges: DiffResult['modified'] = [];
  if (before.name !== after.name) {
    configChanges.push({ path: 'name', before: before.name, after: after.name });
  }
  if (before.type !== after.type) {
    configChanges.push({ path: 'type', before: before.type, after: after.type });
  }

  return { fields: fieldDiff, views: viewDiff, configChanges };
}

export function registerAuditTools(server: McpServer, client: ClayClient): void {
  /**
   * clay_snapshot_table - Create a snapshot of table configuration
   */
  server.registerTool(
    'clay_snapshot_table',
    {
      title: 'Snapshot Table Config',
      description:
        'Create a snapshot of a table\'s configuration (fields, views, settings). Use for version control and drift detection.',
      inputSchema: {
        tableId: tableId(),
      },
    },
    async ({ tableId: tblId }) => {
      try {
        const response = await client.getTable(tblId as TableId);
        // Handle wrapped response { table: {...} } or direct table object
        const table = (response as any).table || response;
        const snapshot = createTableSnapshot(table);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(snapshot, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error creating snapshot: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_compare_snapshots - Compare two table snapshots
   */
  server.registerTool(
    'clay_compare_snapshots',
    {
      title: 'Compare Table Snapshots',
      description:
        'Compare two table snapshots to see what changed. Detects added/removed/modified fields and views.',
      inputSchema: {
        before: z.string().describe('JSON string of the "before" snapshot'),
        after: z.string().describe('JSON string of the "after" snapshot'),
      },
    },
    async ({ before, after }) => {
      try {
        const beforeSnapshot: TableSnapshot = JSON.parse(before);
        const afterSnapshot: TableSnapshot = JSON.parse(after);

        const diff = diffSnapshots(beforeSnapshot, afterSnapshot);

        const hasChanges =
          diff.fields.added.length > 0 ||
          diff.fields.removed.length > 0 ||
          diff.fields.modified.length > 0 ||
          diff.views.added.length > 0 ||
          diff.views.removed.length > 0 ||
          diff.views.modified.length > 0 ||
          diff.configChanges.length > 0;

        let report = `# Table Drift Report\n\n`;
        report += `**Table:** ${afterSnapshot.name} (${afterSnapshot.id})\n`;
        report += `**Before:** ${beforeSnapshot.snapshotAt}\n`;
        report += `**After:** ${afterSnapshot.snapshotAt}\n\n`;

        if (!hasChanges) {
          report += `✅ **No drift detected** - configuration matches.\n`;
        } else {
          report += `⚠️ **Drift detected:**\n\n`;

          if (diff.fields.added.length > 0) {
            report += `### Fields Added\n`;
            diff.fields.added.forEach(f => report += `- ➕ ${f}\n`);
            report += '\n';
          }

          if (diff.fields.removed.length > 0) {
            report += `### Fields Removed\n`;
            diff.fields.removed.forEach(f => report += `- ➖ ${f}\n`);
            report += '\n';
          }

          if (diff.fields.modified.length > 0) {
            report += `### Fields Modified\n`;
            diff.fields.modified.forEach(f => report += `- ✏️ ${f}\n`);
            report += '\n';
          }

          if (diff.views.added.length > 0) {
            report += `### Views Added\n`;
            diff.views.added.forEach(v => report += `- ➕ ${v}\n`);
            report += '\n';
          }

          if (diff.views.removed.length > 0) {
            report += `### Views Removed\n`;
            diff.views.removed.forEach(v => report += `- ➖ ${v}\n`);
            report += '\n';
          }

          if (diff.views.modified.length > 0) {
            report += `### Views Modified\n`;
            diff.views.modified.forEach(v => report += `- ✏️ ${v}\n`);
            report += '\n';
          }

          if (diff.configChanges.length > 0) {
            report += `### Config Changes\n`;
            diff.configChanges.forEach(c => report += `- ${c.path}: "${c.before}" → "${c.after}"\n`);
            report += '\n';
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: report,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error comparing snapshots: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_check_table_drift - Compare current table state against a baseline
   */
  server.registerTool(
    'clay_check_table_drift',
    {
      title: 'Check Table Drift',
      description:
        'Compare current table configuration against a saved baseline snapshot. Detects unauthorized or accidental changes.',
      inputSchema: {
        tableId: tableId(),
        baseline: z.string().describe('JSON string of the baseline snapshot to compare against'),
      },
    },
    async ({ tableId: tblId, baseline }) => {
      try {
        const response = await client.getTable(tblId as TableId);
        const table = (response as any).table || response;
        const currentSnapshot = createTableSnapshot(table);
        const baselineSnapshot: TableSnapshot = JSON.parse(baseline);

        const diff = diffSnapshots(baselineSnapshot, currentSnapshot);

        const hasChanges =
          diff.fields.added.length > 0 ||
          diff.fields.removed.length > 0 ||
          diff.fields.modified.length > 0 ||
          diff.views.added.length > 0 ||
          diff.views.removed.length > 0 ||
          diff.views.modified.length > 0 ||
          diff.configChanges.length > 0;

        let report = `# Drift Check: ${currentSnapshot.name}\n\n`;
        report += `**Baseline:** ${baselineSnapshot.snapshotAt}\n`;
        report += `**Current:** ${currentSnapshot.snapshotAt}\n\n`;

        if (!hasChanges) {
          report += `✅ **COMPLIANT** - Table matches baseline configuration.\n`;
        } else {
          report += `🚨 **DRIFT DETECTED** - Table has deviated from baseline:\n\n`;

          const changes: string[] = [];
          if (diff.fields.added.length > 0) changes.push(`${diff.fields.added.length} field(s) added`);
          if (diff.fields.removed.length > 0) changes.push(`${diff.fields.removed.length} field(s) removed`);
          if (diff.fields.modified.length > 0) changes.push(`${diff.fields.modified.length} field(s) modified`);
          if (diff.views.added.length > 0) changes.push(`${diff.views.added.length} view(s) added`);
          if (diff.views.removed.length > 0) changes.push(`${diff.views.removed.length} view(s) removed`);
          if (diff.views.modified.length > 0) changes.push(`${diff.views.modified.length} view(s) modified`);

          report += `**Summary:** ${changes.join(', ')}\n\n`;

          report += `### Details\n\n`;
          [...diff.fields.added].forEach(f => report += `- ➕ Field added: ${f}\n`);
          [...diff.fields.removed].forEach(f => report += `- ➖ Field removed: ${f}\n`);
          [...diff.fields.modified].forEach(f => report += `- ✏️ Field changed: ${f}\n`);
          [...diff.views.added].forEach(v => report += `- ➕ View added: ${v}\n`);
          [...diff.views.removed].forEach(v => report += `- ➖ View removed: ${v}\n`);
          [...diff.views.modified].forEach(v => report += `- ✏️ View changed: ${v}\n`);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: report,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error checking drift: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_snapshot_workspace - Snapshot all tables in a workspace
   */
  server.registerTool(
    'clay_snapshot_workspace',
    {
      title: 'Snapshot Workspace',
      description:
        'Create snapshots of all tables in a workspace. Returns a JSON object mapping table IDs to their snapshots.',
      inputSchema: {
        workspaceId: workspaceId(),
      },
    },
    async ({ workspaceId: wsId }) => {
      try {
        const tables = await client.listTables(wsId as WorkspaceId);
        const snapshots: Record<string, TableSnapshot> = {};

        for (const tableSummary of tables as any[]) {
          try {
            const response = await client.getTable(tableSummary.id as TableId);
            const table = (response as any).table || response;
            snapshots[tableSummary.id] = createTableSnapshot(table);
          } catch (e) {
            // Skip tables we can't access
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                workspaceId: wsId,
                snapshotAt: new Date().toISOString(),
                tableCount: Object.keys(snapshots).length,
                tables: snapshots,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error snapshotting workspace: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

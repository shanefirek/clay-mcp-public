/**
 * Resource Registry
 *
 * Exports all resource registration functions.
 * Resources expose Clay data as browsable content.
 */

export { registerTableResources } from './tables.js';
export { registerWorkspaceResources } from './workspaces.js';

/**
 * Resource Summary:
 *
 * Tables:
 *   - clay://tables/{tableId} - Table schema
 *   - clay://tables/{tableId}/fields - Field definitions
 *
 * Workspaces:
 *   - clay://workspaces - List all workspaces
 *   - clay://workspaces/{id} - Workspace details
 *
 * Enrichments:
 *   - clay://enrichments - Provider registry
 */

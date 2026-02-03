/**
 * Tool Registry
 *
 * Exports all tool registration functions.
 * Tools are grouped by domain for better organization.
 */

export { registerTableTools } from './tables.js';
export { registerRecordTools } from './records.js';
export { registerFieldTools } from './fields.js';
export { registerEnrichmentTools } from './enrichments.js';
export { registerDiscoveryTools } from './discovery.js';
export { registerRegistryTools } from './registry.js';

/**
 * Tool Summary (17 tools total):
 *
 * Tables (2):
 *   - clay_list_tables: List all tables in workspace
 *   - clay_get_table: Get table schema with all fields
 *
 * Records (5):
 *   - clay_create_record: Create a new record
 *   - clay_update_record: Update an existing record
 *   - clay_delete_records: Delete one or more records
 *   - clay_search_records: Search records in a table
 *   - clay_bulk_fetch_records: Fetch multiple records by ID
 *
 * Fields (2):
 *   - clay_create_formula_field: Create a formula column
 *   - clay_create_ai_field: Create AI/Claygent column
 *
 * Enrichments (4):
 *   - clay_run_enrichment: Run enrichments on records
 *   - clay_create_waterfall_field: Create waterfall enrichment
 *   - clay_list_enrichments: List available enrichments from registry
 *   - clay_create_enrichment: Create enrichment field by name
 *
 * Discovery (1):
 *   - clay_list_available_actions: Discover enrichment providers
 *
 * Registry (3):
 *   - clay_add_enrichment_provider: Add provider to registry
 *   - clay_get_registry: Get full registry
 *   - clay_get_providers_by_category: Get providers by category
 */

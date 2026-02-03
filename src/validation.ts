/**
 * Input Validation for Clay MCP
 *
 * Provides Zod schemas and utilities for validating Clay IDs and inputs.
 */

import { z } from 'zod';

// ==================== ID PATTERNS ====================

/** Table ID: t_xxx format */
export const tableIdSchema = z
  .string()
  .regex(/^t_[a-zA-Z0-9]+$/, 'Table ID must be in t_xxx format (e.g., t_abc123)');

/** Field ID: f_xxx format */
export const fieldIdSchema = z
  .string()
  .regex(/^f_[a-zA-Z0-9]+$/, 'Field ID must be in f_xxx format (e.g., f_abc123)');

/** View ID: gv_xxx format */
export const viewIdSchema = z
  .string()
  .regex(/^gv_[a-zA-Z0-9]+$/, 'View ID must be in gv_xxx format (e.g., gv_abc123)');

/** Record ID: r_xxx format */
export const recordIdSchema = z
  .string()
  .regex(/^r_[a-zA-Z0-9]+$/, 'Record ID must be in r_xxx format (e.g., r_abc123)');

/** Workbook ID: wb_xxx format */
export const workbookIdSchema = z
  .string()
  .regex(/^wb_[a-zA-Z0-9]+$/, 'Workbook ID must be in wb_xxx format (e.g., wb_abc123)');

/** Workspace ID: numeric string */
export const workspaceIdSchema = z
  .string()
  .regex(/^\d+$/, 'Workspace ID must be numeric (e.g., 12345)');

/** Auth Account ID: aa_xxx format */
export const authAccountIdSchema = z
  .string()
  .regex(/^aa_[a-zA-Z0-9]+$/, 'Auth Account ID must be in aa_xxx format (e.g., aa_abc123)');

/** Source ID: s_xxx format */
export const sourceIdSchema = z
  .string()
  .regex(/^s_[a-zA-Z0-9]+$/, 'Source ID must be in s_xxx format (e.g., s_abc123)');

// ==================== COMMON SCHEMAS ====================

/** Non-empty string */
export const nonEmptyString = z.string().min(1, 'Cannot be empty');

/** Email address */
export const emailSchema = z.string().email('Must be a valid email address');

/** URL */
export const urlSchema = z.string().url('Must be a valid URL');

/** Domain (e.g., example.com) */
export const domainSchema = z
  .string()
  .regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/, 'Must be a valid domain (e.g., example.com)');

// ==================== VALIDATION HELPERS ====================

/**
 * Validate a table ID
 */
export function isValidTableId(id: string): boolean {
  return /^t_[a-zA-Z0-9]+$/.test(id);
}

/**
 * Validate a field ID
 */
export function isValidFieldId(id: string): boolean {
  return /^f_[a-zA-Z0-9]+$/.test(id);
}

/**
 * Validate a view ID
 */
export function isValidViewId(id: string): boolean {
  return /^gv_[a-zA-Z0-9]+$/.test(id);
}

/**
 * Validate a record ID
 */
export function isValidRecordId(id: string): boolean {
  return /^r_[a-zA-Z0-9]+$/.test(id);
}

/**
 * Validate a workspace ID
 */
export function isValidWorkspaceId(id: string): boolean {
  return /^\d+$/.test(id);
}

/**
 * Validate input and throw descriptive error if invalid
 */
export function validateInput<T>(schema: z.ZodSchema<T>, input: unknown, context?: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`Invalid input${context ? ` for ${context}` : ''}: ${errors}`);
  }
  return result.data;
}

// ==================== SCHEMA BUILDERS ====================

/**
 * Create a table ID schema with description
 */
export function tableId(description = 'Table ID (t_xxx format)') {
  return tableIdSchema.describe(description);
}

/**
 * Create a field ID schema with description
 */
export function fieldId(description = 'Field ID (f_xxx format)') {
  return fieldIdSchema.describe(description);
}

/**
 * Create a view ID schema with description
 */
export function viewId(description = 'View ID (gv_xxx format)') {
  return viewIdSchema.describe(description);
}

/**
 * Create a record ID schema with description
 */
export function recordId(description = 'Record ID (r_xxx format)') {
  return recordIdSchema.describe(description);
}

/**
 * Create a workspace ID schema with description
 */
export function workspaceId(description = 'Workspace ID (numeric)') {
  return workspaceIdSchema.describe(description);
}

/**
 * Create a workbook ID schema with description
 */
export function workbookId(description = 'Workbook ID (wb_xxx format)') {
  return workbookIdSchema.describe(description);
}

/**
 * Create an auth account ID schema with description
 */
export function authAccountId(description = 'Auth Account ID (aa_xxx format)') {
  return authAccountIdSchema.describe(description);
}

/**
 * Create a source ID schema with description
 */
export function sourceId(description = 'Source ID (s_xxx format)') {
  return sourceIdSchema.describe(description);
}

/**
 * Enrichment Provider Types
 *
 * Type definitions for the enrichment registry system.
 */

export { EnrichmentProvider, EnrichmentRegistry } from '../enrichments/index.js';

/**
 * Enrichment category types
 */
export type EnrichmentCategory =
  | 'email-finders'
  | 'crm'
  | 'ai'
  | 'core'
  | 'data'
  | 'social'
  | 'company'
  | 'person'
  | string; // Allow custom categories

/**
 * Common input field types used across enrichments
 */
export interface CommonInputFields {
  firstName?: string;
  lastName?: string;
  email?: string;
  domain?: string;
  companyName?: string;
  companyDomain?: string;
  linkedinUrl?: string;
  title?: string;
  location?: string;
}

/**
 * Waterfall result structure
 */
export interface WaterfallResult {
  value: unknown;
  source: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

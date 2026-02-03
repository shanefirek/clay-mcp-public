/**
 * Enrichment Provider Registry
 *
 * Manages the local registry of known enrichment providers.
 * Providers are stored in registry.json and can be extended at runtime.
 */

import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REGISTRY_PATH = join(__dirname, 'registry.json');

/**
 * Enrichment provider definition
 */
export interface EnrichmentProviderInput {
  name: string;
  required?: boolean;
  type?: string;
  semanticType?: string | null;
}

export interface EnrichmentProvider {
  actionKey: string;
  actionPackageId: string;
  displayName?: string;
  description?: string;
  inputs?: EnrichmentProviderInput[]; // Detailed input definitions from registry
  inputFields?: string[]; // Legacy: simple list of input names
  outputFields?: string[];
  outputs?: string[]; // Alternative to outputFields
  appAccountTypeId?: string; // Clay's account type identifier (e.g., "hunter", "findymail")
  authAccountId?: string | null; // null = no auth needed, string = specific account, undefined = needs lookup
  clayManagedAccountId?: string | null; // Clay-provided API account (uses Clay credits)
  authType?: string; // Type of auth required (e.g., "findymail", "crunchbase")
  credits?: number | null; // Credit cost per run
}

/**
 * Result of resolving which auth account to use
 */
export interface ResolvedAuthAccount {
  accountId: string | null;
  source: 'env' | 'explicit' | 'clay-managed' | 'none';
  usesClayCredits: boolean;
}

/**
 * Resolve which auth account ID to use for a provider.
 *
 * Priority order:
 * 1. Explicit authAccountId parameter (passed by caller)
 * 2. Environment variable: CLAY_{TYPE}_ACCOUNT_ID (e.g., CLAY_HUNTER_ACCOUNT_ID)
 * 3. Clay-managed account (uses Clay credits)
 * 4. null (no auth)
 */
export function resolveAuthAccount(
  provider: EnrichmentProvider,
  options?: {
    explicitAccountId?: string | null;
    useOwnAccount?: boolean;
  }
): ResolvedAuthAccount {
  // 1. Explicit override takes priority
  if (options?.explicitAccountId) {
    return {
      accountId: options.explicitAccountId,
      source: 'explicit',
      usesClayCredits: false,
    };
  }

  // 2. Check environment variable
  if (provider.appAccountTypeId) {
    // Convert "hunter" to "CLAY_HUNTER_ACCOUNT_ID"
    const envKey = `CLAY_${provider.appAccountTypeId.toUpperCase().replace(/-/g, '_')}_ACCOUNT_ID`;
    const envValue = process.env[envKey];
    if (envValue) {
      return {
        accountId: envValue,
        source: 'env',
        usesClayCredits: false,
      };
    }
  }

  // 3. If useOwnAccount requested but no env var, use provider's authAccountId
  if (options?.useOwnAccount && provider.authAccountId) {
    return {
      accountId: provider.authAccountId,
      source: 'explicit',
      usesClayCredits: false,
    };
  }

  // 4. Default to Clay-managed account (Clay credits)
  if (provider.clayManagedAccountId) {
    return {
      accountId: provider.clayManagedAccountId,
      source: 'clay-managed',
      usesClayCredits: true,
    };
  }

  // 5. No auth available
  return {
    accountId: null,
    source: 'none',
    usesClayCredits: false,
  };
}

/**
 * Registry structure: category -> name -> provider
 */
export interface EnrichmentRegistry {
  [category: string]: {
    [name: string]: EnrichmentProvider;
  };
}

// In-memory cache
let registryCache: EnrichmentRegistry | null = null;

/**
 * Load the registry from disk
 */
export async function loadRegistry(): Promise<EnrichmentRegistry> {
  if (registryCache) {
    return registryCache;
  }

  try {
    const content = await readFile(REGISTRY_PATH, 'utf-8');
    registryCache = JSON.parse(content) as EnrichmentRegistry;
    return registryCache;
  } catch (error) {
    // If file doesn't exist, return empty registry
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      registryCache = {};
      return registryCache;
    }
    throw error;
  }
}

/**
 * Save the registry to disk
 */
export async function saveRegistry(registry: EnrichmentRegistry): Promise<void> {
  await writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  registryCache = registry;
}

/**
 * Get the full registry
 */
export async function getRegistry(): Promise<EnrichmentRegistry> {
  return loadRegistry();
}

/**
 * Get providers by category
 */
export async function getProvidersByCategory(
  category: string
): Promise<Record<string, EnrichmentProvider>> {
  const registry = await loadRegistry();
  return registry[category] || {};
}

/**
 * Get a specific provider
 */
export async function getProvider(
  category: string,
  name: string
): Promise<EnrichmentProvider | null> {
  const registry = await loadRegistry();
  return registry[category]?.[name] || null;
}

/**
 * Add or update a provider
 */
export async function addProvider(
  category: string,
  name: string,
  provider: EnrichmentProvider
): Promise<void> {
  const registry = await loadRegistry();

  if (!registry[category]) {
    registry[category] = {};
  }

  registry[category][name] = provider;
  await saveRegistry(registry);
}

/**
 * Remove a provider
 */
export async function removeProvider(
  category: string,
  name: string
): Promise<boolean> {
  const registry = await loadRegistry();

  if (registry[category]?.[name]) {
    delete registry[category][name];
    // Clean up empty category
    if (Object.keys(registry[category]).length === 0) {
      delete registry[category];
    }
    await saveRegistry(registry);
    return true;
  }

  return false;
}

/**
 * List all categories
 */
export async function listCategories(): Promise<string[]> {
  const registry = await loadRegistry();
  return Object.keys(registry);
}

/**
 * Search providers by actionKey or name
 */
export async function searchProviders(
  query: string
): Promise<Array<{ category: string; name: string; provider: EnrichmentProvider }>> {
  const registry = await loadRegistry();
  const results: Array<{
    category: string;
    name: string;
    provider: EnrichmentProvider;
  }> = [];
  const lowerQuery = query.toLowerCase();

  for (const [category, providers] of Object.entries(registry)) {
    for (const [name, provider] of Object.entries(providers)) {
      if (
        name.toLowerCase().includes(lowerQuery) ||
        provider.actionKey.toLowerCase().includes(lowerQuery) ||
        provider.displayName?.toLowerCase().includes(lowerQuery)
      ) {
        results.push({ category, name, provider });
      }
    }
  }

  return results;
}

/**
 * Find a provider by name (exact match, searches all categories)
 */
export async function findProviderByName(
  name: string
): Promise<{ category: string; name: string; provider: EnrichmentProvider } | null> {
  const registry = await loadRegistry();
  const lowerName = name.toLowerCase();

  for (const [category, providers] of Object.entries(registry)) {
    for (const [providerName, provider] of Object.entries(providers)) {
      if (providerName.toLowerCase() === lowerName) {
        return { category, name: providerName, provider };
      }
    }
  }

  return null;
}

/**
 * Get all providers as a flat list
 */
export async function getAllProviders(): Promise<
  Array<{ category: string; name: string; provider: EnrichmentProvider }>
> {
  const registry = await loadRegistry();
  const results: Array<{
    category: string;
    name: string;
    provider: EnrichmentProvider;
  }> = [];

  for (const [category, providers] of Object.entries(registry)) {
    for (const [name, provider] of Object.entries(providers)) {
      results.push({ category, name, provider });
    }
  }

  return results;
}

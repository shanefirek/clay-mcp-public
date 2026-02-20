/**
 * Registry Tools
 *
 * Tools for managing the local enrichment provider registry.
 * Enables Claude to discover new providers and persist them.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { ClayClient } from '../client.js';
import {
  getRegistry,
  addProvider,
  getProvidersByCategory,
  EnrichmentProvider,
} from '../enrichments/index.js';
import { nonEmptyString } from '../validation.js';

// Semantic type to common field name mappings for auto-mapping
const SEMANTIC_TYPE_HINTS: Record<string, string[]> = {
  'full-name': ['name', 'full_name', 'fullName', 'person_name', 'contact_name'],
  'first-name': ['first_name', 'firstName', 'fname', 'given_name'],
  'last-name': ['last_name', 'lastName', 'lname', 'family_name', 'surname'],
  'work-email': ['email', 'work_email', 'workEmail', 'business_email', 'corporate_email'],
  'personal-email': ['personal_email', 'personalEmail', 'private_email'],
  'company-domain': ['domain', 'company_domain', 'companyDomain', 'website', 'url'],
  'company-name': ['company', 'company_name', 'companyName', 'organization', 'org'],
  'person-linkedin-url': ['linkedin_url', 'linkedinUrl', 'linkedin', 'li_url', 'linkedin_profile'],
  'company-linkedin-url': ['company_linkedin', 'company_linkedin_url', 'org_linkedin'],
  'job-title': ['title', 'job_title', 'jobTitle', 'role', 'position'],
};

export function registerRegistryTools(
  server: McpServer,
  _client: ClayClient
): void {
  /**
   * clay_add_enrichment_provider - Add a provider to the local registry
   */
  server.registerTool(
    'clay_add_enrichment_provider',
    {
      title: 'Add Enrichment Provider',
      description:
        'Add a new enrichment provider to the local registry. Use clay_list_available_actions to discover providers from the API, then persist useful ones here.',
      inputSchema: {
        category: nonEmptyString.describe(
          'Category for the provider (e.g., "email-finders", "crm", "ai", "data")'
        ),
        name: nonEmptyString.describe('Short name for the provider (e.g., "leadmagic")'),
        actionKey: nonEmptyString.describe('Action key from the API (e.g., "leadmagic-find-work-email")'),
        actionPackageId: nonEmptyString.describe('Action package ID (UUID format)'),
        displayName: z
          .string()
          .optional()
          .describe('Human-readable display name'),
        description: z.string().optional().describe('Description of what this provider does'),
        inputFields: z
          .array(z.string())
          .optional()
          .describe('List of input field names this provider accepts'),
        outputFields: z
          .array(z.string())
          .optional()
          .describe('List of output field names this provider returns'),
      },
    },
    async ({
      category,
      name,
      actionKey,
      actionPackageId,
      displayName,
      description,
      inputFields,
      outputFields,
    }) => {
      try {
        const provider: EnrichmentProvider = {
          actionKey,
          actionPackageId,
          displayName,
          description,
          inputFields,
          outputFields,
        };

        await addProvider(category, name, provider);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  message: `Added provider "${name}" to category "${category}"`,
                  provider,
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
              text: `Error adding provider: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_get_registry - Get the enrichment provider registry (summary or filtered by category)
   */
  server.registerTool(
    'clay_get_registry',
    {
      title: 'Get Enrichment Registry',
      description:
        'Get the enrichment provider registry. Without a category filter, returns a compact summary (category names, action counts, and action keys). With a category filter, returns full details for that category. Use clay_get_action_schema for full details on a specific action.',
      inputSchema: {
        category: z
          .string()
          .optional()
          .describe(
            'Optional category to filter by (e.g., "email-finders", "crm"). If omitted, returns a summary of all categories with action keys.'
          ),
      },
    },
    async ({ category }) => {
      try {
        const registry = await getRegistry();

        // If category specified, return full details for that category
        if (category) {
          const providers = registry[category];
          if (!providers) {
            const categories = Object.keys(registry).filter(
              (k) => k !== '_meta'
            );
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Category "${category}" not found. Available categories: ${categories.join(', ')}`,
                },
              ],
              isError: true,
            };
          }
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ [category]: providers }, null, 2),
              },
            ],
          };
        }

        // Return compact summary: category -> { count, actionKeys[] }
        const summary: Record<
          string,
          { count: number; actions: string[] }
        > = {};
        let totalActions = 0;
        for (const [cat, providers] of Object.entries(registry)) {
          if (cat === '_meta') continue;
          const actionKeys = Object.keys(
            providers as Record<string, unknown>
          );
          summary[cat] = {
            count: actionKeys.length,
            actions: actionKeys,
          };
          totalActions += actionKeys.length;
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  _meta: {
                    totalCategories: Object.keys(summary).length,
                    totalActions,
                    hint: 'Use category parameter to get full details for a category, or clay_get_action_schema for a specific action.',
                  },
                  categories: summary,
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
              text: `Error getting registry: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_get_action_schema - Get full schema for an action
   */
  server.registerTool(
    'clay_get_action_schema',
    {
      title: 'Get Action Schema',
      description:
        'Get the full input/output schema for an enrichment action. Shows required fields, types, semantic types, and suggested field mappings.',
      inputSchema: {
        actionKey: nonEmptyString.describe('Action key (e.g., "leadmagic-find-work-email", "apollo-enrich-person")'),
      },
    },
    async ({ actionKey }) => {
      try {
        const registry = await getRegistry();

        // Search all categories for the action
        let found: { category: string; provider: any } | null = null;
        for (const [category, providers] of Object.entries(registry)) {
          if (category === '_meta') continue;
          if (providers[actionKey]) {
            found = { category, provider: providers[actionKey] };
            break;
          }
        }

        if (!found) {
          // Try partial match
          for (const [category, providers] of Object.entries(registry)) {
            if (category === '_meta') continue;
            for (const [key, provider] of Object.entries(providers as Record<string, any>)) {
              if (key.includes(actionKey) || actionKey.includes(key)) {
                found = { category, provider: { ...provider, actionKey: key } };
                break;
              }
            }
            if (found) break;
          }
        }

        if (!found) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Action "${actionKey}" not found in registry. Use clay_get_registry to see available actions.`,
              },
            ],
            isError: true,
          };
        }

        const { category, provider } = found;

        // Build detailed schema with suggestions
        const inputsWithHints = (provider.inputs || []).map((input: any) => ({
          ...input,
          suggestedFieldNames: input.semanticType
            ? SEMANTIC_TYPE_HINTS[input.semanticType] || []
            : [],
        }));

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  actionKey: provider.actionKey,
                  category,
                  displayName: provider.displayName,
                  description: provider.description,
                  credits: provider.credits,
                  authType: provider.authType,
                  inputs: inputsWithHints,
                  outputs: provider.outputs,
                  usage: {
                    example: `clay_create_enrichment with inputMapping: { ${inputsWithHints
                      .filter((i: any) => i.required)
                      .map((i: any) => `"${i.name}": "f_your_field_id"`)
                      .join(', ')} }`,
                  },
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
              text: `Error getting action schema: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_get_providers_by_category - Get providers for a specific category
   */
  server.registerTool(
    'clay_get_providers_by_category',
    {
      title: 'Get Providers by Category',
      description:
        'Get all providers in a specific category (e.g., "email-finders")',
      inputSchema: {
        category: nonEmptyString.describe(
          'Category to look up (e.g., "email-finders", "crm", "ai", "data")'
        ),
      },
    },
    async ({ category }) => {
      try {
        const providers = await getProvidersByCategory(category);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(providers, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error getting providers: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

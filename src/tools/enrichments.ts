/**
 * Enrichment Tools
 *
 * Tools for running enrichments and creating waterfall fields.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { ClayClient } from '../client.js';
import type { TableId, FieldId, RecordId, ActionConfig } from '../types/clay.js';
import { getAllProviders, findProviderByName, getProvidersByCategory, resolveAuthAccount } from '../enrichments/index.js';
import { tableId, fieldId, fieldIdSchema, recordIdSchema, nonEmptyString, authAccountId } from '../validation.js';

export function registerEnrichmentTools(
  server: McpServer,
  client: ClayClient
): void {
  /**
   * clay_run_enrichment - Run enrichments on specific records
   */
  server.registerTool(
    'clay_run_enrichment',
    {
      title: 'Run Clay Enrichment',
      description:
        'Run enrichments on specific records and fields. This triggers the enrichment pipeline for the specified field(s) on the specified record(s).',
      inputSchema: {
        tableId: tableId(),
        fieldIds: z
          .array(fieldIdSchema)
          .describe('Field IDs (f_xxx format) to run enrichment on'),
        recordIds: z
          .array(recordIdSchema)
          .describe('Record IDs (r_xxx format) to enrich'),
        forceRun: z
          .boolean()
          .optional()
          .describe('Force re-run even if data already exists. Default: false'),
      },
    },
    async ({ tableId, fieldIds, recordIds, forceRun }) => {
      try {
        const result = await client.runEnrichment(
          tableId as TableId,
          fieldIds as FieldId[],
          recordIds as RecordId[],
          forceRun ?? false
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
              text: `Error running enrichment: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_create_waterfall_field - Create a waterfall enrichment column
   */
  server.registerTool(
    'clay_create_waterfall_field',
    {
      title: 'Create Waterfall Field',
      description:
        'Create a waterfall enrichment column with multiple data providers. Providers are tried in order until one succeeds.',
      inputSchema: {
        tableId: tableId(),
        name: nonEmptyString.describe('Column name'),
        waterfallConfigs: z
          .array(
            z.object({
              actionKey: z
                .string()
                .describe('Action key (e.g., "leadmagic-find-work-email")'),
              actionPackageId: z
                .string()
                .describe('Action package ID (UUID format)'),
              inputsBinding: z
                .array(
                  z.object({
                    name: z.string().describe('Input parameter name'),
                    formulaText: z
                      .string()
                      .describe(
                        'Formula for input value (e.g., "{{f_fieldId}}?.property")'
                      ),
                  })
                )
                .describe('Input bindings for the enrichment'),
              attributePath: z
                .string()
                .describe(
                  'Path to the output attribute (e.g., "email", "domain")'
                ),
              name: z.string().describe('Display name for this provider step'),
            })
          )
          .describe('Array of enrichment providers to try in order'),
        runMode: z
          .enum(['DONT_RUN', 'RUN_ALL', 'RUN_SAMPLE'])
          .optional()
          .describe(
            'When to run: DONT_RUN (manual), RUN_ALL (all records), RUN_SAMPLE (sample records). Default: DONT_RUN'
          ),
      },
    },
    async ({ tableId, name, waterfallConfigs, runMode }) => {
      try {
        const field = await client.createWaterfallField(
          tableId as TableId,
          name,
          waterfallConfigs as ActionConfig[],
          runMode ?? 'DONT_RUN'
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(field, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error creating waterfall field: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_wait_for_enrichment - Wait for enrichment to complete
   */
  server.registerTool(
    'clay_wait_for_enrichment',
    {
      title: 'Wait for Enrichment',
      description:
        'Wait for enrichment to complete on specific records and fields. Polls until all cells have SUCCESS/FAILED status or timeout. Returns enriched values.',
      inputSchema: {
        tableId: tableId(),
        fieldIds: z
          .array(fieldIdSchema)
          .describe('Field IDs (f_xxx format) to wait on'),
        recordIds: z
          .array(recordIdSchema)
          .describe('Record IDs (r_xxx format) to wait on'),
        timeoutMs: z
          .number()
          .optional()
          .describe('Timeout in milliseconds. Default: 120000 (2 minutes)'),
        pollIntervalMs: z
          .number()
          .optional()
          .describe('Poll interval in milliseconds. Default: 2000 (2 seconds)'),
      },
    },
    async ({ tableId, fieldIds, recordIds, timeoutMs, pollIntervalMs }) => {
      try {
        const result = await client.waitForEnrichment(
          tableId as TableId,
          fieldIds as FieldId[],
          recordIds as RecordId[],
          { timeoutMs, pollIntervalMs }
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: result.success,
                  completedCount: result.results.filter((r) => r.status === 'SUCCESS').length,
                  failedCount: result.results.filter((r) => r.status === 'FAILED').length,
                  results: result.results,
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
              text: `Error waiting for enrichment: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_list_enrichments - List all available enrichments from registry
   */
  server.registerTool(
    'clay_list_enrichments',
    {
      title: 'List Available Enrichments',
      description:
        'List all available enrichment providers from the registry. Shows enrichment names you can use with clay_create_enrichment.',
      inputSchema: {
        category: z
          .string()
          .optional()
          .describe(
            'Filter by category (e.g., "email-finders", "crm", "core"). Leave empty for all.'
          ),
      },
    },
    async ({ category }) => {
      try {
        const allProviders = await getAllProviders();
        const filtered = category
          ? allProviders.filter((p) => p.category === category)
          : allProviders;

        // Format as a readable list
        const output = filtered.map((p) => ({
          name: p.name,
          category: p.category,
          displayName: p.provider.displayName || p.name,
          description: p.provider.description || '',
          inputs: p.provider.inputFields || [],
          outputs: p.provider.outputFields || [],
          requiresAuth: p.provider.authAccountId !== null && !p.provider.clayManagedAccountId,
          hasClayManagedAccount: !!p.provider.clayManagedAccountId,
        }));

        // Group by category for readability
        const grouped: Record<string, typeof output> = {};
        for (const item of output) {
          if (!grouped[item.category]) {
            grouped[item.category] = [];
          }
          grouped[item.category].push(item);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  totalCount: output.length,
                  enrichments: grouped,
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
              text: `Error listing enrichments: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_create_enrichment - Create an enrichment field using registry
   */
  server.registerTool(
    'clay_create_enrichment',
    {
      title: 'Create Enrichment Field',
      description:
        'Create an enrichment column using a provider from the registry. Use clay_list_enrichments to see available providers. Input mapping connects your table fields to the enrichment inputs. By default uses Clay-managed accounts (Clay credits) when available.',
      inputSchema: {
        tableId: tableId(),
        enrichmentName: nonEmptyString.describe(
          'Enrichment name from registry (e.g., "domain-from-company", "findymail-validate", "apollo-enrich-person")'
        ),
        fieldName: nonEmptyString.describe('Name for the new column'),
        inputMapping: z
          .record(z.string())
          .describe(
            'Map enrichment inputs to field IDs. Keys are input names (e.g., "query", "email"), values are field IDs (e.g., "f_xxx") or formulas'
          ),
        useOwnAccount: z
          .boolean()
          .optional()
          .describe(
            'Use your own connected account instead of Clay-managed (Clay credits). Default: false (uses Clay credits when available)'
          ),
        authAccountId: authAccountId('Specific auth account ID to use (e.g., "aa_xxx"). Overrides useOwnAccount.').optional(),
      },
    },
    async ({ tableId, enrichmentName, fieldName, inputMapping, useOwnAccount, authAccountId }) => {
      try {
        // Find the provider in registry
        const result = await findProviderByName(enrichmentName);
        if (!result) {
          const allProviders = await getAllProviders();
          const names = allProviders.map((p) => p.name).join(', ');
          return {
            content: [
              {
                type: 'text' as const,
                text: `Enrichment "${enrichmentName}" not found in registry. Available: ${names}`,
              },
            ],
            isError: true,
          };
        }

        const { provider } = result;

        // Build inputsBinding from the mapping
        const inputsBinding: Array<{ name: string; formulaText?: string }> = Object.entries(inputMapping).map(([name, value]) => {
          // If value looks like a field ID, wrap in formula syntax
          const formulaText = value.startsWith('{{') || value.startsWith('"')
            ? value
            : `{{${value}}}`;
          return { name, formulaText };
        });

        // Add empty bindings for any other expected inputs not in mapping
        const mappedNames = new Set(Object.keys(inputMapping));
        for (const inputName of provider.inputFields || []) {
          if (!mappedNames.has(inputName)) {
            inputsBinding.push({ name: inputName });
          }
        }

        // Resolve auth account using priority: env var > explicit > clay-managed
        const resolved = resolveAuthAccount(provider, {
          explicitAccountId: authAccountId,
          useOwnAccount,
        });

        // Create the field
        const field = await client.createEnrichmentField(
          tableId as TableId,
          fieldName,
          {
            actionKey: provider.actionKey,
            actionPackageId: provider.actionPackageId,
            authAccountId: resolved.accountId,
            inputsBinding,
          }
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  fieldId: field.id || (field as { field?: { id: string } }).field?.id,
                  enrichment: enrichmentName,
                  authSource: resolved.source,
                  usingClayCredits: resolved.usesClayCredits,
                  message: `Created "${fieldName}" using ${provider.displayName || enrichmentName}${resolved.usesClayCredits ? ' (Clay credits)' : resolved.source === 'env' ? ' (env override)' : ''}`,
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
              text: `Error creating enrichment field: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_create_email_waterfall - Create an email finder waterfall from registry
   */
  server.registerTool(
    'clay_create_email_waterfall',
    {
      title: 'Create Email Waterfall',
      description:
        'Create an email finder waterfall using providers from the registry. Tries each provider in order until one finds an email. Default order: findymail → hunter → leadmagic → prospeo → dropcontact. Uses Clay-managed accounts (Clay credits) by default when available.',
      inputSchema: {
        tableId: tableId(),
        fieldName: nonEmptyString.describe('Name for the waterfall column'),
        inputMapping: z
          .object({
            firstName: z.string().optional().describe('Field ID for first name'),
            lastName: z.string().optional().describe('Field ID for last name'),
            fullName: z.string().optional().describe('Field ID for full name (alternative to first+last)'),
            domain: z.string().describe('Field ID for company domain'),
            company: z.string().optional().describe('Field ID for company name'),
          })
          .describe('Map your fields to enrichment inputs'),
        providers: z
          .array(z.string())
          .optional()
          .describe(
            'Provider names in order (e.g., ["findymail", "hunter", "leadmagic"]). Default: all available email finders'
          ),
        useOwnAccounts: z
          .boolean()
          .optional()
          .describe(
            'Use your own connected accounts instead of Clay-managed (Clay credits). Default: false'
          ),
      },
    },
    async ({ tableId, fieldName, inputMapping, providers, useOwnAccounts }) => {
      try {
        // Get all email finder providers from registry
        const emailFinders = await getProvidersByCategory('email-finders');

        // Default provider order - only providers that exist in registry
        const defaultOrder = ['findymail', 'clay', 'datagma', 'exellius', 'firmable'];
        const providerOrder = providers || defaultOrder;

        // Build waterfall configs
        const waterfallConfigs: ActionConfig[] = [];

        // Helper to check if provider has an input by name
        const hasInput = (provider: any, name: string): boolean => {
          if (provider.inputs?.some((i: any) => i.name === name)) return true;
          if (provider.inputFields?.includes(name)) return true;
          return false;
        };

        for (const providerName of providerOrder) {
          // Find provider by partial match - registry keys are like 'findymail-find-work-email'
          // Prefer providers that use name+domain (not LinkedIn-based) when we have name inputs
          const allMatches = Object.keys(emailFinders).filter(k =>
            k.toLowerCase().includes(providerName.toLowerCase()) &&
            (k.includes('work-email') || k.includes('find-email'))
          );
          // Prefer non-linkedin version when we have name+domain inputs
          const providerKey = allMatches.find(k => !k.includes('linkedin')) || allMatches[0];
          if (!providerKey) continue;

          const provider = emailFinders[providerKey];

          // Build inputsBinding based on what the provider actually needs
          const inputsBinding: Array<{ name: string; formulaText: string }> = [];

          // Build full name formula from firstName + lastName if needed
          const fullNameFormula = inputMapping.fullName
            ? `{{${inputMapping.fullName}}}`
            : inputMapping.firstName && inputMapping.lastName
            ? `{{${inputMapping.firstName}}} + " " + {{${inputMapping.lastName}}}`
            : null;

          // Map inputs based on actual provider requirements (from registry inputs array)
          // full_name variants (most common for work email finders)
          if (hasInput(provider, 'full_name') && fullNameFormula) {
            inputsBinding.push({ name: 'full_name', formulaText: fullNameFormula });
          }
          if (hasInput(provider, 'fullName') && fullNameFormula) {
            inputsBinding.push({ name: 'fullName', formulaText: fullNameFormula });
          }
          if (hasInput(provider, 'name') && fullNameFormula) {
            inputsBinding.push({ name: 'name', formulaText: fullNameFormula });
          }

          // company_domain variants (most common)
          if (hasInput(provider, 'company_domain') && inputMapping.domain) {
            inputsBinding.push({ name: 'company_domain', formulaText: `{{${inputMapping.domain}}}` });
          }
          if (hasInput(provider, 'unparsedDomain') && inputMapping.domain) {
            inputsBinding.push({ name: 'unparsedDomain', formulaText: `{{${inputMapping.domain}}}` });
          }

          // Company name variants
          if (hasInput(provider, 'company') && inputMapping.company) {
            inputsBinding.push({ name: 'company', formulaText: `{{${inputMapping.company}}}` });
          }
          if (hasInput(provider, 'company_name') && inputMapping.company) {
            inputsBinding.push({ name: 'company_name', formulaText: `{{${inputMapping.company}}}` });
          }

          // Only add if we have required inputs
          if (inputsBinding.length > 0) {
            // Resolve auth account: env var > useOwnAccounts > clay-managed
            const resolved = resolveAuthAccount(provider, { useOwnAccount: useOwnAccounts });

            waterfallConfigs.push({
              type: 'actionConfig' as const,
              actionKey: provider.actionKey,
              actionPackageId: provider.actionPackageId,
              authAccountId: resolved.accountId,
              inputsBinding,
              attributePath: 'email',
              name: provider.displayName || providerName,
            });
          }
        }

        if (waterfallConfigs.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: No valid provider configurations could be built. Ensure inputMapping has firstName+lastName (or fullName) and domain.',
              },
            ],
            isError: true,
          };
        }

        // Create the waterfall
        const result = await client.createWaterfallField(
          tableId as TableId,
          fieldName,
          waterfallConfigs,
          'DONT_RUN'
        );

        // Count how many are using Clay-managed accounts
        const clayManagedCount = waterfallConfigs.filter((c) => {
          const prov = emailFinders[providerOrder.find((n) => emailFinders[n]?.displayName === c.name || n === c.name) || ''];
          return prov?.clayManagedAccountId && c.authAccountId === prov.clayManagedAccountId;
        }).length;

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  fieldName,
                  providersConfigured: waterfallConfigs.map((c) => c.name),
                  usingClayCredits: !useOwnAccounts,
                  message: `Created email waterfall "${fieldName}" with ${waterfallConfigs.length} providers${!useOwnAccounts ? ' (using Clay credits)' : ''}`,
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
              text: `Error creating email waterfall: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_create_phone_waterfall - Create a phone finder waterfall from registry
   */
  server.registerTool(
    'clay_create_phone_waterfall',
    {
      title: 'Create Phone Waterfall',
      description:
        'Create a phone finder waterfall using multiple providers. Tries each provider in order until one finds a phone number. Uses Clay-managed accounts (Clay credits) by default when available.',
      inputSchema: {
        tableId: tableId(),
        fieldName: nonEmptyString.describe('Name for the waterfall column'),
        inputMapping: z
          .object({
            firstName: z.string().optional().describe('Field ID for first name'),
            lastName: z.string().optional().describe('Field ID for last name'),
            fullName: z.string().optional().describe('Field ID for full name'),
            email: z.string().optional().describe('Field ID for email address'),
            linkedinUrl: z.string().optional().describe('Field ID for LinkedIn URL'),
            company: z.string().optional().describe('Field ID for company name'),
            domain: z.string().optional().describe('Field ID for company domain'),
          })
          .describe('Map your fields to enrichment inputs'),
        providers: z
          .array(z.string())
          .optional()
          .describe(
            'Provider names in order. Default: all available phone finders'
          ),
      },
    },
    async ({ tableId, fieldName, inputMapping, providers }) => {
      try {
        // Get all phone finder providers from registry
        const phoneFinders = await getProvidersByCategory('phone-finders');

        // Default provider order - only providers that exist in registry
        const defaultOrder = ['nymblr', 'exellius', 'selligence', 'datagma', 'findymail'];
        const providerOrder = providers || defaultOrder;

        // Build waterfall configs
        const waterfallConfigs: ActionConfig[] = [];

        // Helper to check if provider has an input by name
        const hasInput = (provider: any, name: string): boolean => {
          if (provider.inputs?.some((i: any) => i.name === name)) return true;
          if (provider.inputFields?.includes(name)) return true;
          return false;
        };

        for (const providerName of providerOrder) {
          // Find provider by partial match
          const providerKey = Object.keys(phoneFinders).find(k =>
            k.toLowerCase().includes(providerName.toLowerCase()) &&
            (k.includes('mobile') || k.includes('phone'))
          );
          if (!providerKey) continue;

          const provider = phoneFinders[providerKey];
          const inputsBinding: Array<{ name: string; formulaText: string }> = [];

          // Build full name formula from firstName + lastName if needed
          const fullNameFormula = inputMapping.fullName
            ? `{{${inputMapping.fullName}}}`
            : inputMapping.firstName && inputMapping.lastName
            ? `{{${inputMapping.firstName}}} + " " + {{${inputMapping.lastName}}}`
            : null;

          // Map inputs based on actual provider requirements
          // Name variants
          if (hasInput(provider, 'name') && fullNameFormula) {
            inputsBinding.push({ name: 'name', formulaText: fullNameFormula });
          }
          if (hasInput(provider, 'full_name') && fullNameFormula) {
            inputsBinding.push({ name: 'full_name', formulaText: fullNameFormula });
          }

          // Email
          if (hasInput(provider, 'email') && inputMapping.email) {
            inputsBinding.push({ name: 'email', formulaText: `{{${inputMapping.email}}}` });
          }

          // LinkedIn URL variants
          if (hasInput(provider, 'linkedin_url') && inputMapping.linkedinUrl) {
            inputsBinding.push({ name: 'linkedin_url', formulaText: `{{${inputMapping.linkedinUrl}}}` });
          }
          if (hasInput(provider, 'personal_linkedin_url') && inputMapping.linkedinUrl) {
            inputsBinding.push({ name: 'personal_linkedin_url', formulaText: `{{${inputMapping.linkedinUrl}}}` });
          }

          // Domain variants
          if (hasInput(provider, 'domain') && inputMapping.domain) {
            inputsBinding.push({ name: 'domain', formulaText: `{{${inputMapping.domain}}}` });
          }
          if (hasInput(provider, 'company_domain') && inputMapping.domain) {
            inputsBinding.push({ name: 'company_domain', formulaText: `{{${inputMapping.domain}}}` });
          }

          if (inputsBinding.length > 0) {
            const resolved = resolveAuthAccount(provider, {});
            waterfallConfigs.push({
              type: 'actionConfig' as const,
              actionKey: provider.actionKey,
              actionPackageId: provider.actionPackageId,
              authAccountId: resolved.accountId,
              inputsBinding,
              attributePath: 'phone',
              name: provider.displayName || providerName,
            });
          }
        }

        if (waterfallConfigs.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: No valid provider configurations could be built. Check your inputMapping.',
              },
            ],
            isError: true,
          };
        }

        const result = await client.createWaterfallField(
          tableId as TableId,
          fieldName,
          waterfallConfigs,
          'DONT_RUN'
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  fieldName,
                  providersConfigured: waterfallConfigs.map((c) => c.name),
                  message: `Created phone waterfall "${fieldName}" with ${waterfallConfigs.length} providers`,
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
              text: `Error creating phone waterfall: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_validate_emails - Create email validation field
   */
  server.registerTool(
    'clay_validate_emails',
    {
      title: 'Validate Emails',
      description:
        'Create an email validation field to verify email deliverability. Uses a single validation provider for reliable results.',
      inputSchema: {
        tableId: tableId(),
        fieldName: nonEmptyString.describe('Name for the validation column'),
        emailFieldId: fieldId('Field ID containing emails to validate (f_xxx format)'),
        provider: z
          .string()
          .optional()
          .describe('Provider name. Default: findymail-validate-email. Options: findymail-validate-email, neverbounce-validate-email, verify-email'),
      },
    },
    async ({ tableId, fieldName, emailFieldId, provider }) => {
      try {
        const emailFinders = await getProvidersByCategory('email-finders');

        // Find validation provider - prefer exact match, then partial match
        const defaultProvider = 'findymail-validate-email';
        const providerName = provider || defaultProvider;

        // Try direct lookup first
        let providerKey = emailFinders[providerName] ? providerName : null;
        if (!providerKey) {
          // Try partial match for validation providers
          providerKey = Object.keys(emailFinders).find(k =>
            k.toLowerCase().includes(providerName.toLowerCase()) &&
            (k.includes('validate') || k.includes('verify'))
          ) || null;
        }

        if (!providerKey) {
          // List available validation providers
          const validationProviders = Object.keys(emailFinders).filter(k =>
            k.includes('validate') || k.includes('verify')
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: Provider "${providerName}" not found. Available validation providers: ${validationProviders.join(', ')}`,
              },
            ],
            isError: true,
          };
        }

        const validationProvider = emailFinders[providerKey];

        // Determine the correct input name from provider config
        const inputName = validationProvider.inputs?.find(i =>
          i.name === 'email' || i.name === 'email_address'
        )?.name || 'email';

        const resolved = resolveAuthAccount(validationProvider, {});

        const result = await client.createEnrichmentField(
          tableId as TableId,
          fieldName,
          {
            actionKey: validationProvider.actionKey,
            actionPackageId: validationProvider.actionPackageId,
            authAccountId: resolved.accountId,
            inputsBinding: [{ name: inputName, formulaText: `{{${emailFieldId}}}` }],
          }
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  fieldId: (result as any).field?.id || (result as any).id,
                  fieldName,
                  provider: validationProvider.displayName || providerKey,
                  message: `Created email validation field "${fieldName}" using ${validationProvider.displayName || providerKey}`,
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
              text: `Error creating email validation: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_enrich_company - One-call company enrichment
   */
  server.registerTool(
    'clay_enrich_company',
    {
      title: 'Enrich Company',
      description:
        'Add comprehensive company enrichment to a table. Creates multiple fields for company data: description, industry, employee count, funding, tech stack, etc.',
      inputSchema: {
        tableId: tableId(),
        domainFieldId: fieldId('Field ID containing company domains (f_xxx format)'),
        enrichments: z
          .array(z.enum(['basic', 'funding', 'techstack', 'social', 'all']))
          .optional()
          .describe('Which enrichments to add. Default: ["basic"]'),
      },
    },
    async ({ tableId, domainFieldId, enrichments = ['basic'] }) => {
      try {
        const companyProviders = await getProvidersByCategory('company-enrichment');
        const createdFields: string[] = [];

        // Get table for view ID
        const tableResult = await client.getTable(tableId as TableId) as unknown as {
          table: { gridViews: Array<{ id: string }> };
        };
        const viewId = tableResult.table.gridViews?.[0]?.id;

        const shouldInclude = (type: string) =>
          enrichments.includes('all') || enrichments.includes(type as 'basic' | 'funding' | 'techstack' | 'social');

        // Basic company enrichment - use Clay's built-in Mixrank enrichment
        if (shouldInclude('basic')) {
          const clayCo = companyProviders['enrich-company-with-mixrank-v2'] || companyProviders['enrich-company-with-mixrank'];
          if (clayCo) {
            const field = await client.createEnrichmentField(
              tableId as TableId,
              'Company Info',
              {
                actionKey: clayCo.actionKey,
                actionPackageId: clayCo.actionPackageId,
                authAccountId: resolveAuthAccount(clayCo, {}).accountId,
                inputsBinding: [{ name: 'company_identifier', formulaText: `{{${domainFieldId}}}` }],
              }
            );
            createdFields.push('Company Info');
          }
        }

        // Funding data - crunchbase is in the 'fundraising' category
        if (shouldInclude('funding')) {
          const fundingProviders = await getProvidersByCategory('fundraising');
          const crunchbase = fundingProviders['crunchbase-enrich-company-basic-information'];
          if (crunchbase) {
            const field = await client.createEnrichmentField(
              tableId as TableId,
              'Funding Info',
              {
                actionKey: crunchbase.actionKey,
                actionPackageId: crunchbase.actionPackageId,
                authAccountId: resolveAuthAccount(crunchbase, {}).accountId,
                inputsBinding: [{ name: 'company_domain', formulaText: `{{${domainFieldId}}}` }],
              }
            );
            createdFields.push('Funding Info');
          }
        }

        // Tech stack
        if (shouldInclude('techstack')) {
          const techProviders = await getProvidersByCategory('technographics');
          const techLookup = techProviders['lookup-technology-stack'];
          if (techLookup) {
            const field = await client.createEnrichmentField(
              tableId as TableId,
              'Tech Stack',
              {
                actionKey: techLookup.actionKey,
                actionPackageId: techLookup.actionPackageId,
                authAccountId: resolveAuthAccount(techLookup, {}).accountId,
                inputsBinding: [{ name: 'url', formulaText: `{{${domainFieldId}}}` }],
              }
            );
            createdFields.push('Tech Stack');
          }
        }

        // Social profiles - findCompanyLinkedInPage is in company-enrichment category
        if (shouldInclude('social')) {
          const linkedinPage = companyProviders['findCompanyLinkedInPage'];
          if (linkedinPage) {
            const field = await client.createEnrichmentField(
              tableId as TableId,
              'LinkedIn Profile',
              {
                actionKey: linkedinPage.actionKey,
                actionPackageId: linkedinPage.actionPackageId,
                authAccountId: resolveAuthAccount(linkedinPage, {}).accountId,
                inputsBinding: [{ name: 'url', formulaText: `{{${domainFieldId}}}` }],
              }
            );
            createdFields.push('LinkedIn Profile');
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  fieldsCreated: createdFields,
                  message: `Added ${createdFields.length} company enrichment fields`,
                  nextSteps: [
                    'Run enrichments with clay_run_enrichment',
                    'Or they will auto-run based on table settings',
                  ],
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
              text: `Error enriching company: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_enrich_person - One-call person enrichment
   */
  server.registerTool(
    'clay_enrich_person',
    {
      title: 'Enrich Person',
      description:
        'Add comprehensive person enrichment to a table. Creates fields for contact info, job details, social profiles, etc.',
      inputSchema: {
        tableId: tableId(),
        emailFieldId: fieldId('Field ID containing email addresses').optional(),
        linkedinFieldId: fieldId('Field ID containing LinkedIn URLs').optional(),
        enrichments: z
          .array(z.enum(['basic', 'contact', 'social', 'all']))
          .optional()
          .describe('Which enrichments to add. Default: ["basic"]'),
      },
    },
    async ({ tableId, emailFieldId, linkedinFieldId, enrichments = ['basic'] }) => {
      try {
        if (!emailFieldId && !linkedinFieldId) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: Must provide either emailFieldId or linkedinFieldId',
              },
            ],
            isError: true,
          };
        }

        const personProviders = await getProvidersByCategory('person-enrichment');
        const createdFields: string[] = [];

        const shouldInclude = (type: string) =>
          enrichments.includes('all') || enrichments.includes(type as 'basic' | 'contact' | 'social');

        // Basic person enrichment
        if (shouldInclude('basic')) {
          // Try Apollo first
          const apollo = personProviders['apollo-enrich-person'] || personProviders['apollo-oauth-enrich-person'];
          if (apollo && emailFieldId) {
            const field = await client.createEnrichmentField(
              tableId as TableId,
              'Person Info',
              {
                actionKey: apollo.actionKey,
                actionPackageId: apollo.actionPackageId,
                authAccountId: resolveAuthAccount(apollo, {}).accountId,
                inputsBinding: [{ name: 'email', formulaText: `{{${emailFieldId}}}` }],
              }
            );
            createdFields.push('Person Info');
          }
        }

        // Contact info (phone, verified email)
        if (shouldInclude('contact') && emailFieldId) {
          // Add phone waterfall
          const phoneFinders = await getProvidersByCategory('phone-finders');
          const nymblr = phoneFinders['nymblr-find-mobile'];
          if (nymblr) {
            const field = await client.createEnrichmentField(
              tableId as TableId,
              'Mobile Phone',
              {
                actionKey: nymblr.actionKey,
                actionPackageId: nymblr.actionPackageId,
                authAccountId: resolveAuthAccount(nymblr, {}).accountId,
                inputsBinding: [{ name: 'email', formulaText: `{{${emailFieldId}}}` }],
              }
            );
            createdFields.push('Mobile Phone');
          }
        }

        // Social enrichment
        if (shouldInclude('social') && linkedinFieldId) {
          const linkedinProviders = await getProvidersByCategory('linkedin');
          const liProfile = Object.values(linkedinProviders).find(p =>
            p.actionKey.includes('profile') && !p.actionKey.includes('company')
          );
          if (liProfile) {
            const field = await client.createEnrichmentField(
              tableId as TableId,
              'LinkedIn Data',
              {
                actionKey: liProfile.actionKey,
                actionPackageId: liProfile.actionPackageId,
                authAccountId: resolveAuthAccount(liProfile, {}).accountId,
                inputsBinding: [{ name: 'linkedin_url', formulaText: `{{${linkedinFieldId}}}` }],
              }
            );
            createdFields.push('LinkedIn Data');
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  fieldsCreated: createdFields,
                  message: `Added ${createdFields.length} person enrichment fields`,
                  nextSteps: [
                    'Run enrichments with clay_run_enrichment',
                    'Add email waterfall with clay_create_email_waterfall',
                    'Add phone waterfall with clay_create_phone_waterfall',
                  ],
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
              text: `Error enriching person: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

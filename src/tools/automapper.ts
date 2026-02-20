/**
 * Auto-Mapper Tools
 *
 * Intelligent tools that analyze tables and automatically map fields to enrichments.
 * Reduces the cognitive load for agents by inferring semantic types and suggesting
 * enrichments based on available data.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { ClayClient } from '../client.js';
import type { TableId, FieldId } from '../types/clay.js';
import {
  getRegistry,
  getProvidersByCategory,
  resolveAuthAccount,
  EnrichmentProvider,
} from '../enrichments/index.js';
import { tableId, nonEmptyString } from '../validation.js';

/**
 * Semantic type mappings - maps field name patterns to semantic types
 * IMPORTANT: Order matters! More specific patterns (like LinkedIn) must come
 * before generic patterns (like domain/url) to avoid false matches.
 */
const FIELD_NAME_TO_SEMANTIC: Record<string, string[]> = {
  // LinkedIn - check FIRST to avoid matching generic 'url' patterns
  'person-linkedin-url': [
    'linkedin_url', 'linkedinurl', 'linkedin', 'li_url', 'linkedin_profile',
    'person_linkedin', 'contact_linkedin', 'linkedin_link', 'linkedin url',
  ],
  'company-linkedin-url': [
    'company_linkedin', 'company_linkedin_url', 'org_linkedin', 'business_linkedin',
  ],

  // Person identifiers
  'full-name': [
    'name', 'full_name', 'fullname', 'full name', 'person_name', 'contact_name',
    'prospect_name', 'lead_name', 'customer_name',
  ],
  'first-name': [
    'first_name', 'firstname', 'first name', 'fname', 'given_name', 'first',
  ],
  'last-name': [
    'last_name', 'lastname', 'last name', 'lname', 'family_name', 'surname', 'last',
  ],

  // Email types
  'work-email': [
    'email', 'work_email', 'workemail', 'work email', 'business_email',
    'corporate_email', 'company_email', 'professional_email', 'email_address',
  ],
  'personal-email': [
    'personal_email', 'personalemail', 'personal email', 'private_email', 'home_email',
  ],

  // Company identifiers - removed generic 'url' to avoid matching LinkedIn URLs
  'company-domain': [
    'domain', 'company_domain', 'companydomain', 'website', 'company_website',
    'site', 'web', 'homepage', 'company_url', 'site_url', 'website_url',
  ],
  'company-name': [
    'company', 'company_name', 'companyname', 'organization', 'org', 'employer',
    'business_name', 'account_name', 'firm', 'company name',
  ],

  // Job info
  'job-title': [
    'title', 'job_title', 'jobtitle', 'role', 'position', 'job title',
    'designation', 'occupation',
  ],

  // Contact info
  'phone': [
    'phone', 'phone_number', 'phonenumber', 'mobile', 'cell', 'telephone',
    'work_phone', 'direct_phone', 'phone number',
  ],

  // Location
  'location': [
    'location', 'city', 'state', 'country', 'address', 'region', 'area',
    'headquarters', 'hq',
  ],
};

/**
 * Reverse mapping: semantic type -> common field name variations
 */
const SEMANTIC_TO_FIELD_NAMES: Record<string, string[]> = {};
for (const [semantic, names] of Object.entries(FIELD_NAME_TO_SEMANTIC)) {
  SEMANTIC_TO_FIELD_NAMES[semantic] = names;
}

/**
 * Infer semantic type from a field name
 */
function inferSemanticType(fieldName: string): string | null {
  const normalized = fieldName.toLowerCase().replace(/[_-]/g, ' ').trim();

  for (const [semanticType, patterns] of Object.entries(FIELD_NAME_TO_SEMANTIC)) {
    for (const pattern of patterns) {
      if (normalized === pattern || normalized.includes(pattern)) {
        return semanticType;
      }
    }
  }

  return null;
}

/**
 * Analyze a field and return its inferred properties
 */
interface AnalyzedField {
  fieldId: string;
  name: string;
  type: string;
  inferredSemanticType: string | null;
  confidence: 'high' | 'medium' | 'low';
  suggestedUses: string[];
}

/**
 * Enrichment suggestion
 */
interface EnrichmentSuggestion {
  enrichmentName: string;
  displayName: string;
  description: string;
  category: string;
  inputMapping: Record<string, string>;
  missingInputs: string[];
  confidence: 'high' | 'medium' | 'low';
  credits: number | null;
}

export function registerAutoMapperTools(
  server: McpServer,
  client: ClayClient
): void {
  /**
   * clay_analyze_table - Analyze a table and infer field semantic types
   */
  server.registerTool(
    'clay_analyze_table',
    {
      title: 'Analyze Table Fields',
      description:
        'Analyze a table\'s fields and infer their semantic types (email, name, domain, etc.). Returns field analysis with suggested uses and confidence levels. Use this before creating enrichments to understand your data.',
      inputSchema: {
        tableId: tableId(),
      },
    },
    async ({ tableId }) => {
      try {
        const tableResult = await client.getTable(tableId as TableId) as unknown as {
          table: {
            id: string;
            name: string;
            fields: Array<{
              id: string;
              name: string;
              type: string;
              fieldType?: string;
            }>;
          };
        };

        const fields = tableResult.table.fields || [];
        const analyzed: AnalyzedField[] = [];

        for (const field of fields) {
          // Skip system/enrichment fields
          if (field.type === 'enrichment' || field.type === 'formula') {
            continue;
          }

          const semanticType = inferSemanticType(field.name);
          let confidence: 'high' | 'medium' | 'low' = 'low';
          const suggestedUses: string[] = [];

          if (semanticType) {
            // Determine confidence based on match quality
            const normalized = field.name.toLowerCase().replace(/[_-]/g, ' ').trim();
            const patterns = FIELD_NAME_TO_SEMANTIC[semanticType] || [];
            if (patterns.some(p => normalized === p)) {
              confidence = 'high';
            } else if (patterns.some(p => normalized.includes(p))) {
              confidence = 'medium';
            }

            // Suggest uses based on semantic type
            switch (semanticType) {
              case 'work-email':
              case 'personal-email':
                suggestedUses.push(
                  'Email validation',
                  'Person enrichment (Apollo, Clearbit)',
                  'Phone finder',
                  'LinkedIn lookup',
                );
                break;
              case 'full-name':
              case 'first-name':
              case 'last-name':
                suggestedUses.push(
                  'Email finder (with domain)',
                  'Person enrichment',
                  'LinkedIn search',
                );
                break;
              case 'company-domain':
                suggestedUses.push(
                  'Company enrichment',
                  'Tech stack lookup',
                  'Email finder (with name)',
                  'Job postings search',
                  'News/PR monitoring',
                );
                break;
              case 'company-name':
                suggestedUses.push(
                  'Domain lookup',
                  'Company enrichment',
                  'LinkedIn company search',
                );
                break;
              case 'person-linkedin-url':
                suggestedUses.push(
                  'LinkedIn profile enrichment',
                  'Person data extraction',
                  'Job change detection',
                );
                break;
              case 'company-linkedin-url':
                suggestedUses.push(
                  'LinkedIn company data',
                  'Employee search',
                );
                break;
              case 'job-title':
                suggestedUses.push(
                  'ICP scoring',
                  'Persona classification',
                );
                break;
            }
          }

          analyzed.push({
            fieldId: field.id,
            name: field.name,
            type: field.type || field.fieldType || 'text',
            inferredSemanticType: semanticType,
            confidence,
            suggestedUses,
          });
        }

        // Summary of what enrichments are possible
        const semanticTypes = new Set(analyzed.map(f => f.inferredSemanticType).filter(Boolean));
        const possibleEnrichments: string[] = [];

        if (semanticTypes.has('work-email') || semanticTypes.has('personal-email')) {
          possibleEnrichments.push('Email validation', 'Person enrichment', 'Phone finder');
        }
        if (semanticTypes.has('company-domain')) {
          possibleEnrichments.push('Company enrichment', 'Tech stack', 'Job postings', 'News monitoring');
        }
        if ((semanticTypes.has('full-name') || (semanticTypes.has('first-name') && semanticTypes.has('last-name'))) &&
            semanticTypes.has('company-domain')) {
          possibleEnrichments.push('Email finder waterfall');
        }
        if (semanticTypes.has('person-linkedin-url')) {
          possibleEnrichments.push('LinkedIn profile enrichment', 'Job change detection');
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  tableId,
                  tableName: tableResult.table.name,
                  fieldsAnalyzed: analyzed.length,
                  fields: analyzed,
                  summary: {
                    detectedSemanticTypes: Array.from(semanticTypes),
                    possibleEnrichments,
                    recommendation: possibleEnrichments.length > 0
                      ? `Use clay_suggest_enrichments for detailed recommendations based on ${Array.from(semanticTypes).join(', ')} fields.`
                      : 'No standard enrichment opportunities detected. Consider adding fields like email, domain, or name.',
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
              text: `Error analyzing table: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_suggest_enrichments - Suggest enrichments based on table fields
   */
  server.registerTool(
    'clay_suggest_enrichments',
    {
      title: 'Suggest Enrichments',
      description:
        'Analyze a table and suggest the best enrichments based on available fields. Returns ranked suggestions with auto-generated input mappings ready for clay_create_enrichment.',
      inputSchema: {
        tableId: tableId(),
        categories: z
          .array(z.string())
          .optional()
          .describe('Filter to specific categories (e.g., ["email-finders", "company-enrichment"]). Default: all'),
        limit: z
          .number()
          .optional()
          .describe('Maximum number of suggestions to return. Default: 10'),
      },
    },
    async ({ tableId, categories, limit = 10 }) => {
      try {
        // Get table fields
        const tableResult = await client.getTable(tableId as TableId) as unknown as {
          table: {
            id: string;
            name: string;
            fields: Array<{
              id: string;
              name: string;
              type: string;
            }>;
          };
        };

        const fields = tableResult.table.fields || [];

        // Build a map of semantic types to field IDs
        const semanticToField: Record<string, { fieldId: string; name: string; confidence: 'high' | 'medium' | 'low' }> = {};
        const fieldNameToId: Record<string, string> = {};

        for (const field of fields) {
          const normalized = field.name.toLowerCase().replace(/[_-]/g, ' ').trim();
          fieldNameToId[normalized] = field.id;
          fieldNameToId[field.name] = field.id;

          const semanticType = inferSemanticType(field.name);
          if (semanticType && !semanticToField[semanticType]) {
            const patterns = FIELD_NAME_TO_SEMANTIC[semanticType] || [];
            const confidence = patterns.some(p => normalized === p) ? 'high' :
              patterns.some(p => normalized.includes(p)) ? 'medium' : 'low';
            semanticToField[semanticType] = { fieldId: field.id, name: field.name, confidence };
          }
        }

        // Get registry and find matching enrichments
        const registry = await getRegistry();
        const suggestions: EnrichmentSuggestion[] = [];

        for (const [category, providers] of Object.entries(registry)) {
          if (category === '_meta') continue;
          if (categories && !categories.includes(category)) continue;

          for (const [actionKey, provider] of Object.entries(providers as Record<string, any>)) {
            // Skip validate-auth actions
            if (actionKey.includes('validate-auth')) continue;

            const inputs = provider.inputs || [];
            if (inputs.length === 0) continue;

            // Try to map inputs
            const inputMapping: Record<string, string> = {};
            const missingInputs: string[] = [];
            let requiredMissing = false;

            for (const input of inputs) {
              const inputName = input.name;
              const semanticType = input.semanticType;
              const isRequired = input.required;

              // Try to find a matching field
              let matched = false;

              // 1. Try semantic type match
              if (semanticType && semanticToField[semanticType]) {
                inputMapping[inputName] = semanticToField[semanticType].fieldId;
                matched = true;
              }

              // 2. Try direct name match
              if (!matched) {
                const directMatch = fieldNameToId[inputName.toLowerCase()] ||
                  fieldNameToId[inputName.replace(/_/g, ' ')] ||
                  fieldNameToId[inputName.replace(/([A-Z])/g, ' $1').toLowerCase().trim()];
                if (directMatch) {
                  inputMapping[inputName] = directMatch;
                  matched = true;
                }
              }

              // 3. Try fuzzy name match
              if (!matched) {
                for (const [fieldName, fieldId] of Object.entries(fieldNameToId)) {
                  if (fieldName.includes(inputName.toLowerCase()) ||
                      inputName.toLowerCase().includes(fieldName)) {
                    inputMapping[inputName] = fieldId;
                    matched = true;
                    break;
                  }
                }
              }

              if (!matched) {
                missingInputs.push(inputName);
                if (isRequired) {
                  requiredMissing = true;
                }
              }
            }

            // Only suggest if we have at least one mapped input and no required inputs are missing
            if (Object.keys(inputMapping).length > 0 && !requiredMissing) {
              // Calculate confidence
              const mappedCount = Object.keys(inputMapping).length;
              const totalRequired = inputs.filter((i: any) => i.required).length;
              const confidence: 'high' | 'medium' | 'low' =
                mappedCount >= totalRequired && missingInputs.length === 0 ? 'high' :
                mappedCount >= totalRequired ? 'medium' : 'low';

              suggestions.push({
                enrichmentName: actionKey,
                displayName: provider.displayName || actionKey,
                description: provider.description || '',
                category,
                inputMapping,
                missingInputs,
                confidence,
                credits: provider.credits,
              });
            }
          }
        }

        // Sort by confidence and limit
        suggestions.sort((a, b) => {
          const confOrder = { high: 0, medium: 1, low: 2 };
          return confOrder[a.confidence] - confOrder[b.confidence];
        });

        const limited = suggestions.slice(0, limit);

        // Group by category for readability
        const byCategory: Record<string, EnrichmentSuggestion[]> = {};
        for (const s of limited) {
          if (!byCategory[s.category]) {
            byCategory[s.category] = [];
          }
          byCategory[s.category].push(s);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  tableId,
                  tableName: tableResult.table.name,
                  detectedFields: Object.entries(semanticToField).map(([type, field]) => ({
                    semanticType: type,
                    fieldId: field.fieldId,
                    fieldName: field.name,
                    confidence: field.confidence,
                  })),
                  suggestions: {
                    total: limited.length,
                    byCategory,
                  },
                  usage: {
                    description: 'Use the inputMapping directly with clay_create_enrichment',
                    example: limited[0] ? {
                      tool: 'clay_create_enrichment',
                      params: {
                        tableId,
                        enrichmentName: limited[0].enrichmentName,
                        fieldName: limited[0].displayName,
                        inputMapping: limited[0].inputMapping,
                      },
                    } : null,
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
              text: `Error suggesting enrichments: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_auto_enrich - Automatically apply enrichments with smart mapping
   */
  server.registerTool(
    'clay_auto_enrich',
    {
      title: 'Auto Enrich Table',
      description:
        'Automatically apply enrichments to a table with smart field mapping. Analyzes your table, finds the best enrichments, and creates them with correct input mappings. One-click enrichment setup.',
      inputSchema: {
        tableId: tableId(),
        goals: z
          .array(z.enum([
            'find-emails',
            'find-phones',
            'enrich-companies',
            'enrich-people',
            'validate-emails',
            'tech-stack',
            'funding',
            'news',
          ]))
          .describe('What you want to accomplish'),
        dryRun: z
          .boolean()
          .optional()
          .describe('If true, only show what would be created without actually creating. Default: false'),
      },
    },
    async ({ tableId, goals, dryRun = false }) => {
      try {
        // Get table fields
        const tableResult = await client.getTable(tableId as TableId) as unknown as {
          table: {
            id: string;
            name: string;
            fields: Array<{
              id: string;
              name: string;
              type: string;
            }>;
            gridViews: Array<{ id: string }>;
          };
        };

        const fields = tableResult.table.fields || [];
        const viewId = tableResult.table.gridViews?.[0]?.id;

        // Build semantic type map
        const semanticToField: Record<string, string> = {};
        for (const field of fields) {
          const semanticType = inferSemanticType(field.name);
          if (semanticType && !semanticToField[semanticType]) {
            semanticToField[semanticType] = field.id;
          }
        }

        const createdFields: Array<{ name: string; goal: string; fieldId?: string }> = [];
        const skipped: Array<{ goal: string; reason: string }> = [];

        // Process each goal
        for (const goal of goals) {
          switch (goal) {
            case 'find-emails': {
              // Need name (or first+last) and domain
              const hasName = semanticToField['full-name'] ||
                (semanticToField['first-name'] && semanticToField['last-name']);
              const hasDomain = semanticToField['company-domain'];

              if (!hasName || !hasDomain) {
                skipped.push({
                  goal: 'find-emails',
                  reason: `Missing ${!hasName ? 'name' : ''} ${!hasDomain ? 'domain' : ''}`.trim(),
                });
                continue;
              }

              if (!dryRun) {
                // Create email waterfall
                const inputMapping: { domain: string; firstName?: string; lastName?: string; fullName?: string } = {
                  domain: semanticToField['company-domain'],
                };
                if (semanticToField['full-name']) {
                  inputMapping.fullName = semanticToField['full-name'];
                } else {
                  inputMapping.firstName = semanticToField['first-name'];
                  inputMapping.lastName = semanticToField['last-name'];
                }

                // Use the email waterfall tool logic directly
                const emailFinders = await getProvidersByCategory('email-finders');
                const providerOrder = ['findymail', 'hunter', 'leadmagic', 'prospeo', 'dropcontact'];
                const waterfallConfigs: any[] = [];

                for (const providerName of providerOrder) {
                  const provider = emailFinders[providerName];
                  if (!provider) continue;

                  const inputsBinding: Array<{ name: string; formulaText: string }> = [];

                  // Map inputs
                  if (provider.inputFields?.includes('name') && inputMapping.fullName) {
                    inputsBinding.push({ name: 'name', formulaText: `{{${inputMapping.fullName}}}` });
                  } else if (provider.inputFields?.includes('name') && inputMapping.firstName && inputMapping.lastName) {
                    inputsBinding.push({
                      name: 'name',
                      formulaText: `{{${inputMapping.firstName}}} + " " + {{${inputMapping.lastName}}}`,
                    });
                  }
                  if (provider.inputFields?.includes('domain')) {
                    inputsBinding.push({ name: 'domain', formulaText: `{{${inputMapping.domain}}}` });
                  }

                  if (inputsBinding.length > 0) {
                    const resolved = resolveAuthAccount(provider, {});
                    waterfallConfigs.push({
                      type: 'actionConfig',
                      actionKey: provider.actionKey,
                      actionPackageId: provider.actionPackageId,
                      authAccountId: resolved.accountId,
                      inputsBinding,
                      attributePath: 'email',
                      name: provider.displayName || providerName,
                    });
                  }
                }

                if (waterfallConfigs.length > 0) {
                  const result = await client.createWaterfallField(
                    tableId as TableId,
                    'Work Email',
                    waterfallConfigs,
                    'DONT_RUN'
                  );
                  createdFields.push({
                    name: 'Work Email',
                    goal: 'find-emails',
                    fieldId: (result as any).field?.id,
                  });
                }
              } else {
                createdFields.push({ name: 'Work Email (waterfall)', goal: 'find-emails' });
              }
              break;
            }

            case 'find-phones': {
              const hasEmail = semanticToField['work-email'];
              const hasLinkedIn = semanticToField['person-linkedin-url'];

              if (!hasEmail && !hasLinkedIn) {
                skipped.push({
                  goal: 'find-phones',
                  reason: 'Missing email or LinkedIn URL',
                });
                continue;
              }

              if (!dryRun) {
                const phoneFinders = await getProvidersByCategory('phone-finders');
                const nymblr = Object.values(phoneFinders).find(p =>
                  p.actionKey.includes('nymblr') && p.actionKey.includes('mobile')
                );

                if (nymblr && hasEmail) {
                  const resolved = resolveAuthAccount(nymblr, {});
                  const result = await client.createEnrichmentField(
                    tableId as TableId,
                    'Mobile Phone',
                    {
                      actionKey: nymblr.actionKey,
                      actionPackageId: nymblr.actionPackageId,
                      authAccountId: resolved.accountId,
                      inputsBinding: [{ name: 'email', formulaText: `{{${hasEmail}}}` }],
                    }
                  );
                  createdFields.push({
                    name: 'Mobile Phone',
                    goal: 'find-phones',
                    fieldId: (result as any).field?.id,
                  });
                }
              } else {
                createdFields.push({ name: 'Mobile Phone', goal: 'find-phones' });
              }
              break;
            }

            case 'enrich-companies': {
              const hasDomain = semanticToField['company-domain'];
              if (!hasDomain) {
                skipped.push({ goal: 'enrich-companies', reason: 'Missing domain field' });
                continue;
              }

              if (!dryRun) {
                const companyProviders = await getProvidersByCategory('company-enrichment');
                const clayEnrich = Object.values(companyProviders).find(p =>
                  p.actionKey.includes('enrich-company') && p.actionKey.includes('domain')
                );

                if (clayEnrich) {
                  const resolved = resolveAuthAccount(clayEnrich, {});
                  const result = await client.createEnrichmentField(
                    tableId as TableId,
                    'Company Info',
                    {
                      actionKey: clayEnrich.actionKey,
                      actionPackageId: clayEnrich.actionPackageId,
                      authAccountId: resolved.accountId,
                      inputsBinding: [{ name: 'domain', formulaText: `{{${hasDomain}}}` }],
                    }
                  );
                  createdFields.push({
                    name: 'Company Info',
                    goal: 'enrich-companies',
                    fieldId: (result as any).field?.id,
                  });
                }
              } else {
                createdFields.push({ name: 'Company Info', goal: 'enrich-companies' });
              }
              break;
            }

            case 'enrich-people': {
              const hasEmail = semanticToField['work-email'];
              if (!hasEmail) {
                skipped.push({ goal: 'enrich-people', reason: 'Missing email field' });
                continue;
              }

              if (!dryRun) {
                const personProviders = await getProvidersByCategory('person-enrichment');
                const apollo = Object.values(personProviders).find(p =>
                  p.actionKey.includes('apollo') && p.actionKey.includes('enrich-person')
                );

                if (apollo) {
                  const resolved = resolveAuthAccount(apollo, {});
                  const result = await client.createEnrichmentField(
                    tableId as TableId,
                    'Person Info',
                    {
                      actionKey: apollo.actionKey,
                      actionPackageId: apollo.actionPackageId,
                      authAccountId: resolved.accountId,
                      inputsBinding: [{ name: 'email', formulaText: `{{${hasEmail}}}` }],
                    }
                  );
                  createdFields.push({
                    name: 'Person Info',
                    goal: 'enrich-people',
                    fieldId: (result as any).field?.id,
                  });
                }
              } else {
                createdFields.push({ name: 'Person Info', goal: 'enrich-people' });
              }
              break;
            }

            case 'validate-emails': {
              const hasEmail = semanticToField['work-email'];
              if (!hasEmail) {
                skipped.push({ goal: 'validate-emails', reason: 'Missing email field' });
                continue;
              }

              if (!dryRun) {
                const emailFinders = await getProvidersByCategory('email-finders');
                const validator = Object.values(emailFinders).find(p =>
                  p.actionKey.includes('validate') || p.actionKey.includes('verify')
                );

                if (validator) {
                  const resolved = resolveAuthAccount(validator, {});
                  const result = await client.createEnrichmentField(
                    tableId as TableId,
                    'Email Valid',
                    {
                      actionKey: validator.actionKey,
                      actionPackageId: validator.actionPackageId,
                      authAccountId: resolved.accountId,
                      inputsBinding: [{ name: 'email', formulaText: `{{${hasEmail}}}` }],
                    }
                  );
                  createdFields.push({
                    name: 'Email Valid',
                    goal: 'validate-emails',
                    fieldId: (result as any).field?.id,
                  });
                }
              } else {
                createdFields.push({ name: 'Email Valid', goal: 'validate-emails' });
              }
              break;
            }

            case 'tech-stack': {
              const hasDomain = semanticToField['company-domain'];
              if (!hasDomain) {
                skipped.push({ goal: 'tech-stack', reason: 'Missing domain field' });
                continue;
              }

              if (!dryRun) {
                const techProviders = await getProvidersByCategory('technographics');
                // Find tech stack provider - lookup-technology-stack expects 'url' input
                const techProvider = Object.values(techProviders).find(p =>
                  p.actionKey.includes('technology-stack')
                );

                if (techProvider) {
                  // Determine the correct input name - tech stack providers use 'url' not 'domain'
                  const inputName = techProvider.inputs?.find(i =>
                    i.name === 'url' || i.name === 'domain' || i.name === 'company_domain'
                  )?.name || 'url';

                  const resolved = resolveAuthAccount(techProvider, {});
                  const result = await client.createEnrichmentField(
                    tableId as TableId,
                    'Tech Stack',
                    {
                      actionKey: techProvider.actionKey,
                      actionPackageId: techProvider.actionPackageId,
                      authAccountId: resolved.accountId,
                      inputsBinding: [{ name: inputName, formulaText: `{{${hasDomain}}}` }],
                    }
                  );
                  createdFields.push({
                    name: 'Tech Stack',
                    goal: 'tech-stack',
                    fieldId: (result as any).field?.id,
                  });
                } else {
                  skipped.push({ goal: 'tech-stack', reason: 'No tech stack provider found in registry' });
                }
              } else {
                createdFields.push({ name: 'Tech Stack', goal: 'tech-stack' });
              }
              break;
            }

            case 'funding': {
              const hasDomain = semanticToField['company-domain'];
              if (!hasDomain) {
                skipped.push({ goal: 'funding', reason: 'Missing domain field' });
                continue;
              }

              if (!dryRun) {
                // Funding providers are in 'fundraising' category
                const fundingProviders = await getProvidersByCategory('fundraising');
                // Prefer crunchbase basic info, then dealroom
                const fundingProvider = Object.values(fundingProviders).find(p =>
                  p.actionKey === 'crunchbase-enrich-company-basic-information'
                ) || Object.values(fundingProviders).find(p =>
                  p.actionKey.includes('crunchbase') && p.actionKey.includes('funding')
                ) || Object.values(fundingProviders).find(p =>
                  p.actionKey.includes('dealroom') && p.actionKey.includes('fundraising')
                );

                if (fundingProvider) {
                  // Determine the correct input name from provider config
                  const inputName = fundingProvider.inputs?.find(i =>
                    i.name === 'company_domain' || i.name === 'domain' || i.name === 'url'
                  )?.name || 'company_domain';

                  const resolved = resolveAuthAccount(fundingProvider, {});
                  const result = await client.createEnrichmentField(
                    tableId as TableId,
                    'Funding Info',
                    {
                      actionKey: fundingProvider.actionKey,
                      actionPackageId: fundingProvider.actionPackageId,
                      authAccountId: resolved.accountId,
                      inputsBinding: [{ name: inputName, formulaText: `{{${hasDomain}}}` }],
                    }
                  );
                  createdFields.push({
                    name: 'Funding Info',
                    goal: 'funding',
                    fieldId: (result as any).field?.id,
                  });
                } else {
                  skipped.push({ goal: 'funding', reason: 'No funding provider found in registry' });
                }
              } else {
                createdFields.push({ name: 'Funding Info', goal: 'funding' });
              }
              break;
            }

            case 'news': {
              const hasDomain = semanticToField['company-domain'];
              const hasCompanyName = semanticToField['company-name'];
              if (!hasDomain && !hasCompanyName) {
                skipped.push({ goal: 'news', reason: 'Missing domain or company name' });
                continue;
              }

              if (!dryRun) {
                // Use Claygent for news research
                const prompt = hasCompanyName
                  ? `Find recent news articles about {{${hasCompanyName}}}. Return the 3 most recent news items with title, date, summary, and source URL.`
                  : `Find recent news articles about the company at {{${hasDomain}}}. Return the 3 most recent news items with title, date, summary, and source URL.`;

                const result = await client.createClaygentField(
                  tableId as TableId,
                  'Recent News',
                  prompt,
                  {
                    model: 'clay-neon',
                    outputFields: {
                      news_items: {
                        type: 'array',
                        description: 'List of recent news items',
                      },
                    },
                    viewId: viewId as any,
                  }
                );
                createdFields.push({
                  name: 'Recent News',
                  goal: 'news',
                  fieldId: (result as any).field?.id,
                });
              } else {
                createdFields.push({ name: 'Recent News (Claygent)', goal: 'news' });
              }
              break;
            }
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  tableId,
                  tableName: tableResult.table.name,
                  dryRun,
                  created: createdFields,
                  skipped,
                  detectedFields: Object.entries(semanticToField).map(([type, fieldId]) => ({
                    semanticType: type,
                    fieldId,
                  })),
                  summary: dryRun
                    ? `Would create ${createdFields.length} fields. Run again with dryRun: false to apply.`
                    : `Created ${createdFields.length} enrichment fields. Run enrichments with clay_run_enrichment.`,
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
              text: `Error auto-enriching table: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_build_input_mapping - Generate input mapping for any enrichment
   */
  server.registerTool(
    'clay_build_input_mapping',
    {
      title: 'Build Input Mapping',
      description:
        'Automatically generate the inputMapping for any enrichment based on your table fields. Use this when clay_suggest_enrichments gives partial results or you need to verify mappings.',
      inputSchema: {
        tableId: tableId(),
        enrichmentName: z.string().describe('Enrichment action key (e.g., "apollo-enrich-person")'),
      },
    },
    async ({ tableId, enrichmentName }) => {
      try {
        // Get table fields
        const tableResult = await client.getTable(tableId as TableId) as unknown as {
          table: {
            id: string;
            name: string;
            fields: Array<{
              id: string;
              name: string;
              type: string;
            }>;
          };
        };

        const fields = tableResult.table.fields || [];

        // Get enrichment schema
        const registry = await getRegistry();
        let enrichment: any = null;
        let category = '';

        for (const [cat, providers] of Object.entries(registry)) {
          if (cat === '_meta') continue;
          if ((providers as any)[enrichmentName]) {
            enrichment = (providers as any)[enrichmentName];
            category = cat;
            break;
          }
        }

        if (!enrichment) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Enrichment "${enrichmentName}" not found in registry. Use clay_list_enrichments to see available options.`,
              },
            ],
            isError: true,
          };
        }

        // Build mapping
        const mapping: Record<string, { fieldId: string; fieldName: string; confidence: string }> = {};
        const unmapped: Array<{ inputName: string; required: boolean; semanticType: string | null }> = [];

        for (const input of enrichment.inputs || []) {
          const inputName = input.name;
          const semanticType = input.semanticType;
          let matched = false;

          // Try to find matching field
          for (const field of fields) {
            const normalizedFieldName = field.name.toLowerCase().replace(/[_-]/g, ' ').trim();
            const normalizedInputName = inputName.toLowerCase().replace(/[_-]/g, ' ').trim();

            // Check semantic type match
            if (semanticType) {
              const fieldSemantic = inferSemanticType(field.name);
              if (fieldSemantic === semanticType) {
                mapping[inputName] = {
                  fieldId: field.id,
                  fieldName: field.name,
                  confidence: 'high (semantic match)',
                };
                matched = true;
                break;
              }
            }

            // Check name match
            if (!matched) {
              if (normalizedFieldName === normalizedInputName ||
                  normalizedFieldName.includes(normalizedInputName) ||
                  normalizedInputName.includes(normalizedFieldName)) {
                mapping[inputName] = {
                  fieldId: field.id,
                  fieldName: field.name,
                  confidence: 'medium (name match)',
                };
                matched = true;
                break;
              }
            }
          }

          if (!matched) {
            unmapped.push({
              inputName,
              required: input.required,
              semanticType,
            });
          }
        }

        // Known literal inputs for specific action keys
        const KNOWN_LITERAL_INPUTS: Record<string, Set<string>> = {
          'lookup-field-in-other-table-new-ui': new Set(['tableId', 'targetColumn', 'filterOperator']),
        };

        const knownLiterals = KNOWN_LITERAL_INPUTS[enrichmentName];

        // Generate ready-to-use inputMapping and literalInputs
        const inputMapping: Record<string, string> = {};
        const literalInputs: Record<string, string> = {};
        for (const [inputName, match] of Object.entries(mapping)) {
          if (knownLiterals?.has(inputName)) {
            // This input should be a literal value, not a field reference
            // Use the field name as a hint that user needs to provide a real value
            literalInputs[inputName] = `<provide ${inputName} value>`;
          } else {
            inputMapping[inputName] = match.fieldId;
          }
        }

        const canCreate = !unmapped.some(u => u.required);

        // Build usage params - include literalInputs only if non-empty
        const usageParams: Record<string, any> = {
          tableId,
          enrichmentName,
          fieldName: enrichment.displayName || enrichmentName,
          inputMapping,
        };
        if (Object.keys(literalInputs).length > 0) {
          usageParams.literalInputs = literalInputs;
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  enrichmentName,
                  category,
                  displayName: enrichment.displayName,
                  canCreate,
                  mapping: Object.fromEntries(
                    Object.entries(mapping).map(([k, v]) => [k, v])
                  ),
                  unmapped,
                  readyToUse: {
                    inputMapping,
                    ...(Object.keys(literalInputs).length > 0 ? { literalInputs } : {}),
                  },
                  usage: canCreate
                    ? {
                        tool: 'clay_create_enrichment',
                        params: usageParams,
                      }
                    : {
                        error: 'Missing required inputs',
                        missingRequired: unmapped.filter(u => u.required).map(u => u.inputName),
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
              text: `Error building input mapping: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

/**
 * Workflow Tools
 *
 * High-level tools that combine multiple operations for common workflows.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { ClayClient } from '../client.js';
import type { TableId, ViewId, FieldId } from '../types/clay.js';
import { getProvidersByCategory, resolveAuthAccount } from '../enrichments/index.js';
import { tableId, fieldId, fieldIdSchema, viewId, nonEmptyString, workspaceId, workbookId, authAccountId } from '../validation.js';

// Slack config
const SLACK_CONFIG = {
  sendMessage: {
    actionKey: 'send-message-to-channel-botname',
    actionPackageId: 'ad402586-2a3d-4e0e-9dac-5d5e5f6a7b8c',
  },
  sendScheduled: {
    actionKey: 'slack-send-message-to-channel-botname-scheduled',
    actionPackageId: 'ad402586-2a3d-4e0e-9dac-5d5e5f6a7b8c',
  },
};

// Job change signal config
const JOB_CHANGE_CONFIG = {
  actionKey: 'enrich-person-with-mixrank-v2-job-change-signal',
  actionPackageId: '3cd9facd-1234-5678-9abc-def012345678', // Will look up actual
};

// AI model options for prompts
const AI_MODELS = ['gpt-4.1-mini', 'claude-3-5-sonnet', 'o4-mini'] as const;

export function registerWorkflowTools(
  server: McpServer,
  client: ClayClient
): void {
  /**
   * clay_create_view - Create a new view with filters
   */
  server.registerTool(
    'clay_create_view',
    {
      title: 'Create View',
      description:
        'Create a new filtered view on a table. Views let you see subsets of records based on filter criteria.',
      inputSchema: {
        tableId: tableId(),
        viewName: nonEmptyString.describe('Name for the new view'),
        filters: z
          .array(
            z.object({
              fieldId: fieldId('Field ID to filter on (f_xxx format)'),
              operator: z
                .enum(['EQUAL', 'NOT_EQUAL', 'CONTAIN', 'NOT_CONTAIN', 'EMPTY', 'NOT_EMPTY', 'HAS_ERROR', 'RESULTS', 'NO_RESULTS'])
                .describe('Filter operator'),
              value: z.string().optional().describe('Filter value (not needed for EMPTY, NOT_EMPTY, etc.)'),
            })
          )
          .optional()
          .describe('Filter conditions for the view'),
        combinationMode: z
          .enum(['AND', 'OR'])
          .optional()
          .describe('How to combine filters. Default: AND'),
      },
    },
    async ({ tableId, viewName, filters, combinationMode = 'AND' }) => {
      try {
        // First duplicate the default view to create a new one
        const tableResult = await client.getTable(tableId as TableId) as unknown as {
          table: { gridViews: Array<{ id: string }> };
        };
        const defaultViewId = tableResult.table.gridViews?.[0]?.id as ViewId;

        if (!defaultViewId) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: No default view found to duplicate',
              },
            ],
            isError: true,
          };
        }

        // Duplicate the view
        const newView = await client.duplicateView(tableId as TableId, defaultViewId);
        const newViewId = (newView as any).view?.id || (newView as any).id;

        // Rename the view
        await client.request('PATCH', `/tables/${tableId}/views/${newViewId}`, {
          name: viewName,
        });

        // Apply filters if provided
        if (filters && filters.length > 0) {
          const filterItems = filters.map((f) => ({
            type: f.operator,
            fieldId: f.fieldId as FieldId,
            ...(f.value !== undefined ? { value: f.value } : {}),
          }));

          await client.updateViewFilter(
            tableId as TableId,
            newViewId as ViewId,
            { items: filterItems, combinationMode }
          );
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  viewId: newViewId,
                  viewName,
                  filters: filters || [],
                  message: `Created view "${viewName}"${filters?.length ? ` with ${filters.length} filters` : ''}`,
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
              text: `Error creating view: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_write_personalized_email - Generate personalized email copy
   */
  server.registerTool(
    'clay_write_personalized_email',
    {
      title: 'Write Personalized Email',
      description:
        'Create an AI field that generates personalized email copy based on prospect data. Great for cold outreach.',
      inputSchema: {
        tableId: tableId(),
        fieldName: nonEmptyString.describe('Name for the email field'),
        emailType: z
          .enum(['cold_outreach', 'follow_up', 'intro_request', 'meeting_request', 'custom'])
          .describe('Type of email to generate'),
        companyFieldId: fieldId('Field ID with company name').optional(),
        personFieldId: fieldId('Field ID with person name').optional(),
        roleFieldId: fieldId('Field ID with job title').optional(),
        customContext: z
          .string()
          .optional()
          .describe('Additional context for email generation (your product, value prop, etc.)'),
        tone: z
          .enum(['professional', 'casual', 'friendly', 'direct'])
          .optional()
          .describe('Tone of the email. Default: professional'),
      },
    },
    async ({ tableId, fieldName, emailType, companyFieldId, personFieldId, roleFieldId, customContext, tone = 'professional' }) => {
      try {
        const emailTemplates: Record<string, string> = {
          cold_outreach: `Write a ${tone} cold outreach email to {personField} at {companyField}.
Their role is {roleField}.
${customContext ? `Context: ${customContext}` : ''}

Keep it:
- Under 100 words
- Focused on value to them
- With a clear, low-friction CTA
- No generic compliments

Return just the email body, no subject line.`,

          follow_up: `Write a ${tone} follow-up email to {personField} at {companyField}.
${customContext ? `Context: ${customContext}` : ''}

Keep it:
- Brief (under 50 words)
- Reference previous outreach
- Add new value or insight
- Simple CTA`,

          intro_request: `Write a ${tone} email requesting an intro to {personField} ({roleField}) at {companyField}.
${customContext ? `Context: ${customContext}` : ''}

Keep it:
- Clear on why you want to connect
- Easy for the recipient to forward
- Under 75 words`,

          meeting_request: `Write a ${tone} email requesting a meeting with {personField} at {companyField}.
${customContext ? `Context: ${customContext}` : ''}

Keep it:
- Specific about meeting purpose
- Suggest times or offer to work around their schedule
- Under 75 words`,

          custom: customContext || 'Write a personalized email based on the available data.',
        };

        let prompt = emailTemplates[emailType] || emailTemplates.custom;

        // Replace field references
        if (personFieldId) {
          prompt = prompt.replace('{personField}', `{${personFieldId}}`);
        } else {
          prompt = prompt.replace('{personField}', 'the prospect');
        }
        if (companyFieldId) {
          prompt = prompt.replace('{companyField}', `{${companyFieldId}}`);
        } else {
          prompt = prompt.replace(' at {companyField}', '');
        }
        if (roleFieldId) {
          prompt = prompt.replace('{roleField}', `{${roleFieldId}}`);
        } else {
          prompt = prompt.replace('Their role is {roleField}.', '');
          prompt = prompt.replace('({roleField})', '');
        }

        // Create AI field
        const field = await client.createAIField(
          tableId as TableId,
          fieldName,
          prompt,
          { model: 'gpt-4.1-mini' }
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  fieldId: (field as any).field?.id || (field as any).id,
                  emailType,
                  tone,
                  message: `Created personalized email field "${fieldName}"`,
                  nextSteps: [
                    'Run the field on your records to generate emails',
                    'Review and edit generated emails before sending',
                    'Use clay_add_to_sequence to add to outreach sequences',
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
              text: `Error creating email field: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_research_company - Use Claygent to research a company
   */
  server.registerTool(
    'clay_research_company',
    {
      title: 'Research Company',
      description:
        'Create a Claygent field that thoroughly researches a company - finding recent news, key people, competitive landscape, etc.',
      inputSchema: {
        tableId: tableId(),
        fieldName: z.string().describe('Name for the research field'),
        domainFieldId: z
          .string()
          .optional()
          .describe('Field ID with company domain'),
        companyFieldId: z
          .string()
          .optional()
          .describe('Field ID with company name'),
        researchFocus: z
          .array(z.enum(['overview', 'news', 'competitors', 'key_people', 'products', 'culture', 'challenges']))
          .optional()
          .describe('What to focus research on. Default: overview'),
      },
    },
    async ({ tableId, fieldName, domainFieldId, companyFieldId, researchFocus = ['overview'] }) => {
      try {
        if (!domainFieldId && !companyFieldId) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: Must provide either domainFieldId or companyFieldId',
              },
            ],
            isError: true,
          };
        }

        const companyRef = domainFieldId ? `{${domainFieldId}}` : `{${companyFieldId}}`;

        const focusPrompts: Record<string, string> = {
          overview: 'Company overview: what they do, target market, size, and stage',
          news: 'Recent news and announcements (last 3 months)',
          competitors: 'Main competitors and competitive positioning',
          key_people: 'Key executives and decision makers',
          products: 'Main products/services and pricing model',
          culture: 'Company culture, values, and employee reviews',
          challenges: 'Current challenges they might be facing',
        };

        const focusItems = researchFocus.map((f) => focusPrompts[f]).join('\n- ');

        const prompt = `Research ${companyRef} and provide:
- ${focusItems}

Be specific and cite sources where possible. Focus on information that would be useful for sales outreach.`;

        const outputFields: Record<string, { type: string; description: string }> = {
          summary: { type: 'string', description: 'One paragraph company summary' },
        };

        if (researchFocus.includes('news')) {
          outputFields.recent_news = { type: 'string', description: 'Recent news and announcements' };
        }
        if (researchFocus.includes('competitors')) {
          outputFields.competitors = { type: 'string', description: 'Main competitors' };
        }
        if (researchFocus.includes('key_people')) {
          outputFields.key_people = { type: 'string', description: 'Key executives' };
        }
        if (researchFocus.includes('challenges')) {
          outputFields.challenges = { type: 'string', description: 'Potential challenges' };
        }

        const field = await client.createClaygentField(
          tableId as TableId,
          fieldName,
          prompt,
          { outputFields }
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  fieldId: (field as any).field?.id || (field as any).id,
                  researchFocus,
                  message: `Created company research field "${fieldName}"`,
                  outputs: Object.keys(outputFields),
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
              text: `Error creating research field: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_find_similar_companies - Find lookalike companies
   */
  server.registerTool(
    'clay_find_similar_companies',
    {
      title: 'Find Similar Companies',
      description:
        'Create a Claygent field that finds companies similar to the input company - great for account expansion.',
      inputSchema: {
        tableId: tableId(),
        fieldName: z.string().describe('Name for the field'),
        domainFieldId: z
          .string()
          .optional()
          .describe('Field ID with company domain'),
        companyFieldId: z
          .string()
          .optional()
          .describe('Field ID with company name'),
        similarityFactors: z
          .array(z.enum(['industry', 'size', 'tech_stack', 'funding_stage', 'geography', 'business_model']))
          .optional()
          .describe('Factors to match on. Default: industry, size'),
        count: z
          .number()
          .optional()
          .describe('Number of similar companies to find. Default: 5'),
      },
    },
    async ({ tableId, fieldName, domainFieldId, companyFieldId, similarityFactors = ['industry', 'size'], count = 5 }) => {
      try {
        if (!domainFieldId && !companyFieldId) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: Must provide either domainFieldId or companyFieldId',
              },
            ],
            isError: true,
          };
        }

        const companyRef = domainFieldId ? `{${domainFieldId}}` : `{${companyFieldId}}`;
        const factors = similarityFactors.join(', ');

        const prompt = `Find ${count} companies similar to ${companyRef}.

Match on: ${factors}

For each company provide:
- Company name
- Domain
- Why they're similar
- Key difference

Focus on companies that would be good sales targets if this company is already a customer.`;

        const field = await client.createClaygentField(
          tableId as TableId,
          fieldName,
          prompt,
          {
            outputFields: {
              similar_companies: { type: 'array', description: 'List of similar companies with details' },
            },
          }
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  fieldId: (field as any).field?.id || (field as any).id,
                  similarityFactors,
                  count,
                  message: `Created similar companies field "${fieldName}"`,
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
              text: `Error creating similar companies field: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );


  /**
   * clay_full_lead_workflow - Create a complete lead gen workflow in one call
   */
  server.registerTool(
    'clay_full_lead_workflow',
    {
      title: 'Full Lead Workflow',
      description:
        'Create a complete lead generation workflow: source companies/people → enrich → find emails → validate. Creates all necessary fields in one call.',
      inputSchema: {
        tableId: tableId('Table ID to add workflow to (t_xxx format)'),
        workflowType: z
          .enum(['company_to_leads', 'enrich_people', 'enrich_companies'])
          .describe('Type of workflow to create'),
        domainFieldId: z
          .string()
          .optional()
          .describe('Field ID for company domains (for company workflows)'),
        emailFieldId: z
          .string()
          .optional()
          .describe('Field ID for emails (for people workflows)'),
        linkedinFieldId: z
          .string()
          .optional()
          .describe('Field ID for LinkedIn URLs'),
        firstNameFieldId: z
          .string()
          .optional()
          .describe('Field ID for first names'),
        lastNameFieldId: z
          .string()
          .optional()
          .describe('Field ID for last names'),
        includePhones: z
          .boolean()
          .optional()
          .describe('Include phone number enrichment. Default: false'),
        includeValidation: z
          .boolean()
          .optional()
          .describe('Include email validation. Default: true'),
      },
    },
    async ({
      tableId,
      workflowType,
      domainFieldId,
      emailFieldId,
      linkedinFieldId,
      firstNameFieldId,
      lastNameFieldId,
      includePhones = false,
      includeValidation = true,
    }) => {
      try {
        const createdFields: Array<{ name: string; id: string; type: string }> = [];
        const emailFinders = await getProvidersByCategory('email-finders');
        const personProviders = await getProvidersByCategory('person-enrichment');
        const companyProviders = await getProvidersByCategory('company-enrichment');
        const phoneFinders = await getProvidersByCategory('phone-finders');

        // Get table for view ID
        const tableResult = await client.getTable(tableId as TableId) as unknown as {
          table: { gridViews: Array<{ id: string }> };
        };
        const viewId = tableResult.table.gridViews?.[0]?.id;

        if (workflowType === 'company_to_leads' && domainFieldId) {
          // Step 1: Company enrichment
          const clayCo = companyProviders['enrich-company-from-domain'];
          if (clayCo) {
            const field = await client.createEnrichmentField(tableId as TableId, 'Company Info', {
              actionKey: clayCo.actionKey,
              actionPackageId: clayCo.actionPackageId,
              authAccountId: resolveAuthAccount(clayCo, {}).accountId,
              inputsBinding: [{ name: 'domain', formulaText: `{{${domainFieldId}}}` }],
            });
            createdFields.push({ name: 'Company Info', id: (field as any).field?.id || (field as any).id, type: 'enrichment' });
          }

          // Step 2: Find decision makers (Apollo)
          const apollo = personProviders['apollo-oauth-find-people'];
          if (apollo) {
            const field = await client.createEnrichmentField(tableId as TableId, 'Decision Makers', {
              actionKey: apollo.actionKey,
              actionPackageId: apollo.actionPackageId,
              authAccountId: resolveAuthAccount(apollo, {}).accountId,
              inputsBinding: [
                { name: 'q_organization_domains', formulaText: `{{${domainFieldId}}}` },
                { name: 'person_titles', formulaText: '["CEO", "CTO", "VP of Sales", "Head of Marketing"]' },
                { name: 'limit', formulaText: '5' },
              ],
            });
            createdFields.push({ name: 'Decision Makers', id: (field as any).field?.id || (field as any).id, type: 'people-finder' });
          }
        }

        if (workflowType === 'enrich_people' && emailFieldId) {
          // Person enrichment from email
          const apollo = personProviders['apollo-oauth-enrich-person'] || personProviders['apollo-enrich-person'];
          if (apollo) {
            const field = await client.createEnrichmentField(tableId as TableId, 'Person Info', {
              actionKey: apollo.actionKey,
              actionPackageId: apollo.actionPackageId,
              authAccountId: resolveAuthAccount(apollo, {}).accountId,
              inputsBinding: [{ name: 'email', formulaText: `{{${emailFieldId}}}` }],
            });
            createdFields.push({ name: 'Person Info', id: (field as any).field?.id || (field as any).id, type: 'enrichment' });
          }

          // Email validation
          if (includeValidation) {
            const validator = emailFinders['findymail-validate-email'] || emailFinders['neverbounce-validate-email'];
            if (validator) {
              const field = await client.createEnrichmentField(tableId as TableId, 'Email Valid', {
                actionKey: validator.actionKey,
                actionPackageId: validator.actionPackageId,
                authAccountId: resolveAuthAccount(validator, {}).accountId,
                inputsBinding: [{ name: 'email', formulaText: `{{${emailFieldId}}}` }],
              });
              createdFields.push({ name: 'Email Valid', id: (field as any).field?.id || (field as any).id, type: 'validation' });
            }
          }

          // Phone enrichment
          if (includePhones) {
            const phoneFinder = phoneFinders['nymblr-find-mobile'];
            if (phoneFinder) {
              const field = await client.createEnrichmentField(tableId as TableId, 'Mobile Phone', {
                actionKey: phoneFinder.actionKey,
                actionPackageId: phoneFinder.actionPackageId,
                authAccountId: resolveAuthAccount(phoneFinder, {}).accountId,
                inputsBinding: [{ name: 'email', formulaText: `{{${emailFieldId}}}` }],
              });
              createdFields.push({ name: 'Mobile Phone', id: (field as any).field?.id || (field as any).id, type: 'phone' });
            }
          }
        }

        if (workflowType === 'enrich_companies' && domainFieldId) {
          // Full company enrichment suite
          const clayCo = companyProviders['enrich-company-from-domain'];
          if (clayCo) {
            const field = await client.createEnrichmentField(tableId as TableId, 'Company Info', {
              actionKey: clayCo.actionKey,
              actionPackageId: clayCo.actionPackageId,
              authAccountId: resolveAuthAccount(clayCo, {}).accountId,
              inputsBinding: [{ name: 'domain', formulaText: `{{${domainFieldId}}}` }],
            });
            createdFields.push({ name: 'Company Info', id: (field as any).field?.id || (field as any).id, type: 'enrichment' });
          }

          // Tech stack
          const techProviders = await getProvidersByCategory('technographics');
          const builtwith = techProviders['builtwith-lookup-domain'] || techProviders['builtwith-lookup-technologies'];
          if (builtwith) {
            const field = await client.createEnrichmentField(tableId as TableId, 'Tech Stack', {
              actionKey: builtwith.actionKey,
              actionPackageId: builtwith.actionPackageId,
              authAccountId: resolveAuthAccount(builtwith, {}).accountId,
              inputsBinding: [{ name: 'domain', formulaText: `{{${domainFieldId}}}` }],
            });
            createdFields.push({ name: 'Tech Stack', id: (field as any).field?.id || (field as any).id, type: 'technographics' });
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  workflow: workflowType,
                  fieldsCreated: createdFields,
                  message: `Created ${createdFields.length} fields for ${workflowType} workflow`,
                  nextSteps: [
                    'Fields will auto-run based on table settings',
                    'Or use clay_run_enrichment to run manually',
                    'Add CRM push with clay_push_to_hubspot or clay_push_to_salesforce',
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
              text: `Error creating workflow: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_find_job_changes - Detect job changes for contacts
   */
  server.registerTool(
    'clay_find_job_changes',
    {
      title: 'Find Job Changes',
      description:
        'Create a job change detection field. Identifies when contacts have changed jobs - great for re-engagement campaigns.',
      inputSchema: {
        tableId: tableId(),
        fieldName: z.string().describe('Name for the job change field'),
        emailFieldId: z
          .string()
          .optional()
          .describe('Field ID containing email addresses'),
        linkedinFieldId: z
          .string()
          .optional()
          .describe('Field ID containing LinkedIn URLs'),
        fullNameFieldId: z
          .string()
          .optional()
          .describe('Field ID containing full names'),
        companyFieldId: z
          .string()
          .optional()
          .describe('Field ID containing current/known company'),
      },
    },
    async ({ tableId, fieldName, emailFieldId, linkedinFieldId, fullNameFieldId, companyFieldId }) => {
      try {
        const personProviders = await getProvidersByCategory('person-enrichment');

        // Look for job change specific provider
        const jobChangeProvider = personProviders['enrich-person-with-mixrank-v2-job-change-signal'];

        if (!jobChangeProvider) {
          // Fallback to general person enrichment that includes job data
          const apollo = personProviders['apollo-oauth-enrich-person'] || personProviders['apollo-enrich-person'];
          if (!apollo) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: 'Error: No job change or person enrichment provider found in registry',
                },
              ],
              isError: true,
            };
          }

          // Use Apollo with email
          if (!emailFieldId) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: 'Error: emailFieldId required for job change detection',
                },
              ],
              isError: true,
            };
          }

          const field = await client.createEnrichmentField(tableId as TableId, fieldName, {
            actionKey: apollo.actionKey,
            actionPackageId: apollo.actionPackageId,
            authAccountId: resolveAuthAccount(apollo, {}).accountId,
            inputsBinding: [{ name: 'email', formulaText: `{{${emailFieldId}}}` }],
          });

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    success: true,
                    fieldId: (field as any).field?.id || (field as any).id,
                    provider: 'Apollo (person enrichment)',
                    message: `Created job detection field "${fieldName}" using Apollo person enrichment`,
                    note: 'Compare current job title/company with your records to detect changes',
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // Use dedicated job change provider
        const inputsBinding: Array<{ name: string; formulaText: string }> = [];

        if (emailFieldId) {
          inputsBinding.push({ name: 'email', formulaText: `{{${emailFieldId}}}` });
        }
        if (linkedinFieldId) {
          inputsBinding.push({ name: 'linkedin_url', formulaText: `{{${linkedinFieldId}}}` });
        }
        if (fullNameFieldId) {
          inputsBinding.push({ name: 'full_name', formulaText: `{{${fullNameFieldId}}}` });
        }
        if (companyFieldId) {
          inputsBinding.push({ name: 'company', formulaText: `{{${companyFieldId}}}` });
        }

        if (inputsBinding.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: Must provide at least one identifier (email, LinkedIn, or name+company)',
              },
            ],
            isError: true,
          };
        }

        const field = await client.createEnrichmentField(tableId as TableId, fieldName, {
          actionKey: jobChangeProvider.actionKey,
          actionPackageId: jobChangeProvider.actionPackageId,
          authAccountId: resolveAuthAccount(jobChangeProvider, {}).accountId,
          inputsBinding,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  fieldId: (field as any).field?.id || (field as any).id,
                  provider: 'MixRank Job Change Signal',
                  message: `Created job change detection field "${fieldName}"`,
                  outputs: ['has_changed_jobs', 'new_company', 'new_title', 'change_date'],
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
              text: `Error creating job change field: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_send_slack_notification - Send Slack notifications for leads
   */
  server.registerTool(
    'clay_send_slack_notification',
    {
      title: 'Send Slack Notification',
      description:
        'Create a Slack notification field to alert your team about new leads or important events. Requires Slack OAuth in Clay.',
      inputSchema: {
        tableId: tableId(),
        fieldName: z.string().describe('Name for the Slack field'),
        channel: z.string().describe('Slack channel name (without #) or channel ID'),
        messageTemplate: z
          .string()
          .describe(
            'Message template. Use {{f_xxx}} for field values. Example: "New lead: {{f_name}} from {{f_company}}"'
          ),
        authAccountId: z
          .string()
          .optional()
          .describe('Slack OAuth account ID (aa_xxx). Get from clay_list_integrations.'),
      },
    },
    async ({ tableId, fieldName, channel, messageTemplate, authAccountId }) => {
      try {
        const messagingProviders = await getProvidersByCategory('messaging');
        const slackProvider = messagingProviders['send-message-to-channel-botname'] ||
                            messagingProviders['slack-send-message-to-channel-botname-scheduled'] ||
                            messagingProviders['slack-reduced-scope-send-message'];

        if (!slackProvider) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: Slack messaging provider not found in registry',
              },
            ],
            isError: true,
          };
        }

        const inputsBinding: Array<{ name: string; formulaText: string }> = [
          { name: 'channel', formulaText: `"${channel}"` },
          { name: 'message', formulaText: `"${messageTemplate.replace(/"/g, '\\"')}"` },
        ];

        const field = await client.createEnrichmentField(tableId as TableId, fieldName, {
          actionKey: slackProvider.actionKey,
          actionPackageId: slackProvider.actionPackageId,
          authAccountId: authAccountId || undefined,
          inputsBinding,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  fieldId: (field as any).field?.id || (field as any).id,
                  channel,
                  message: `Created Slack notification field "${fieldName}"`,
                  note: authAccountId
                    ? 'Using provided Slack account'
                    : 'Connect Slack OAuth in Clay to enable notifications',
                  nextSteps: [
                    'Connect Slack OAuth in Clay if not done',
                    'Run enrichment to send notifications',
                    'Use filters to only notify on specific conditions',
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
              text: `Error creating Slack field: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_lookup_company - Quick company lookup by domain
   */
  server.registerTool(
    'clay_lookup_company',
    {
      title: 'Lookup Company',
      description:
        'Add a company lookup/enrichment field that returns key company data from a domain.',
      inputSchema: {
        tableId: tableId(),
        domainFieldId: fieldId('Field ID containing company domains (f_xxx format)'),
        fieldName: z
          .string()
          .optional()
          .describe('Name for the field. Default: "Company Lookup"'),
      },
    },
    async ({ tableId, domainFieldId, fieldName = 'Company Lookup' }) => {
      try {
        const companyProviders = await getProvidersByCategory('company-enrichment');
        const provider = companyProviders['enrich-company-from-domain'] ||
                        companyProviders['clay-enrich-company'] ||
                        Object.values(companyProviders).find(p => p.actionKey.includes('enrich-company'));

        if (!provider) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: Company enrichment provider not found in registry',
              },
            ],
            isError: true,
          };
        }

        const field = await client.createEnrichmentField(tableId as TableId, fieldName, {
          actionKey: provider.actionKey,
          actionPackageId: provider.actionPackageId,
          authAccountId: resolveAuthAccount(provider, {}).accountId,
          inputsBinding: [{ name: 'domain', formulaText: `{{${domainFieldId}}}` }],
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  fieldId: (field as any).field?.id || (field as any).id,
                  message: `Created company lookup field "${fieldName}"`,
                  outputs: ['name', 'description', 'industry', 'employee_count', 'founded_year', 'funding', 'location'],
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
              text: `Error creating company lookup: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_lookup_person - Quick person lookup by email or LinkedIn
   */
  server.registerTool(
    'clay_lookup_person',
    {
      title: 'Lookup Person',
      description:
        'Add a person lookup/enrichment field that returns key person data from email or LinkedIn URL.',
      inputSchema: {
        tableId: tableId(),
        emailFieldId: z
          .string()
          .optional()
          .describe('Field ID containing email addresses'),
        linkedinFieldId: z
          .string()
          .optional()
          .describe('Field ID containing LinkedIn URLs'),
        fieldName: z
          .string()
          .optional()
          .describe('Name for the field. Default: "Person Lookup"'),
      },
    },
    async ({ tableId, emailFieldId, linkedinFieldId, fieldName = 'Person Lookup' }) => {
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
        const provider = personProviders['apollo-oauth-enrich-person'] ||
                        personProviders['apollo-enrich-person'] ||
                        Object.values(personProviders).find(p => p.actionKey.includes('enrich-person'));

        if (!provider) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: Person enrichment provider not found in registry',
              },
            ],
            isError: true,
          };
        }

        const inputsBinding: Array<{ name: string; formulaText: string }> = [];
        if (emailFieldId) {
          inputsBinding.push({ name: 'email', formulaText: `{{${emailFieldId}}}` });
        }
        if (linkedinFieldId) {
          inputsBinding.push({ name: 'linkedin_url', formulaText: `{{${linkedinFieldId}}}` });
        }

        const field = await client.createEnrichmentField(tableId as TableId, fieldName, {
          actionKey: provider.actionKey,
          actionPackageId: provider.actionPackageId,
          authAccountId: resolveAuthAccount(provider, {}).accountId,
          inputsBinding,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  fieldId: (field as any).field?.id || (field as any).id,
                  message: `Created person lookup field "${fieldName}"`,
                  outputs: ['name', 'title', 'company', 'location', 'linkedin_url', 'phone', 'email'],
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
              text: `Error creating person lookup: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_get_tech_stack - Get company tech stack
   */
  server.registerTool(
    'clay_get_tech_stack',
    {
      title: 'Get Tech Stack',
      description:
        'Add a tech stack enrichment field to see what technologies a company uses (CRM, marketing tools, dev tools, etc.)',
      inputSchema: {
        tableId: tableId(),
        domainFieldId: fieldId('Field ID containing company domains (f_xxx format)'),
        fieldName: z
          .string()
          .optional()
          .describe('Name for the field. Default: "Tech Stack"'),
      },
    },
    async ({ tableId, domainFieldId, fieldName = 'Tech Stack' }) => {
      try {
        const techProviders = await getProvidersByCategory('technographics');
        const provider = techProviders['builtwith-lookup-technologies'] ||
                        techProviders['builtwith-lookup-domain'] ||
                        techProviders['lookup-technology-stack'] ||
                        techProviders['get-tech-stack-for-company'] ||
                        Object.values(techProviders).find(p => p.actionKey.includes('tech'));

        if (!provider) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: Tech stack provider not found in registry',
              },
            ],
            isError: true,
          };
        }

        const field = await client.createEnrichmentField(tableId as TableId, fieldName, {
          actionKey: provider.actionKey,
          actionPackageId: provider.actionPackageId,
          authAccountId: resolveAuthAccount(provider, {}).accountId,
          inputsBinding: [{ name: 'domain', formulaText: `{{${domainFieldId}}}` }],
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  fieldId: (field as any).field?.id || (field as any).id,
                  provider: provider.displayName || provider.actionKey,
                  message: `Created tech stack field "${fieldName}"`,
                  outputs: ['technologies', 'categories', 'crm', 'marketing_tools', 'analytics'],
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
              text: `Error creating tech stack field: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_find_funding - Find company funding/investment data
   */
  server.registerTool(
    'clay_find_funding',
    {
      title: 'Find Funding',
      description:
        'Add a funding enrichment field to get company funding history, investors, and valuation data.',
      inputSchema: {
        tableId: tableId(),
        domainFieldId: fieldId('Field ID containing company domains (f_xxx format)'),
        fieldName: z
          .string()
          .optional()
          .describe('Name for the field. Default: "Funding Data"'),
      },
    },
    async ({ tableId, domainFieldId, fieldName = 'Funding Data' }) => {
      try {
        const fundingProviders = await getProvidersByCategory('fundraising');
        const companyProviders = await getProvidersByCategory('company-enrichment');

        // Try dedicated funding providers first
        const provider = fundingProviders['dealroom-get-fundraising-data'] ||
                        companyProviders['crunchbase-enrich-company-latest-funding-round'] ||
                        companyProviders['crunchbase-enrich-company-basic-information'] ||
                        fundingProviders['pitchbook-get-company-data'];

        if (!provider) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: Funding provider not found in registry',
              },
            ],
            isError: true,
          };
        }

        const field = await client.createEnrichmentField(tableId as TableId, fieldName, {
          actionKey: provider.actionKey,
          actionPackageId: provider.actionPackageId,
          authAccountId: resolveAuthAccount(provider, {}).accountId,
          inputsBinding: [{ name: 'domain', formulaText: `{{${domainFieldId}}}` }],
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  fieldId: (field as any).field?.id || (field as any).id,
                  provider: provider.displayName || provider.actionKey,
                  message: `Created funding field "${fieldName}"`,
                  outputs: ['total_funding', 'last_round', 'round_type', 'investors', 'valuation'],
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
              text: `Error creating funding field: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_find_news - Find company news and recent mentions
   */
  server.registerTool(
    'clay_find_news',
    {
      title: 'Find News',
      description:
        'Add a news enrichment field to find recent news articles and mentions for a company.',
      inputSchema: {
        tableId: tableId(),
        companyFieldId: z
          .string()
          .optional()
          .describe('Field ID containing company names'),
        domainFieldId: z
          .string()
          .optional()
          .describe('Field ID containing company domains'),
        fieldName: z
          .string()
          .optional()
          .describe('Name for the field. Default: "Recent News"'),
      },
    },
    async ({ tableId, companyFieldId, domainFieldId, fieldName = 'Recent News' }) => {
      try {
        if (!companyFieldId && !domainFieldId) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: Must provide either companyFieldId or domainFieldId',
              },
            ],
            isError: true,
          };
        }

        const newsProviders = await getProvidersByCategory('news');
        const searchProviders = await getProvidersByCategory('search');

        const provider = newsProviders['find-google-news-results'] ||
                        searchProviders['search-google'] ||
                        Object.values(newsProviders)[0];

        if (!provider) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: News provider not found in registry',
              },
            ],
            isError: true,
          };
        }

        const queryFormula = companyFieldId
          ? `{{${companyFieldId}}} + " news"`
          : `{{${domainFieldId}}} + " news"`;

        const field = await client.createEnrichmentField(tableId as TableId, fieldName, {
          actionKey: provider.actionKey,
          actionPackageId: provider.actionPackageId,
          authAccountId: resolveAuthAccount(provider, {}).accountId,
          inputsBinding: [{ name: 'query', formulaText: queryFormula }],
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  fieldId: (field as any).field?.id || (field as any).id,
                  provider: provider.displayName || provider.actionKey,
                  message: `Created news field "${fieldName}"`,
                  outputs: ['headlines', 'sources', 'dates', 'snippets'],
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
              text: `Error creating news field: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_find_linkedin_posts - Find recent LinkedIn activity
   */
  server.registerTool(
    'clay_find_linkedin_posts',
    {
      title: 'Find LinkedIn Posts',
      description:
        'Add a LinkedIn posts enrichment field to find recent posts and activity from a person or company.',
      inputSchema: {
        tableId: tableId(),
        linkedinFieldId: z.string().describe('Field ID containing LinkedIn URLs'),
        fieldName: z
          .string()
          .optional()
          .describe('Name for the field. Default: "LinkedIn Posts"'),
        postCount: z
          .number()
          .optional()
          .describe('Number of posts to retrieve. Default: 5'),
      },
    },
    async ({ tableId, linkedinFieldId, fieldName = 'LinkedIn Posts', postCount = 5 }) => {
      try {
        const linkedinProviders = await getProvidersByCategory('linkedin');

        const provider = linkedinProviders['social-posts-discover-posts'] ||
                        linkedinProviders['social-posts-get-post-activity-posts-and-shares'] ||
                        Object.values(linkedinProviders).find(p => p.actionKey.includes('posts'));

        if (!provider) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: LinkedIn posts provider not found in registry',
              },
            ],
            isError: true,
          };
        }

        const inputsBinding: Array<{ name: string; formulaText: string }> = [
          { name: 'linkedin_url', formulaText: `{{${linkedinFieldId}}}` },
        ];

        // Add count if the provider supports it
        if (provider.inputFields?.includes('limit') || provider.inputFields?.includes('count')) {
          inputsBinding.push({ name: 'limit', formulaText: String(postCount) });
        }

        const field = await client.createEnrichmentField(tableId as TableId, fieldName, {
          actionKey: provider.actionKey,
          actionPackageId: provider.actionPackageId,
          authAccountId: resolveAuthAccount(provider, {}).accountId,
          inputsBinding,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  fieldId: (field as any).field?.id || (field as any).id,
                  provider: provider.displayName || provider.actionKey,
                  message: `Created LinkedIn posts field "${fieldName}"`,
                  outputs: ['posts', 'dates', 'engagement', 'topics'],
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
              text: `Error creating LinkedIn posts field: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_score_leads - Add lead scoring based on ICP criteria
   */
  server.registerTool(
    'clay_score_leads',
    {
      title: 'Score Leads',
      description:
        'Create an AI-powered lead scoring field based on your ICP criteria. Uses Claygent to analyze and score each lead.',
      inputSchema: {
        tableId: tableId(),
        fieldName: z.string().describe('Name for the scoring field'),
        icpCriteria: z
          .string()
          .describe(
            'Description of your ideal customer profile. Example: "B2B SaaS companies with 50-500 employees, Series A-C funding, using modern tech stack"'
          ),
        companyFieldId: z
          .string()
          .optional()
          .describe('Field ID with company name or info'),
        domainFieldId: z
          .string()
          .optional()
          .describe('Field ID with company domain'),
      },
    },
    async ({ tableId, fieldName, icpCriteria, companyFieldId, domainFieldId }) => {
      try {
        // Build the scoring prompt
        const prompt = `Score this lead against our ICP criteria on a scale of 1-100.

ICP Criteria: ${icpCriteria}

Company: ${companyFieldId ? `{${companyFieldId}}` : 'Unknown'}
${domainFieldId ? `Domain: {${domainFieldId}}` : ''}

Research the company and provide:
1. ICP Score (1-100)
2. Key matching factors
3. Key gaps or concerns
4. Recommendation (Hot/Warm/Cold)`;

        // Create Claygent field for scoring
        const field = await client.createClaygentField(
          tableId as TableId,
          fieldName,
          prompt,
          {
            outputFields: {
              score: { type: 'number', description: 'ICP fit score from 1-100' },
              matching_factors: { type: 'string', description: 'Key factors that match ICP' },
              gaps: { type: 'string', description: 'Gaps or concerns' },
              recommendation: { type: 'string', description: 'Hot, Warm, or Cold' },
            },
          }
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  fieldId: (field as any).field?.id || (field as any).id,
                  message: `Created lead scoring field "${fieldName}"`,
                  icpCriteria,
                  outputs: ['score', 'matching_factors', 'gaps', 'recommendation'],
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
              text: `Error creating lead scoring: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

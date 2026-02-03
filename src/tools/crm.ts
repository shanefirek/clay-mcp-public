/**
 * CRM Tools
 *
 * Tools for pushing data to CRMs and external systems.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { ClayClient } from '../client.js';
import type { TableId, FieldId } from '../types/clay.js';
import { getProvidersByCategory, resolveAuthAccount } from '../enrichments/index.js';
import { tableId, fieldId, nonEmptyString, authAccountId } from '../validation.js';

// HubSpot action configs
const HUBSPOT_CONFIG = {
  createObject: {
    actionKey: 'hubspot-create-object',
    actionPackageId: 'a2584689-b965-4a25-847d-17b7abcddca3',
  },
  createContact: {
    actionKey: 'create-contact',
    actionPackageId: 'a2584689-b965-4a25-847d-17b7abcddca3',
  },
  createCompany: {
    actionKey: 'hubspot-create-company',
    actionPackageId: 'a2584689-b965-4a25-847d-17b7abcddca3',
  },
  updateObject: {
    actionKey: 'hubspot-update-object',
    actionPackageId: 'a2584689-b965-4a25-847d-17b7abcddca3',
  },
};

// Google Sheets action configs
const SHEETS_CONFIG = {
  addRow: {
    actionKey: 'add-row-to-google-sheet',
    actionPackageId: 'b52dbb55-6b36-4b63-9f8c-21d923353045',
  },
  addRowV2: {
    actionKey: 'google-sheets-add-row-v2',
    actionPackageId: 'b52dbb55-6b36-4b63-9f8c-21d923353045',
  },
  upsertRow: {
    actionKey: 'lookup-add-or-update-row-in-google-sheet',
    actionPackageId: 'b52dbb55-6b36-4b63-9f8c-21d923353045',
  },
};

export function registerCrmTools(
  server: McpServer,
  client: ClayClient
): void {
  /**
   * clay_push_to_hubspot - Create HubSpot contacts/companies from Clay data
   */
  server.registerTool(
    'clay_push_to_hubspot',
    {
      title: 'Push to HubSpot',
      description:
        'Create a HubSpot integration field to push records as contacts or companies. Requires HubSpot OAuth connection in Clay.',
      inputSchema: {
        tableId: tableId(),
        fieldName: nonEmptyString.describe('Name for the HubSpot field'),
        objectType: z
          .enum(['contact', 'company', 'deal'])
          .describe('HubSpot object type to create'),
        fieldMapping: z
          .record(z.string())
          .describe(
            'Map HubSpot properties to Clay field IDs. Keys are HubSpot property names (e.g., "email", "firstname", "company"), values are Clay field IDs (f_xxx)'
          ),
        authAccountId: authAccountId('HubSpot OAuth account ID (aa_xxx). Get from clay_list_integrations.').optional(),
      },
    },
    async ({ tableId, fieldName, objectType, fieldMapping, authAccountId }) => {
      try {
        // Build inputsBinding for HubSpot
        const inputsBinding: Array<{ name: string; formulaText?: string }> = [];

        // Set object type
        const objectTypeId = objectType === 'contact' ? '0-1' : objectType === 'company' ? '0-2' : '0-3';
        inputsBinding.push({ name: 'objectTypeId', formulaText: `"${objectTypeId}"` });

        // Build fields mapping
        const fieldsFormula = Object.entries(fieldMapping)
          .map(([hubspotProp, clayFieldId]) => `"${hubspotProp}": {{${clayFieldId}}}`)
          .join(', ');
        inputsBinding.push({ name: 'fields', formulaText: `{${fieldsFormula}}` });

        // Use createContact for contacts, createCompany for companies, createObject otherwise
        let actionConfig = HUBSPOT_CONFIG.createObject;
        if (objectType === 'contact') {
          actionConfig = HUBSPOT_CONFIG.createContact;
        } else if (objectType === 'company') {
          actionConfig = HUBSPOT_CONFIG.createCompany;
        }

        const field = await client.createEnrichmentField(
          tableId as TableId,
          fieldName,
          {
            actionKey: actionConfig.actionKey,
            actionPackageId: actionConfig.actionPackageId,
            authAccountId: authAccountId || undefined,
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
                  fieldId: (field as { field?: { id: string } }).field?.id || (field as { id?: string }).id,
                  message: `Created HubSpot ${objectType} integration field "${fieldName}"`,
                  note: authAccountId
                    ? 'Using provided HubSpot account'
                    : 'No auth account provided - field will require OAuth connection',
                  nextSteps: [
                    'Run the enrichment to push records to HubSpot',
                    'Connect HubSpot OAuth in Clay if not already done',
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
              text: `Error creating HubSpot field: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_push_to_sheets - Add rows to Google Sheets
   */
  server.registerTool(
    'clay_push_to_sheets',
    {
      title: 'Push to Google Sheets',
      description:
        'Create a Google Sheets integration field to add rows. Requires Google Sheets OAuth connection in Clay.',
      inputSchema: {
        tableId: tableId(),
        fieldName: nonEmptyString.describe('Name for the Sheets field'),
        spreadsheetUrl: z
          .string()
          .optional()
          .describe('Google Sheets URL (or use spreadsheetId)'),
        spreadsheetId: z
          .string()
          .optional()
          .describe('Google Sheets ID (from URL)'),
        sheetName: z
          .string()
          .optional()
          .describe('Sheet/tab name within the spreadsheet'),
        columnMapping: z
          .record(z.string())
          .describe(
            'Map sheet columns to Clay field IDs. Keys are column names/letters, values are Clay field IDs (f_xxx)'
          ),
        authAccountId: authAccountId('Google Sheets OAuth account ID (aa_xxx). Get from clay_list_integrations.').optional(),
      },
    },
    async ({ tableId, fieldName, spreadsheetUrl, spreadsheetId, sheetName, columnMapping, authAccountId }) => {
      try {
        const inputsBinding: Array<{ name: string; formulaText?: string }> = [];

        // Set spreadsheet reference
        if (spreadsheetUrl) {
          inputsBinding.push({ name: 'spreadsheetUrl', formulaText: `"${spreadsheetUrl}"` });
        } else if (spreadsheetId) {
          inputsBinding.push({ name: 'spreadsheetId', formulaText: `"${spreadsheetId}"` });
        }

        if (sheetName) {
          inputsBinding.push({ name: 'sheetName', formulaText: `"${sheetName}"` });
        }

        // Build row data mapping
        const rowFormula = Object.entries(columnMapping)
          .map(([col, clayFieldId]) => `"${col}": {{${clayFieldId}}}`)
          .join(', ');
        inputsBinding.push({ name: 'rowData', formulaText: `{${rowFormula}}` });

        const field = await client.createEnrichmentField(
          tableId as TableId,
          fieldName,
          {
            actionKey: SHEETS_CONFIG.addRowV2.actionKey,
            actionPackageId: SHEETS_CONFIG.addRowV2.actionPackageId,
            authAccountId: authAccountId || undefined,
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
                  fieldId: (field as { field?: { id: string } }).field?.id || (field as { id?: string }).id,
                  message: `Created Google Sheets integration field "${fieldName}"`,
                  note: authAccountId
                    ? 'Using provided Google account'
                    : 'No auth account provided - field will require OAuth connection',
                  nextSteps: [
                    'Run the enrichment to add rows to the sheet',
                    'Connect Google Sheets OAuth in Clay if not already done',
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
              text: `Error creating Google Sheets field: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_push_to_salesforce - Create Salesforce records
   */
  server.registerTool(
    'clay_push_to_salesforce',
    {
      title: 'Push to Salesforce',
      description:
        'Create a Salesforce integration field to create leads, contacts, or accounts. Requires Salesforce OAuth connection in Clay.',
      inputSchema: {
        tableId: tableId(),
        fieldName: nonEmptyString.describe('Name for the Salesforce field'),
        objectType: z
          .enum(['Lead', 'Contact', 'Account', 'Opportunity'])
          .describe('Salesforce object type to create'),
        fieldMapping: z
          .record(z.string())
          .describe(
            'Map Salesforce fields to Clay field IDs. Keys are Salesforce field API names, values are Clay field IDs (f_xxx)'
          ),
        authAccountId: authAccountId('Salesforce OAuth account ID (aa_xxx). Get from clay_list_integrations.').optional(),
      },
    },
    async ({ tableId, fieldName, objectType, fieldMapping, authAccountId }) => {
      try {
        const crmProviders = await getProvidersByCategory('crm');
        const createAction = crmProviders['create-object'] || crmProviders['salesforce-create-object'];

        if (!createAction) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: Salesforce create-object action not found in registry',
              },
            ],
            isError: true,
          };
        }

        const inputsBinding: Array<{ name: string; formulaText?: string }> = [];

        // Set object type
        inputsBinding.push({ name: 'objectType', formulaText: `"${objectType}"` });

        // Build fields mapping
        const fieldsFormula = Object.entries(fieldMapping)
          .map(([sfField, clayFieldId]) => `"${sfField}": {{${clayFieldId}}}`)
          .join(', ');
        inputsBinding.push({ name: 'fields', formulaText: `{${fieldsFormula}}` });

        const field = await client.createEnrichmentField(
          tableId as TableId,
          fieldName,
          {
            actionKey: createAction.actionKey,
            actionPackageId: createAction.actionPackageId,
            authAccountId: authAccountId || undefined,
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
                  fieldId: (field as { field?: { id: string } }).field?.id || (field as { id?: string }).id,
                  message: `Created Salesforce ${objectType} integration field "${fieldName}"`,
                  nextSteps: [
                    'Run the enrichment to create records in Salesforce',
                    'Connect Salesforce OAuth in Clay if not already done',
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
              text: `Error creating Salesforce field: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_add_to_sequence - Add leads to sales sequences (Outreach, Salesloft, etc.)
   */
  server.registerTool(
    'clay_add_to_sequence',
    {
      title: 'Add to Sequence',
      description:
        'Create a sequence integration field to add leads to Outreach, Salesloft, Lemlist, or other sequence tools.',
      inputSchema: {
        tableId: tableId(),
        fieldName: nonEmptyString.describe('Name for the sequence field'),
        provider: z
          .enum(['outreach', 'salesloft', 'lemlist', 'apollo', 'instantly'])
          .describe('Sequence provider'),
        sequenceId: z
          .string()
          .optional()
          .describe('Sequence/Cadence ID to add leads to'),
        emailFieldId: fieldId('Field ID containing email addresses'),
        firstNameFieldId: fieldId('Field ID for first name').optional(),
        lastNameFieldId: fieldId('Field ID for last name').optional(),
        authAccountId: authAccountId('OAuth account ID (aa_xxx). Get from clay_list_integrations.').optional(),
      },
    },
    async ({ tableId, fieldName, provider, sequenceId, emailFieldId, firstNameFieldId, lastNameFieldId, authAccountId }) => {
      try {
        const salesEngagement = await getProvidersByCategory('sales-engagement');

        // Find the right action based on provider
        let actionKey: string | undefined;
        let actionPackageId: string | undefined;

        const providerActions: Record<string, string[]> = {
          outreach: ['add-to-cadence', 'outreach-add-to-sequence'],
          salesloft: ['add-to-cadence', 'salesloft-add-to-cadence'],
          lemlist: ['lemlist-add-lead-to-campaign-v2', 'add-lead-to-campaign'],
          apollo: ['apollo-add-to-sequence'],
          instantly: ['instantly-add-lead-to-campaign', 'add-lead-to-campaign'],
        };

        for (const key of providerActions[provider] || []) {
          if (salesEngagement[key]) {
            actionKey = salesEngagement[key].actionKey;
            actionPackageId = salesEngagement[key].actionPackageId;
            break;
          }
        }

        if (!actionKey || !actionPackageId) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: ${provider} sequence action not found in registry. Available: ${Object.keys(salesEngagement).slice(0, 10).join(', ')}...`,
              },
            ],
            isError: true,
          };
        }

        const inputsBinding: Array<{ name: string; formulaText?: string }> = [];

        // Email is required
        inputsBinding.push({ name: 'email', formulaText: `{{${emailFieldId}}}` });

        // Optional name fields
        if (firstNameFieldId) {
          inputsBinding.push({ name: 'firstName', formulaText: `{{${firstNameFieldId}}}` });
        }
        if (lastNameFieldId) {
          inputsBinding.push({ name: 'lastName', formulaText: `{{${lastNameFieldId}}}` });
        }

        // Sequence ID if provided
        if (sequenceId) {
          inputsBinding.push({ name: 'sequenceId', formulaText: `"${sequenceId}"` });
          inputsBinding.push({ name: 'cadenceId', formulaText: `"${sequenceId}"` });
          inputsBinding.push({ name: 'campaignId', formulaText: `"${sequenceId}"` });
        }

        const field = await client.createEnrichmentField(
          tableId as TableId,
          fieldName,
          {
            actionKey,
            actionPackageId,
            authAccountId: authAccountId || undefined,
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
                  fieldId: (field as { field?: { id: string } }).field?.id || (field as { id?: string }).id,
                  provider,
                  message: `Created ${provider} sequence integration field "${fieldName}"`,
                  nextSteps: [
                    `Connect ${provider} OAuth in Clay if not already done`,
                    'Run the enrichment to add leads to the sequence',
                    sequenceId ? '' : 'Configure sequence ID in Clay UI or provide sequenceId parameter',
                  ].filter(Boolean),
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
              text: `Error creating sequence field: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

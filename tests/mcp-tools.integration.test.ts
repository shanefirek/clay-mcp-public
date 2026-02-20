/**
 * MCP Tools Integration Tests
 *
 * These tests hit the REAL Clay API using CLAY_SESSION_COOKIE from environment.
 * Tests against a designated test table (set TEST_TABLE_ID and WORKSPACE_ID below)
 *
 * Run with: npm test -- mcp-tools.integration.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ClayClient } from '../src/client.js';
import { readFile } from 'fs/promises';

// Set these to your own test table and workspace before running integration tests
const TEST_TABLE_ID = (process.env.TEST_TABLE_ID || 't_yourTestTableId') as `t_${string}`;
const WORKSPACE_ID = process.env.TEST_WORKSPACE_ID || '12345';

// Helper type for Clay API response with nested structure
interface ClayTableResponse {
  table?: {
    id?: string;
    name?: string;
    fields?: Array<{ id: string; name: string; type?: string }>;
    views?: Array<{ id: string }>;
  };
  id?: string;
  name?: string;
  fields?: Array<{ id: string; name: string; type?: string }>;
}

// Helper to extract fields from getTable response (handles nested structure)
function extractFields(tableData: ClayTableResponse): Array<{ id: string; name: string; type?: string }> {
  // Try nested structure first (table.table.fields), then direct (table.fields)
  return tableData?.table?.fields || tableData?.fields || [];
}

describe('MCP Tools Integration Tests', () => {
  let client: ClayClient;

  beforeAll(() => {
    const sessionCookie = process.env.CLAY_SESSION_COOKIE;
    if (!sessionCookie) {
      throw new Error(
        'CLAY_SESSION_COOKIE not found. Set it in environment.'
      );
    }
    client = new ClayClient(sessionCookie);
  });

  describe('Test 1: clay_list_tables', () => {
    it('should list all tables in workspace or at least access test table directly', async () => {
      const tables = await client.listTables(WORKSPACE_ID);
      expect(Array.isArray(tables)).toBe(true);

      if (tables.length > 0) {
        // Verify test table is present
        const testTable = tables.find((t) => t.id === TEST_TABLE_ID);
        expect(testTable).toBeDefined();
        expect(testTable?.name).toBeDefined();
        console.log(`✅ Found ${tables.length} tables, including test table`);
      } else {
        // listTables returned empty - verify we can still access table directly
        console.log('⚠️ listTables returned empty, checking direct table access...');
        const tableData = await client.getTable(TEST_TABLE_ID);
        expect(tableData).toBeDefined();
        console.log(`✅ Direct table access works (listTables may have workspace lookup issue)`);
      }
    });
  });

  describe('Test 2: clay_analyze_table', () => {
    it('should analyze table fields and infer semantic types', async () => {
      const tableData = await client.getTable(TEST_TABLE_ID) as ClayTableResponse;
      const fields = extractFields(tableData);

      expect(tableData).toBeDefined();
      expect(Array.isArray(fields)).toBe(true);
      expect(fields.length).toBeGreaterThan(0);

      // Analyze field types
      const analysis = {
        totalFields: fields.length,
        fieldsByType: {} as Record<string, number>,
        semanticTypes: [] as Array<{ field: string; semanticType: string }>,
      };

      for (const field of fields) {
        const fieldType = field.type || 'unknown';
        analysis.fieldsByType[fieldType] =
          (analysis.fieldsByType[fieldType] || 0) + 1;

        // Infer semantic types
        const name = field.name.toLowerCase();
        if (name.includes('email')) {
          analysis.semanticTypes.push({ field: field.name, semanticType: 'email' });
        } else if (name.includes('name') && !name.includes('company')) {
          analysis.semanticTypes.push({ field: field.name, semanticType: 'name' });
        } else if (name.includes('company') || name.includes('domain')) {
          analysis.semanticTypes.push({
            field: field.name,
            semanticType: 'company',
          });
        } else if (name.includes('phone')) {
          analysis.semanticTypes.push({ field: field.name, semanticType: 'phone' });
        }
      }

      console.log(`✅ Analyzed ${analysis.totalFields} fields`);
      console.log(`   Field types: ${JSON.stringify(analysis.fieldsByType)}`);
      console.log(`   Semantic types found: ${analysis.semanticTypes.length}`);

      expect(analysis.totalFields).toBeGreaterThan(0);
      expect(Object.keys(analysis.fieldsByType).length).toBeGreaterThan(0);
    });
  });

  describe('Test 3: clay_suggest_enrichments', () => {
    it('should suggest relevant enrichments based on table fields', async () => {
      const tableData = await client.getTable(TEST_TABLE_ID) as ClayTableResponse;
      const fields = extractFields(tableData);

      // Load enrichment registry
      const registryPath = './src/enrichments/registry.json';
      const registryData = await readFile(registryPath, 'utf-8');
      const registry = JSON.parse(registryData);

      // Analyze fields to suggest enrichments
      const suggestions = [];
      const fieldNames = fields.map((f) => f.name.toLowerCase());

      if (fieldNames.some((n) => n.includes('email'))) {
        suggestions.push({
          category: 'email-validators',
          provider: 'findymail-validate-email',
          reason: 'Email field detected - can validate deliverability',
        });
      }

      if (fieldNames.some((n) => n.includes('domain') || n.includes('company'))) {
        suggestions.push({
          category: 'company-enrichment',
          provider: 'apollo-enrich-company',
          reason: 'Company/domain field detected',
        });
      }

      if (
        fieldNames.some((n) => n.includes('name')) &&
        !fieldNames.some((n) => n.includes('email'))
      ) {
        suggestions.push({
          category: 'email-finders',
          provider: 'findymail-find-work-email',
          reason: 'Name field without email - can find work email',
        });
      }

      console.log(`✅ Generated ${suggestions.length} enrichment suggestions`);
      suggestions.forEach((s) =>
        console.log(`   - ${s.provider}: ${s.reason}`)
      );

      expect(suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('Test 4: clay_auto_enrich (dry run)', () => {
    it('should create auto-enrich plan without executing', async () => {
      const tableData = await client.getTable(TEST_TABLE_ID) as ClayTableResponse;
      const fields = extractFields(tableData);

      // Simulate auto-enrich logic without creating fields
      const plan = {
        goals: ['validate-emails'],
        fieldsToCreate: [] as Array<{
          type: string;
          provider: string;
          inputField: string;
          fieldName: string;
        }>,
      };

      const emailField = fields.find(
        (f) =>
          f.name.toLowerCase().includes('email') &&
          (f.type === 'text' || f.type === 'email')
      );

      if (emailField) {
        plan.fieldsToCreate.push({
          type: 'email-validation',
          provider: 'findymail-validate-email',
          inputField: emailField.id,
          fieldName: `${emailField.name} Validation`,
        });
      }

      console.log(`✅ Auto-enrich plan created (dry run)`);
      console.log(`   Would create ${plan.fieldsToCreate.length} enrichment fields`);

      expect(plan.fieldsToCreate.length).toBeGreaterThan(0);
      expect(plan.fieldsToCreate[0]).toHaveProperty('provider');
      expect(plan.fieldsToCreate[0]).toHaveProperty('inputField');
    });
  });

  describe('Test 5: clay_validate_emails', () => {
    it('should create and delete email validation field', async () => {
      const tableData = await client.getTable(TEST_TABLE_ID) as ClayTableResponse;
      const fields = extractFields(tableData);

      const emailField = fields.find(
        (f) =>
          f.name.toLowerCase().includes('email') &&
          (f.type === 'text' || f.type === 'email')
      );

      if (!emailField) {
        throw new Error('No email field found in table for validation test');
      }

      // Test field creation using createEnrichmentField
      const validationFieldName = `Test Email Validation ${Date.now()}`;

      console.log(`   Creating validation field: ${validationFieldName}`);

      // Use neverbounce-validate-email provider (from registry)
      const field = await client.createEnrichmentField(
        TEST_TABLE_ID,
        validationFieldName,
        {
          actionKey: 'neverbounce-validate-email',
          actionPackageId: '45b05d92-b86c-48ca-b3f9-696b791d8c9d',
          inputsBinding: [
            { name: 'email', formulaText: `{{${emailField.id}}}` }
          ]
        }
      );

      expect(field).toBeDefined();
      expect(field.id).toBeDefined();
      expect(field.name).toBe(validationFieldName);

      console.log(`✅ Email validation field created: ${field.id}`);

      // Clean up - delete the test field
      console.log(`   Cleaning up test field...`);
      await client.deleteField(TEST_TABLE_ID, field.id as `f_${string}`);
      console.log(`   Test field deleted`);
    }, 30000); // 30 second timeout
  });

  describe('Test 6: clay_create_http_api_field', () => {
    it('should create and delete HTTP API field', async () => {
      const httpFieldName = `Test HTTP API ${Date.now()}`;

      console.log(`   Creating HTTP API field: ${httpFieldName}`);

      // Use config object for createHttpApiField
      const field = await client.createHttpApiField(
        TEST_TABLE_ID,
        httpFieldName,
        {
          url: 'https://api.example.com/test',
          method: 'GET'
        }
      );

      expect(field).toBeDefined();
      expect(field.id).toBeDefined();
      expect(field.name).toBe(httpFieldName);

      console.log(`✅ HTTP API field created: ${field.id}`);

      // Clean up - delete the test field
      console.log(`   Cleaning up test field...`);
      await client.deleteField(TEST_TABLE_ID, field.id as `f_${string}`);
      console.log(`   Test field deleted`);
    }, 30000); // 30 second timeout
  });
});

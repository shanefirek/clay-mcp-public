/**
 * Clay API Client
 *
 * HTTP client for Clay's internal v3 API.
 * Handles all API communication with proper headers and error handling.
 */

import {
  ClayAuth,
  isSessionExpiredError,
  formatSessionExpiredError,
} from './auth.js';
import { RateLimiter, type RateLimiterConfig, getSharedRateLimiter } from './rate-limiter.js';
import type {
  TableId,
  ViewId,
  RecordId,
  FieldId,
  WorkspaceId,
  ClayTable,
  ClayRecord,
  ClayField,
  RunEnrichmentRequest,
  RunEnrichmentResponse,
  SearchResponse,
  BulkFetchResponse,
  CreateFormulaFieldRequest,
  CreateAIFieldRequest,
  WaterfallConfig,
  AIFieldOutputField,
} from './types/clay.js';

const BASE_URL = 'https://api.clay.com/v3';

export interface ClientConfig {
  sessionCookie?: string;
  baseUrl?: string;
  dryRun?: boolean; // Log requests without sending
  debug?: boolean; // Log request timing
  /** Rate limiting config. Set to false to disable. */
  rateLimit?: RateLimiterConfig | false;
}

export class ClayClient {
  private auth: ClayAuth;
  private baseUrl: string;
  private dryRun: boolean;
  private debug: boolean;
  private rateLimiter: RateLimiter | null;

  constructor(config: ClientConfig = {}) {
    this.auth = new ClayAuth(config.sessionCookie);
    this.baseUrl = config.baseUrl || BASE_URL;
    this.dryRun = config.dryRun || false;
    this.debug = config.debug || false;

    // Rate limiting: enabled by default, uses shared instance
    if (config.rateLimit === false) {
      this.rateLimiter = null;
    } else {
      this.rateLimiter = getSharedRateLimiter({
        debug: this.debug,
        ...config.rateLimit,
      });
    }
  }

  /**
   * Make an HTTP request to the Clay API
   */
  async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    if (this.dryRun) {
      console.error(`[DRY RUN] ${method} ${url}`);
      if (body) {
        console.error(`[DRY RUN] Body: ${JSON.stringify(body, null, 2)}`);
      }
      return {} as T;
    }

    // Wait for rate limit slot
    if (this.rateLimiter) {
      await this.rateLimiter.waitForSlot();
    }

    const start = this.debug ? performance.now() : 0;

    const response = await fetch(url, {
      method,
      headers: this.auth.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (this.debug) {
      const duration = Math.round(performance.now() - start);
      console.error(`[CLAY] ${method} ${path} - ${duration}ms (${response.status})`);
    }

    if (!response.ok) {
      // Handle rate limiting (429)
      if (response.status === 429) {
        if (this.rateLimiter) {
          this.rateLimiter.recordRateLimitHit();
        }
        throw new Error(`Clay API rate limit exceeded. Please wait and retry.`);
      }

      const errorText = await response.text();
      const error = new Error(
        `Clay API error: ${response.status} - ${errorText}`
      );

      if (isSessionExpiredError(error)) {
        throw new Error(formatSessionExpiredError());
      }

      throw error;
    }

    // Record successful request
    if (this.rateLimiter) {
      this.rateLimiter.recordSuccess();
    }

    // Handle empty responses (some DELETE endpoints return empty)
    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  // ==================== TABLE OPERATIONS ====================

  /**
   * Get table details including schema, fields, and views
   */
  async getTable(tableId: TableId): Promise<ClayTable> {
    return this.request<ClayTable>('GET', `/tables/${tableId}`);
  }

  /**
   * Get all fields for a table
   */
  async getTableFields(tableId: TableId): Promise<ClayField[]> {
    return this.request<ClayField[]>('GET', `/tables/${tableId}/fields`);
  }

  /**
   * Get record count for a table
   */
  async getTableCount(tableId: TableId): Promise<{ count: number }> {
    return this.request<{ count: number }>('GET', `/tables/${tableId}/count`);
  }

  /**
   * List tables in a workspace
   */
  async listTables(workspaceId: WorkspaceId): Promise<ClayTable[]> {
    // getMyWorkspaces returns {results: [...]} not a raw array
    const workspacesRes = await this.getMyWorkspaces() as { results?: Array<{ id: number; name: string }> };
    const workspaces = workspacesRes.results || [];

    // Find workspace - API returns numeric IDs, so compare both as strings
    const workspace = workspaces.find((w) => String(w.id) === String(workspaceId));
    if (!workspace) {
      return [];
    }

    // Get workbooks for this workspace, then get tables from each
    const workbooks = await this.getWorkbooks(String(workspace.id)) as Array<{ id: string; name: string }>;
    const allTables: ClayTable[] = [];

    for (const workbook of workbooks) {
      const tables = await this.getWorkbookTables(workbook.id) as ClayTable[];
      allTables.push(...tables);
    }

    return allTables;
  }

  // ==================== RECORD OPERATIONS ====================

  /**
   * Create a new record in a table
   */
  async createRecord(
    tableId: TableId,
    recordId?: RecordId
  ): Promise<ClayRecord> {
    const id = recordId || (`r_${Date.now()}` as RecordId);
    return this.request<ClayRecord>(
      'POST',
      `/tables/${tableId}/records/${id}`,
      {}
    );
  }

  /**
   * Update a record's cell values
   */
  async updateRecord(
    tableId: TableId,
    recordId: RecordId,
    data: Record<string, unknown>
  ): Promise<{ message: string }> {
    return this.request<{ message: string }>(
      'PATCH',
      `/tables/${tableId}/records/${recordId}`,
      data
    );
  }

  /**
   * Delete one or more records
   */
  async deleteRecords(
    tableId: TableId,
    recordIds: RecordId[]
  ): Promise<Record<string, never>> {
    return this.request<Record<string, never>>(
      'DELETE',
      `/tables/${tableId}/records`,
      { recordIds }
    );
  }

  /**
   * Get a single record by ID
   */
  async getRecord(tableId: TableId, recordId: RecordId): Promise<ClayRecord> {
    return this.request<ClayRecord>(
      'GET',
      `/tables/${tableId}/records/${recordId}`
    );
  }

  /**
   * Bulk fetch multiple records by their IDs
   */
  async bulkFetchRecords(
    tableId: TableId,
    recordIds: RecordId[]
  ): Promise<BulkFetchResponse> {
    return this.request<BulkFetchResponse>(
      'POST',
      `/tables/${tableId}/bulk-fetch-records`,
      { recordIds }
    );
  }

  /**
   * Search for records in a view
   */
  async searchRecords(
    tableId: TableId,
    viewId: ViewId,
    searchTerm: string
  ): Promise<SearchResponse> {
    return this.request<SearchResponse>(
      'POST',
      `/tables/${tableId}/views/${viewId}/search`,
      { searchTerm }
    );
  }

  /**
   * Get record IDs for a view
   */
  async getViewRecordIds(tableId: TableId, viewId: ViewId): Promise<string[]> {
    return this.request<string[]>(
      'GET',
      `/tables/${tableId}/views/${viewId}/records/ids`
    );
  }

  // ==================== ENRICHMENT OPERATIONS ====================

  /**
   * Run enrichments on specific records and fields
   */
  async runEnrichment(
    tableId: TableId,
    fieldIds: FieldId[],
    recordIds: RecordId[],
    forceRun = false
  ): Promise<RunEnrichmentResponse> {
    const payload: RunEnrichmentRequest = {
      callerName: 'MCP',
      fieldIds,
      forceRun,
      runRecords: { recordIds },
    };
    return this.request<RunEnrichmentResponse>(
      'PATCH',
      `/tables/${tableId}/run`,
      payload
    );
  }

  /**
   * Get field run status
   */
  async getFieldRunStatus(tableId: TableId): Promise<unknown> {
    return this.request<unknown>('GET', `/tables/${tableId}/fieldrun`);
  }

  /**
   * Wait for enrichment to complete on specific records/fields
   *
   * Polls until all specified cells have status SUCCESS, FAILED, or timeout
   * Returns the enriched record data when complete
   */
  async waitForEnrichment(
    tableId: TableId,
    fieldIds: FieldId[],
    recordIds: RecordId[],
    options: {
      pollIntervalMs?: number;
      timeoutMs?: number;
    } = {}
  ): Promise<{
    success: boolean;
    records: ClayRecord[];
    results: Array<{
      recordId: string;
      fieldId: string;
      status: string;
      value: unknown;
      error?: string;
    }>;
  }> {
    const pollInterval = options.pollIntervalMs || 2000;
    const timeout = options.timeoutMs || 120000; // 2 min default
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Fetch all records
      const recordsResult = await this.bulkFetchRecords(tableId, recordIds);
      const records = recordsResult.results || [];

      // Check status of each field in each record
      const results: Array<{
        recordId: string;
        fieldId: string;
        status: string;
        value: unknown;
        error?: string;
      }> = [];

      let allComplete = true;

      for (const record of records) {
        for (const fieldId of fieldIds) {
          const cell = record.cells?.[fieldId];
          // Status can be in metadata.status (bulkFetch) or externalContent.status (getRecord)
          const status: string =
            (cell?.metadata?.status as string) ||
            (cell?.externalContent?.status as string) ||
            'PENDING';

          results.push({
            recordId: record.id,
            fieldId,
            status,
            value: cell?.value,
            error: status === 'FAILED' ? (cell?.externalContent?.error as string) : undefined,
          });

          // Check if still running
          if (!['SUCCESS', 'FAILED', 'CANCELLED', 'RUN_CONDITION_NOT_MET'].includes(status)) {
            allComplete = false;
          }
        }
      }

      if (allComplete) {
        const allSuccess = results.every((r) => r.status === 'SUCCESS');
        return { success: allSuccess, records, results };
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    // Timeout - return current state
    const recordsResult = await this.bulkFetchRecords(tableId, recordIds);
    const records = recordsResult.results || [];
    const results: Array<{
      recordId: string;
      fieldId: string;
      status: string;
      value: unknown;
      error?: string;
    }> = [];

    for (const record of records) {
      for (const fieldId of fieldIds) {
        const cell = record.cells?.[fieldId];
        results.push({
          recordId: record.id,
          fieldId,
          status: 'TIMEOUT',
          value: cell?.value,
        });
      }
    }

    return { success: false, records, results };
  }

  // ==================== FIELD OPERATIONS ====================

  /**
   * Create a simple text field (editable column)
   */
  async createTextField(tableId: TableId, name: string): Promise<ClayField> {
    return this.createField(tableId, name, 'text');
  }

  /**
   * Delete a field from a table
   */
  async deleteField(tableId: TableId, fieldId: FieldId): Promise<void> {
    await this.request<Record<string, never>>(
      'DELETE',
      `/tables/${tableId}/fields/${fieldId}`
    );
  }

  /**
   * Create a field of any basic type
   * Note: Select field options must be added via UI after creation
   */
  async createField(
    tableId: TableId,
    name: string,
    type: 'text' | 'number' | 'email' | 'url' | 'date' | 'boolean' | 'select' | 'currency' | 'image'
  ): Promise<ClayField> {
    const response = await this.request<{ field: ClayField }>('POST', `/tables/${tableId}/fields`, {
      name,
      type,
      typeSettings: {
        dataTypeSettings: { type },
      },
    });
    return response.field;
  }

  /**
   * Create a formula field
   */
  async createFormulaField(
    tableId: TableId,
    name: string,
    formulaText: string,
    viewId: ViewId
  ): Promise<ClayField> {
    const payload: CreateFormulaFieldRequest = {
      type: 'text',
      name,
      typeSettings: {
        formulaType: 'text',
        dataTypeSettings: {
          type: 'text',
          label: 'Text',
          iconType: { displayName: 'TextT' },
        },
        formulaText,
        formulaPrompt: '',
      },
      activeViewId: viewId,
      attributionData: { created_from: 'mcp_server' },
    };
    const response = await this.request<{ field: ClayField }>('POST', `/tables/${tableId}/fields`, payload);
    return response.field;
  }

  /**
   * Create an AI field (Use AI action - direct LLM call)
   *
   * Models: gpt-4.1-mini (default), claude-3-5-sonnet, o4-mini
   * For web research, use createClaygentField instead.
   *
   * Prompt format:
   * - Simple: "What is AI?" (no field references)
   * - With fields: "What does {Company} sell?" (auto-looks up field IDs)
   * - Raw formula: If starts with " or {{, passed as-is
   */
  async createAIField(
    tableId: TableId,
    name: string,
    prompt: string,
    options: {
      model?: string;
      authAccountId?: string;
    } = {}
  ): Promise<ClayField> {
    // Convert simple prompt to formula syntax
    let formulaPrompt = prompt;

    // If it's already a formula (starts with " or {{), use as-is
    const isRawFormula = prompt.startsWith('"') || prompt.startsWith('{{');

    if (!isRawFormula) {
      // Get table fields to lookup IDs
      const table = await this.getTable(tableId);
      const tableData = table as { table?: { fields?: Array<{ id: string; name: string }> } };
      const fields = tableData.table?.fields || [];
      const fieldMap = new Map(fields.map((f) => [f.name.toLowerCase(), f.id]));

      // Convert {FieldName} to {{f_xxx}} and build formula
      const parts = prompt.split(/(\{[^}]+\})/g);
      const formulaParts = parts.map((part) => {
        if (part.startsWith('{') && part.endsWith('}')) {
          const fieldName = part.slice(1, -1);
          const fieldId = fieldMap.get(fieldName.toLowerCase());
          if (fieldId) {
            return `{{${fieldId}}}`;
          }
          return `{{${fieldName}}}`;
        } else if (part) {
          return `"${part.replace(/"/g, '\\"')}"`;
        }
        return '';
      }).filter(Boolean);

      formulaPrompt = formulaParts.join(' + ');
    }

    const model = options.model || 'gpt-4.1-mini';
    const authAccountId = options.authAccountId || 'aa_HvuEoKsv0sb0'; // Clay-managed OpenAI

    const inputsBinding: Array<{ name: string; formulaText?: string }> = [
      { name: 'useCase', formulaText: '"use-ai"' },
      { name: 'prompt', formulaText: formulaPrompt },
      { name: 'model', formulaText: `"${model}"` },
      { name: 'metaprompt', formulaText: formulaPrompt },
      // Empty bindings for optional params
      { name: 'temperature' },
      { name: 'reasoningLevel' },
      { name: 'maxTokens' },
      { name: 'jsonMode' },
      { name: 'systemPrompt' },
    ];

    const response = await this.request<{ field: ClayField }>('POST', `/tables/${tableId}/fields`, {
      type: 'action',
      name,
      typeSettings: {
        dataTypeSettings: { type: 'json' },
        actionKey: 'use-ai',
        actionVersion: 1,
        actionPackageId: '67ba01e9-1898-4e7d-afe7-7ebe24819a57',
        authAccountId,
        inputsBinding,
      },
    });
    return response.field;
  }

  /**
   * Create a Claygent field (web research agent)
   *
   * Models: clay-neon (default, faster), clay-argon (complex reasoning)
   * Claygent does web research with citations. For direct LLM calls, use createAIField.
   *
   * Prompt format:
   * - Simple: "Research {Company}" (auto-looks up field IDs)
   * - Raw formula: If starts with " or {{, passed as-is
   *
   * Output fields (optional): Define structured output schema
   * - { fieldName: { type: 'string', description: '...' } }
   */
  async createClaygentField(
    tableId: TableId,
    name: string,
    prompt: string,
    options: {
      model?: 'clay-neon' | 'clay-argon';
      metaprompt?: string; // Short task description (shown in UI)
      outputFields?: Record<string, { type: string; description: string }>; // Structured output
      reasoningLevel?: string;
      maxCostInCents?: number;
      viewId?: ViewId; // Required for proper field placement
    } = {}
  ): Promise<ClayField> {
    // Convert simple prompt to formula syntax
    let formulaPrompt = prompt;
    const isRawFormula = prompt.startsWith('"') || prompt.startsWith('{{');

    // Get table to lookup field IDs and default view
    const table = await this.getTable(tableId);
    const tableData = table as { table?: { fields?: Array<{ id: string; name: string }>; views?: Array<{ id: string }> } };
    const fields = tableData.table?.fields || [];
    const fieldMap = new Map(fields.map((f) => [f.name.toLowerCase(), f.id]));
    const defaultViewId = options.viewId || tableData.table?.views?.[0]?.id;

    if (!isRawFormula) {
      const parts = prompt.split(/(\{[^}]+\})/g);
      const formulaParts = parts.map((part) => {
        if (part.startsWith('{') && part.endsWith('}')) {
          const fieldName = part.slice(1, -1);
          const fieldId = fieldMap.get(fieldName.toLowerCase());
          if (fieldId) {
            return `{{${fieldId}}}`;
          }
          return `{{${fieldName}}}`;
        } else if (part) {
          return `"${part.replace(/"/g, '\\"')}"`;
        }
        return '';
      }).filter(Boolean);

      formulaPrompt = formulaParts.join(' + ');
    }

    const model = options.model || 'clay-neon';
    const metaprompt = options.metaprompt || prompt.slice(0, 100); // Default to first 100 chars of prompt

    // Build inputsBinding with all params (verified from HAR capture)
    const inputsBinding: Array<{
      name: string;
      formulaText?: string;
      formulaMap?: Record<string, string>;
      optional?: boolean;
    }> = [
      { name: 'useCase', formulaText: '"claygent"', optional: true },
      { name: 'prompt', formulaText: formulaPrompt, optional: true },
      { name: 'model', formulaText: `"${model}"`, optional: true },
      { name: 'metaprompt', formulaText: `"${metaprompt.replace(/"/g, '\\"')}"`, optional: true },
      // Optional params - empty bindings
      { name: 'temperature', optional: true },
      { name: 'reasoningLevel', optional: true },
      { name: 'reasoningBudget', optional: true },
      { name: 'claygentId', optional: true },
      { name: 'claygentFieldMapping', optional: true },
      { name: 'maxTokens', optional: true },
      { name: 'maxCostInCents', optional: true },
      { name: 'jsonMode', optional: true },
      { name: 'systemPrompt', optional: true },
      { name: 'tableExamples', optional: true },
      { name: 'stopSequence', optional: true },
      { name: 'runBudget', optional: true },
      { name: 'topP', optional: true },
      { name: 'contextDocumentIds', optional: true },
      { name: 'browserbaseContextId', optional: true },
      { name: 'mcpSettings', optional: true },
      { name: '_metadata', formulaMap: { modelSource: 'generated' }, optional: true },
    ];

    // Add structured output schema if provided
    if (options.outputFields) {
      inputsBinding.push({
        name: 'answerSchemaType',
        formulaMap: {
          type: '"json"',
          jsonType: '"Fields"',
          fields: JSON.stringify(options.outputFields),
        },
        optional: true,
      });
    } else {
      inputsBinding.push({ name: 'answerSchemaType', optional: true });
    }

    // Add optional params with values if provided
    if (options.reasoningLevel) {
      const idx = inputsBinding.findIndex(b => b.name === 'reasoningLevel');
      if (idx >= 0) inputsBinding[idx].formulaText = `"${options.reasoningLevel}"`;
    }
    if (options.maxCostInCents) {
      const idx = inputsBinding.findIndex(b => b.name === 'maxCostInCents');
      if (idx >= 0) inputsBinding[idx].formulaText = `${options.maxCostInCents}`;
    }

    const payload: Record<string, unknown> = {
      type: 'action',
      name,
      typeSettings: {
        dataTypeSettings: { type: 'json' },
        actionKey: 'use-ai',
        actionVersion: 1,
        actionPackageId: '67ba01e9-1898-4e7d-afe7-7ebe24819a57',
        inputsBinding,
        useStaticIP: false,
      },
      attributionData: {
        created_from: 'mcp_server',
        config_menu: 'traditional_setup',
        enrichment_entry_point: 'full_modal',
      },
    };

    // Add activeViewId if available
    if (defaultViewId) {
      payload.activeViewId = defaultViewId;
    }

    const response = await this.request<{ field: ClayField }>('POST', `/tables/${tableId}/fields`, payload);
    return response.field;
  }

  /**
   * Create an HTTP API field for calling external APIs
   *
   * Verified from HAR capture - supports GET, POST, PUT, PATCH, DELETE
   * with headers, query params, body, and retry options.
   *
   * @param tableId - Table to add field to
   * @param name - Column name
   * @param config - HTTP API configuration
   */
  async createHttpApiField(
    tableId: TableId,
    name: string,
    config: {
      url: string;
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      headers?: Record<string, string>;
      body?: string; // JSON string or formula
      queryParams?: Record<string, string>;
      authAccountId?: string; // HTTP API account for auth headers
      responseFieldPaths?: string[]; // JSONPath to extract specific values
      followRedirects?: boolean;
      maxRedirects?: number;
      shouldRetry?: boolean;
      maxRetries?: number;
      responseTimeout?: number;
      removeNull?: boolean;
      returnResponseMetadata?: boolean;
      viewId?: ViewId;
    }
  ): Promise<ClayField> {
    // Get table to lookup field IDs and default view
    const table = await this.getTable(tableId);
    const tableData = table as { table?: { fields?: Array<{ id: string; name: string }>; views?: Array<{ id: string }> } };
    const fields = tableData.table?.fields || [];
    const fieldMap = new Map(fields.map((f) => [f.name.toLowerCase(), f.id]));
    const defaultViewId = config.viewId || tableData.table?.views?.[0]?.id;

    // Helper to convert {FieldName} references to {{f_xxx}}
    // Regex matches {FieldName} where FieldName starts with a letter (not JSON braces like {"key")
    const convertFieldRefs = (text: string): string => {
      return text.replace(/\{([A-Za-z][A-Za-z0-9_ ]*)\}/g, (match, fieldName) => {
        const fieldId = fieldMap.get(fieldName.toLowerCase());
        if (fieldId) {
          return `{{${fieldId}}}`;
        }
        return match; // Keep original if not found
      });
    };

    // Build URL formula
    let urlFormula = `"${config.url}"`;
    if (config.url.includes('{')) {
      // Has field references - need to build concatenation
      const converted = convertFieldRefs(config.url);
      if (converted !== config.url) {
        // Split and rebuild as formula
        const parts = converted.split(/({{[^}]+}})/g);
        urlFormula = parts
          .filter(Boolean)
          .map(part => part.startsWith('{{') ? part : `"${part}"`)
          .join(' + ');
      }
    }

    // Build body formula if provided
    let bodyFormula: string | undefined;
    if (config.body) {
      if (config.body.includes('{{')) {
        // Already has formula syntax (double braces)
        bodyFormula = config.body;
      } else if (config.body.includes('{') && /\{[A-Za-z]/.test(config.body)) {
        // Has field references like {Email} - convert them and build proper formula
        // First convert {FieldName} to {{f_xxx}}
        const converted = convertFieldRefs(config.body);

        // Check if any conversions happened
        if (converted.includes('{{')) {
          // Build a formula that properly escapes field values in JSON
          // Split by field references, then concatenate with Clay.formatForJSON
          const parts: string[] = [];
          let lastIndex = 0;
          const regex = /{{([^}]+)}}/g;
          let match;

          while ((match = regex.exec(converted)) !== null) {
            // Add the text before this field reference
            if (match.index > lastIndex) {
              const textBefore = converted.slice(lastIndex, match.index);
              parts.push(`"${textBefore.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
            }
            // Add the field reference with Clay.formatForJSON
            parts.push(`Clay.formatForJSON({{${match[1]}}})`);
            lastIndex = match.index + match[0].length;
          }

          // Add any remaining text after the last field reference
          if (lastIndex < converted.length) {
            const textAfter = converted.slice(lastIndex);
            parts.push(`"${textAfter.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
          }

          bodyFormula = parts.join(' + ');
        } else {
          // No field references found, treat as plain JSON
          bodyFormula = `"${config.body.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
        }
      } else {
        // Plain JSON string - escape properly
        bodyFormula = `"${config.body.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
      }
    }

    // Build headers formula if provided
    let headersFormula: string | undefined;
    if (config.headers && Object.keys(config.headers).length > 0) {
      // Check if any header values have field references
      const hasFieldRefs = Object.values(config.headers).some(v => v.includes('{'));

      if (hasFieldRefs) {
        // Build dynamic headers formula
        const headerParts: string[] = ['"{'];
        const entries = Object.entries(config.headers);

        entries.forEach(([k, v], idx) => {
          const converted = convertFieldRefs(v);
          const separator = idx < entries.length - 1 ? ', ' : '';

          if (converted.includes('{{')) {
            // Has field reference - need to concatenate
            headerParts.push(`"\\"${k}\\": \\"" + {{${converted.match(/{{([^}]+)}}/)?.[1]}}} + "\\"${separator}`);
          } else {
            // Plain value
            headerParts.push(`"\\"${k}\\": \\"${v}\\"${separator}`);
          }
        });

        headerParts.push('}"');
        headersFormula = headerParts.join(' + ');
      } else {
        // Static headers - simple JSON string
        const headerPairs = Object.entries(config.headers)
          .map(([k, v]) => `\\"${k}\\": \\"${v}\\"`)
          .join(', ');
        headersFormula = `"{${headerPairs}}"`;
      }
    }

    // Build query params formula if provided
    let queryFormula: string | undefined;
    if (config.queryParams && Object.keys(config.queryParams).length > 0) {
      const queryPairs = Object.entries(config.queryParams)
        .map(([k, v]) => {
          const converted = convertFieldRefs(v);
          if (converted !== v) {
            return `"${k}=" + ${converted}`;
          }
          return `"${k}=${v}"`;
        })
        .join(' + "&" + ');
      queryFormula = queryPairs;
    }

    // Build inputsBinding (verified from HAR capture)
    const inputsBinding: Array<{
      name: string;
      formulaText?: string;
      optional?: boolean;
    }> = [
      { name: 'method', formulaText: config.method ? `"${config.method}"` : undefined, optional: true },
      { name: 'url', formulaText: urlFormula, optional: false },
      { name: 'queryString', formulaText: queryFormula, optional: true },
      { name: 'body', formulaText: bodyFormula, optional: true },
      { name: 'headers', formulaText: headersFormula, optional: true },
      { name: 'fieldPaths', formulaText: config.responseFieldPaths ? `"${config.responseFieldPaths.join(',')}"` : undefined, optional: true },
      { name: 'removeNull', formulaText: config.removeNull !== false ? 'true' : 'false', optional: true },
      { name: 'returnResponseMetadata', formulaText: config.returnResponseMetadata ? 'true' : undefined, optional: true },
      { name: 'followRedirects', formulaText: config.followRedirects !== false ? 'true' : 'false', optional: true },
      { name: 'followRedirectsOptions|maxRedirects', formulaText: config.maxRedirects ? `${config.maxRedirects}` : undefined, optional: true },
      { name: 'responseTimeout', formulaText: config.responseTimeout ? `${config.responseTimeout}` : undefined, optional: true },
      { name: 'shouldRetry', formulaText: config.shouldRetry !== false ? 'true' : 'false', optional: true },
      { name: 'retryOptions|maxRetries', formulaText: config.maxRetries ? `${config.maxRetries}` : undefined, optional: true },
      { name: 'retryOptions|statusCodesToRetry', optional: true },
      { name: 'retryOptions|errorCodesToRetry', optional: true },
    ];

    const payload: Record<string, unknown> = {
      type: 'action',
      name,
      typeSettings: {
        dataTypeSettings: { type: 'json' },
        actionKey: 'http-api-v2',
        actionVersion: 1,
        actionPackageId: '4299091f-3cd3-4d68-b198-0143575f471d',
        inputsBinding,
        useStaticIP: false,
      },
      attributionData: {
        created_from: 'mcp_server',
      },
    };

    // Add authAccountId if provided
    if (config.authAccountId) {
      (payload.typeSettings as Record<string, unknown>).authAccountId = config.authAccountId;
    }

    // Add activeViewId if available
    if (defaultViewId) {
      payload.activeViewId = defaultViewId;
    }

    const response = await this.request<{ field: ClayField }>('POST', `/tables/${tableId}/fields`, payload);
    return response.field;
  }

  /**
   * Generate an optimized prompt using Clay's metaprompter AI
   *
   * Given a task description, this endpoint:
   * 1. Suggests the best use case (claygent vs use-ai)
   * 2. Suggests the best model (clay-neon vs clay-argon)
   * 3. Generates a fully optimized prompt with structured instructions
   *
   * @param tableId - Table for context (to get available columns)
   * @param taskDescription - What you want the AI to do (use {FieldName} to reference columns)
   * @param options - Additional options
   */
  async generatePrompt(
    tableId: TableId,
    taskDescription: string,
    options: {
      existingPrompt?: string; // Existing prompt to improve (empty for new generation)
      latencyBudget?: 'high' | 'low'; // high = better quality, low = faster
    } = {}
  ): Promise<{
    suggestedUseCase: 'claygent' | 'use-ai';
    useCaseReasoning: string;
    suggestedModel: string;
    modelReasoning: string;
    generatedPrompt: string;
  }> {
    // Get table to build column name -> ID map
    const table = await this.getTable(tableId);
    const tableData = table as {
      table?: {
        fields?: Array<{ id: string; name: string }>;
        workspaceId?: number;
      };
    };
    const fields = tableData.table?.fields || [];
    const workspaceId = tableData.table?.workspaceId;

    if (!workspaceId) {
      throw new Error('Could not determine workspace ID from table');
    }

    // Build column name -> ID map
    const columnNamesToIds: Record<string, string> = {};
    for (const field of fields) {
      columnNamesToIds[field.name] = field.id;
    }

    const payload = {
      prompt: options.existingPrompt || '',
      taskDescription,
      workspaceId,
      tableId,
      columnNamesToIds,
      latencyBudget: options.latencyBudget || 'high',
    };

    // Make request - this is a streaming endpoint
    const url = `${this.baseUrl}/ai-generation/stream-metaprompter`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.auth.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Clay API error: ${response.status} - ${errorText}`);
    }

    // Response is a streaming format - collect all the text
    const rawText = await response.text();

    // Try to decode as base64 first (HAR capture format), otherwise use raw
    let decoded: string;
    try {
      const maybeDecoded = Buffer.from(rawText, 'base64').toString('utf8');
      // Check if it looks like valid decoded content
      if (maybeDecoded.includes('suggestedUseCase') || maybeDecoded.includes('prompt')) {
        decoded = maybeDecoded;
      } else {
        decoded = rawText;
      }
    } catch {
      decoded = rawText;
    }

    // Parse the streaming response
    let suggestedUseCase: 'claygent' | 'use-ai' = 'claygent';
    let useCaseReasoning = '';
    let suggestedModel = 'clay-neon';
    let modelReasoning = '';
    let generatedPrompt = '';

    // Extract use case suggestion - handle both JSON array and object formats
    const useCaseMatch = decoded.match(/\{"suggestedUseCase":"([^"]+)","suggestedUseCaseReasoning":"([^"]+)"\}/) ||
                         decoded.match(/"suggestedUseCase"\s*:\s*"([^"]+)"[\s\S]*?"suggestedUseCaseReasoning"\s*:\s*"([^"]+)"/);
    if (useCaseMatch) {
      suggestedUseCase = useCaseMatch[1] as 'claygent' | 'use-ai';
      useCaseReasoning = useCaseMatch[2];
    }

    // Extract model suggestion
    const modelMatch = decoded.match(/\{"suggestedModel":"([^"]+)","suggestModelReasoning":"([^"]+)"\}/) ||
                       decoded.match(/"suggestedModel"\s*:\s*"([^"]+)"[\s\S]*?"suggestModelReasoning"\s*:\s*"([^"]+)"/);
    if (modelMatch) {
      suggestedModel = modelMatch[1];
      modelReasoning = modelMatch[2];
    }

    // Extract the longest prompt (final accumulated prompt)
    // Handle escaped quotes in the prompt content
    const promptMatches = decoded.matchAll(/"prompt"\s*:\s*"((?:[^"\\]|\\.)*)"/g);
    for (const match of promptMatches) {
      if (match[1].length > generatedPrompt.length) {
        generatedPrompt = match[1];
      }
    }

    // Unescape the prompt
    generatedPrompt = generatedPrompt
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');

    return {
      suggestedUseCase,
      useCaseReasoning,
      suggestedModel,
      modelReasoning,
      generatedPrompt,
    };
  }

  /**
   * Generate a formula using AI from a natural language description
   *
   * This calls Clay's AI formula generator which:
   * 1. Takes a natural language description (e.g., "Combine first and last name")
   * 2. Looks at sample data from the table
   * 3. Generates a proper formula with edge case handling
   *
   * @param tableId - The table to generate the formula for
   * @param prompt - Natural language description of what the formula should do
   * @returns The generated formula text and data type
   */
  async generateFormula(
    tableId: TableId,
    prompt: string
  ): Promise<{ formula: string; dataType: string }> {
    // Get table schema and sample data
    const table = await this.getTable(tableId);
    const tableData = table as {
      table?: {
        fields?: Array<{ id: string; name: string }>;
        views?: Array<{ id: string; name: string }>;
        workspaceId?: number;
        ownerId?: string;
        createdByUserId?: string;
      };
    };

    const fields = tableData.table?.fields || [];
    const workspaceId = tableData.table?.workspaceId;

    if (!workspaceId) {
      throw new Error('Could not determine workspace ID from table');
    }

    // Get user ID from table owner (current user making the request)
    const userId = tableData.table?.ownerId || tableData.table?.createdByUserId;

    // Build column name -> ID map
    const columnNamesToIds: Record<string, string> = {};
    for (const field of fields) {
      columnNamesToIds[field.name] = field.id;
    }

    // Get sample records for context
    const views = tableData.table?.views || [];
    const defaultView = views.find((v: { id: string; name: string }) => v.name === 'Default view') || views[0];
    let rawExampleTableData: Record<string, unknown>[] = [];

    if (defaultView) {
      try {
        // Get record IDs first, then fetch records
        const recordIds = await this.getViewRecordIds(tableId, defaultView.id as ViewId);
        const sampleRecordIds = recordIds.slice(0, 10);

        if (sampleRecordIds.length > 0) {
          const recordsResult = await this.bulkFetchRecords(tableId, sampleRecordIds as RecordId[]);
          rawExampleTableData = (recordsResult.results || []).map((r: ClayRecord) => {
            const row: Record<string, unknown> = {};
            for (const [fieldId, cell] of Object.entries(r.cells || {})) {
              row[fieldId] = (cell as { value?: unknown }).value;
            }
            return row;
          });
        }
      } catch {
        // Continue without sample data if fetch fails
      }
    }

    const payload = {
      id: userId,
      workspaceId: String(workspaceId),
      userPromptInput: prompt,
      userProvidedCorrectedExamples: [],
      columnNamesToIds,
      mode: 'basic',
      rawExampleTableData,
      formattedExampleTableData: [],
    };

    const response = await this.request<{ formula: string; dataType: string }>(
      'POST',
      '/ai-generation/formula',
      payload
    );

    return response;
  }

  /**
   * Create a waterfall enrichment field
   *
   * Waterfalls try multiple providers in order until one succeeds.
   * Each config needs: actionKey, actionPackageId, inputsBinding, attributePath, name
   */
  async createWaterfallField(
    tableId: TableId,
    name: string,
    waterfallConfigs: WaterfallConfig['waterfallConfigs'],
    runMode: WaterfallConfig['runMode'] = 'DONT_RUN'
  ): Promise<ClayField> {
    const payload = {
      waterfallFieldName: name,
      runMode,
      runAsButton: false,
      waterfallConfigs: waterfallConfigs.map((config) => {
        // Remove undefined authAccountId as it may cause API validation issues
        const cleanConfig: Record<string, unknown> = {
          type: 'actionConfig' as const,
          actionKey: config.actionKey,
          actionPackageId: config.actionPackageId,
          inputsBinding: config.inputsBinding,
          attributePath: config.attributePath,
          name: config.name,
        };
        if (config.authAccountId) {
          cleanConfig.authAccountId = config.authAccountId;
        }
        return cleanConfig;
      }),
    };
    return this.request<ClayField>(
      'POST',
      `/tables/${tableId}/waterfall/v2`,
      payload
    );
  }

  /**
   * Create a generic enrichment field from registry config
   *
   * This is the main method for creating enrichment fields programmatically.
   * Use the enrichment registry to look up actionKey, actionPackageId, etc.
   */
  async createEnrichmentField(
    tableId: TableId,
    name: string,
    config: {
      actionKey: string;
      actionPackageId: string;
      authAccountId?: string | null;
      inputsBinding: Array<{ name: string; formulaText?: string }>;
    }
  ): Promise<ClayField> {
    const payload: {
      type: 'action';
      name: string;
      typeSettings: {
        dataTypeSettings: { type: string };
        actionKey: string;
        actionVersion: number;
        actionPackageId: string;
        authAccountId?: string;
        inputsBinding: Array<{ name: string; formulaText?: string }>;
      };
    } = {
      type: 'action',
      name,
      typeSettings: {
        dataTypeSettings: { type: 'text' },
        actionKey: config.actionKey,
        actionVersion: 1,
        actionPackageId: config.actionPackageId,
        inputsBinding: config.inputsBinding,
      },
    };

    // Only add authAccountId if it's a string (not null/undefined)
    if (typeof config.authAccountId === 'string') {
      payload.typeSettings.authAccountId = config.authAccountId;
    }

    const response = await this.request<{ field: ClayField }>('POST', `/tables/${tableId}/fields`, payload);
    return response.field;
  }

  // ==================== DISCOVERY OPERATIONS ====================

  /**
   * Get available enrichment actions
   */
  async getAvailableActions(workspaceId: WorkspaceId): Promise<unknown> {
    return this.request<unknown>('GET', `/actions?workspaceId=${workspaceId}`);
  }

  /**
   * Get waterfall preset templates for a workspace
   */
  async getWaterfallPresets(workspaceId: WorkspaceId): Promise<unknown> {
    // Try fetching all presets for the workspace
    return this.request<unknown>(
      'GET',
      `/presets/workspace/${workspaceId}`
    );
  }

  // ==================== WORKSPACE OPERATIONS ====================

  /**
   * Get user's workspaces
   */
  async getMyWorkspaces(): Promise<unknown[]> {
    return this.request<unknown[]>('GET', '/my-workspaces');
  }

  /**
   * Get workspace permissions
   */
  async getWorkspacePermissions(workspaceId: WorkspaceId): Promise<unknown> {
    return this.request<unknown>(
      'GET',
      `/workspaces/${workspaceId}/permissions`
    );
  }

  /**
   * Get workbooks for a workspace
   */
  async getWorkbooks(workspaceId: string): Promise<unknown[]> {
    return this.request<unknown[]>('GET', `/workspaces/${workspaceId}/workbooks`);
  }

  /**
   * Get tables for a workbook
   */
  async getWorkbookTables(workbookId: string): Promise<unknown[]> {
    return this.request<unknown[]>('GET', `/workbooks/${workbookId}/tables`);
  }

  /**
   * Create a new table in a workbook
   */
  async createTable(
    name: string,
    workbookId: string,
    workspaceId: number,
    type: 'spreadsheet' | 'company' | 'people' | 'jobs' = 'spreadsheet'
  ): Promise<unknown> {
    return this.request<unknown>('POST', '/tables', {
      name,
      workbookId,
      workspaceId,
      type,
    });
  }

  /**
   * Create a new workbook in a workspace
   */
  async createWorkbook(name: string, workspaceId: number): Promise<unknown> {
    return this.request<unknown>('POST', '/workbooks', {
      name,
      workspaceId,
    });
  }

  // ==================== TABLE MANAGEMENT OPERATIONS ====================

  /**
   * Duplicate a table
   * Creates a copy of the table with all fields, views, and optionally records
   */
  async duplicateTable(tableId: TableId): Promise<unknown> {
    return this.request<unknown>('POST', `/tables/${tableId}/duplicate/`, {});
  }

  /**
   * Export a table view to CSV
   * Returns an export job ID that can be polled for the download URL
   */
  async exportTable(
    tableId: TableId,
    viewId: ViewId
  ): Promise<{ id: string; status: string }> {
    return this.request<{ id: string; status: string }>(
      'POST',
      `/tables/${tableId}/views/${viewId}/export`,
      {}
    );
  }

  /**
   * Get export job status and download URL
   */
  async getExportStatus(
    exportJobId: string
  ): Promise<{ status: string; url?: string }> {
    return this.request<{ status: string; url?: string }>(
      'GET',
      `/exports/${exportJobId}`
    );
  }

  /**
   * Create a shared table link
   */
  async createSharedTable(tableId: TableId): Promise<{ id: string }> {
    return this.request<{ id: string }>('POST', '/shared-tables', { tableId });
  }

  /**
   * Update shared table settings
   */
  async updateSharedTable(
    sharedTableId: string,
    settings: {
      sharingType?: 'public' | 'private' | 'restricted';
      viewId?: ViewId;
      sharedUserEmails?: string;
      shouldResetPublicId?: boolean;
    }
  ): Promise<unknown> {
    return this.request<unknown>(
      'PATCH',
      `/shared-tables/${sharedTableId}`,
      {
        shouldResetPublicId: settings.shouldResetPublicId ?? false,
        viewId: settings.viewId,
        sharedUserEmails: settings.sharedUserEmails ?? '',
        sharingType: settings.sharingType ?? 'public',
      }
    );
  }

  /**
   * Get shared table info for a table
   */
  async getSharedTableInfo(tableId: TableId): Promise<unknown> {
    return this.request<unknown>(
      'GET',
      `/shared-tables/by-table-id/${tableId}`
    );
  }

  // ==================== VIEW OPERATIONS ====================

  /**
   * Duplicate a view
   */
  async duplicateView(tableId: TableId, viewId: ViewId): Promise<unknown> {
    return this.request<unknown>(
      'POST',
      `/tables/${tableId}/views/${viewId}/duplicate`,
      {}
    );
  }

  /**
   * Update view filter
   */
  async updateViewFilter(
    tableId: TableId,
    viewId: ViewId,
    filter: {
      combinationMode: 'AND' | 'OR';
      items: Array<{
        fieldId: FieldId;
        type: string; // EQUAL, NOT_EQUAL, CONTAIN, EMPTY, NOT_EMPTY, etc.
        value?: unknown;
      }>;
    }
  ): Promise<unknown> {
    return this.request<unknown>(
      'PATCH',
      `/tables/${tableId}/views/${viewId}/filter`,
      filter
    );
  }

  /**
   * Delete a view
   */
  async deleteView(tableId: TableId, viewId: ViewId): Promise<void> {
    await this.request<Record<string, never>>(
      'DELETE',
      `/tables/${tableId}/views/${viewId}`
    );
  }

  // ==================== SOURCE OPERATIONS ====================

  /**
   * Get sources for a table
   */
  async getSources(tableId: TableId): Promise<unknown[]> {
    return this.request<unknown[]>('GET', `/sources?tableId=${tableId}`);
  }

  /**
   * Get source details
   */
  async getSource(sourceId: string): Promise<unknown> {
    return this.request<unknown>('GET', `/sources/${sourceId}`);
  }

  // ==================== APP ACCOUNTS ====================

  /**
   * Get connected accounts by type
   */
  async getAppAccounts(
    accountType:
      | 'anthropic'
      | 'google-sheets'
      | 'apollo-oauth'
      | 'http-api'
      | 'airtable-oauth'
      | 'gpt-3'
      | 'instantly'
      | 'octave-v2'
      | 'smartlead-ai'
      | 'hubspot'
  ): Promise<unknown[]> {
    return this.request<unknown[]>('GET', `/app-accounts/type/${accountType}`);
  }

  /**
   * List saved Claygents for a workspace
   * These are reusable Claygent configurations that can be applied to tables
   */
  async listClaygents(workspaceId: WorkspaceId): Promise<unknown[]> {
    return this.request<unknown[]>('GET', `/workspaces/${workspaceId}/claygents`);
  }

  /**
   * Get workspace app accounts (all connected integrations)
   */
  async getWorkspaceAppAccounts(workspaceId: WorkspaceId): Promise<unknown[]> {
    return this.request<unknown[]>('GET', `/workspaces/${workspaceId}/app-accounts`);
  }

  /**
   * Search enrichments by query
   */
  async searchEnrichments(workspaceId: WorkspaceId, query: string): Promise<unknown> {
    return this.request<unknown>('POST', `/enrichment-search/${workspaceId}/query`, {
      userQuery: query,
    });
  }

  // ==================== SOURCE OPERATIONS ====================

  /**
   * Create a table with a webhook source
   * Returns the table with source info including the webhook URL
   */
  async createWebhookTable(
    name: string,
    workbookId: string,
    workspaceId: string,
    options: {
      description?: string;
      responseType?: 'JSON' | 'PLAIN_TEXT';
    } = {}
  ): Promise<unknown> {
    const urlSlugText = name;
    return this.request<unknown>('POST', '/tables', {
      name: `${name} Table`,
      workbookId,
      workspaceId,
      type: 'spreadsheet',
      template: 'basic_source',
      sourceSettings: {
        addSource: {
          name: 'Webhook',
          source: {
            name,
            workspaceId,
            type: 'webhook',
            typeSettings: {
              urlSlugText,
              iconType: 'Webhook',
              name: 'Webhook',
              description: options.description || 'Send any data to Clay',
              stages: [],
              ...(options.responseType && { responseType: options.responseType }),
            },
          },
        },
      },
      callerName: 'source creator modal',
    });
  }

  /**
   * Set webhook response type (JSON or PLAIN_TEXT)
   */
  async setWebhookResponseType(
    sourceId: string,
    responseType: 'JSON' | 'PLAIN_TEXT'
  ): Promise<{ success: boolean; responseType: string }> {
    return this.request<{ success: boolean; responseType: string }>(
      'PATCH',
      `/sources/webhook/response-type/${sourceId}`,
      { sourceId, responseType }
    );
  }

  /**
   * Create webhook auth token for a source
   */
  async createWebhookAuthToken(sourceId: string): Promise<unknown> {
    return this.request<unknown>('POST', `/sources/webhook/auth-token/${sourceId}`, {});
  }

  /**
   * Delete a source
   */
  async deleteSource(sourceId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('DELETE', `/sources/${sourceId}`);
  }

  /**
   * Create a Find Companies table using Clay's wizard endpoint (v3)
   * This is the same flow the Clay UI uses - creates table with source attached
   */
  async wizardFindCompanies(
    workspaceId: number,
    workbookId: string,
    options: {
      tableName?: string;
      industries?: string[];
      industriesExclude?: string[];
      locations?: string[];
      locationsExclude?: string[];
      sizes?: string[]; // e.g., ["10"] for 11-50, ["50"] for 51-200
      types?: string[];
      countryNames?: string[];
      annualRevenues?: string[];
      descriptionKeywords?: string[];
      limit?: number;
    } = {}
  ): Promise<unknown> {
    const inputs: Record<string, unknown> = {
      types: options.types || [],
      country_names: options.countryNames || [],
      country_names_exclude: [],
      sizes: options.sizes || [],
      funding_amounts: [],
      annual_revenues: options.annualRevenues || [],
      industries: options.industries || [],
      industries_exclude: options.industriesExclude || [],
      description_keywords_exclude: [],
      description_keywords: options.descriptionKeywords || [],
      minimum_follower_count: null,
      minimum_member_count: null,
      maximum_member_count: null,
      locations: options.locations || [],
      locations_exclude: options.locationsExclude || [],
      semantic_description: '',
      company_identifier: [],
      startFromCompanyType: 'company_identifier',
      exclude_company_identifiers_mixed: [],
      exclude_entities_configuration: [],
      exclude_entities_bitmap: null,
      previous_entities_bitmap: null,
      derived_industries: [],
      derived_subindustries: [],
      derived_subindustries_exclude: [],
      derived_revenue_streams: [],
      derived_business_types: [],
      limit: options.limit || 100,
      tableId: null,
      domainFieldId: null,
      useRadialKnn: false,
      radialKnnMinScore: null,
      has_resolved_domain: null,
      resolved_domain_is_live: null,
      resolved_domain_redirects: null,
      name: '',
    };

    const payload = {
      workbookId,
      wizardId: 'find-companies',
      wizardStepId: 'companies-search',
      formInputs: {
        clientSettings: { tableType: 'company' },
        requiredDataPoint: null,
        basicFields: [
          { name: 'Name', dataType: 'text', formulaText: '{{source}}.name' },
          { name: 'Description', dataType: 'text', formulaText: '{{source}}.description' },
          { name: 'Primary Industry', dataType: 'text', formulaText: '{{source}}.industry' },
          {
            name: 'Size',
            dataType: 'select',
            formulaText: '{{source}}.size',
            options: [
              { id: '74fa2d16-f693-46c9-8c02-c7e701070e41', text: 'Self-employed', color: 'yellow' },
              { id: '5cbc109f-4e3b-46ce-8509-ac4ba6fa31ac', text: '2-10 employees', color: 'blue' },
              { id: 'c65d5708-5c26-498b-a4d0-d6bb2b1293ef', text: '11-50 employees', color: 'green' },
              { id: '80619224-383f-49b1-8ae2-992d874be968', text: '51-200 employees', color: 'red' },
              { id: '25ed21d4-4efc-4ac7-8d17-d883d133c973', text: '201-500 employees', color: 'violet' },
              { id: '36271559-5c6e-47bb-ad51-0f38ca410596', text: '501-1,000 employees', color: 'grey' },
              { id: '83655f25-4774-487c-aaec-2e32996063b3', text: '1,001-5,000 employees', color: 'orange' },
              { id: '70d75a6d-c59c-4d2b-8c06-025d402a2c3e', text: '5,001-10,000 employees', color: 'pink' },
              { id: 'fcc1bb01-2a17-411f-bda2-03330c1c22e8', text: '10,001+ employees', color: 'yellow' },
            ],
          },
          { name: 'Type', dataType: 'text', formulaText: '{{source}}.type' },
          { name: 'Location', dataType: 'text', formulaText: '{{source}}.location' },
          { name: 'Country', dataType: 'text', formulaText: '{{source}}.country' },
          { name: 'Domain', dataType: 'url', formulaText: '{{source}}.domain' },
          { name: 'LinkedIn URL', dataType: 'url', formulaText: '{{source}}.linkedin_url', isDedupeField: true },
        ],
        type: 'companies',
        typeSettings: {
          name: 'Find companies',
          iconType: 'Buildings',
          actionKey: 'find-lists-of-companies-with-mixrank-source',
          actionPackageId: 'e251a70e-46d7-4f3a-b3ef-a211ad3d8bd2',
          previewTextPath: 'name',
          defaultPreviewText: 'Profile',
          recordsPath: 'companies',
          idPath: 'linkedin_company_id',
          scheduleConfig: { runSettings: 'once' },
          inputs,
          hasEvaluatedInputs: true,
          previewActionKey: 'find-lists-of-companies-with-mixrank-source-preview',
        },
      },
      sessionId: crypto.randomUUID(),
      currentStepIndex: 0,
      outputs: [],
      firstUseCase: null,
      parentFolderId: null,
    };

    return this.request<unknown>(
      'POST',
      `/workspaces/${workspaceId}/wizard/evaluate-step`,
      payload
    );
  }

  /**
   * Create a Find People table using Clay's wizard endpoint (v3)
   * This is the same flow the Clay UI uses - creates table with source attached
   *
   * Two modes:
   * 1. Standalone: pass companyDomains directly
   * 2. Linked: pass linkedTable config to pull from existing company table
   */
  async wizardFindPeople(
    workspaceId: number,
    workbookId: string,
    options: {
      companyDomains?: string[]; // Domains to find people at (standalone mode)
      linkedTable?: {
        // Linked mode - pull from existing company table
        tableId: string; // t_xxx
        viewId: string; // gv_xxx
        fieldId: string; // f_xxx - field containing company identifiers
        recordIds: string[]; // r_xxx array
        companyIdentifiers: string[]; // LinkedIn URLs or domains from those records
      };
      jobTitleKeywords?: string[];
      jobTitleExcludeKeywords?: string[];
      seniorityLevels?: string[]; // Owner, Founder, C-Suite, Partner, VP, Director, Manager, Senior, Entry
      jobFunctions?: string[]; // Sales, Marketing, Engineering, etc.
      includePastExperiences?: boolean;
      limit?: number;
      companyIndustries?: string[];
      companySizes?: string[];
      locations?: string[];
    } = {}
  ): Promise<unknown> {
    // Linked mode uses "query", standalone uses "CsvOfCompanies"
    const isLinked = !!options.linkedTable;
    const startFromMethod = isLinked ? 'query' : 'CsvOfCompanies';

    const inputs: Record<string, unknown> = {
      start_from_method: startFromMethod,
      company_identifier: isLinked
        ? options.linkedTable!.companyIdentifiers
        : options.companyDomains || [],
      company_record_id: isLinked ? options.linkedTable!.recordIds : [],
      company_table_field_id: isLinked ? options.linkedTable!.fieldId : '',
      company_table_id: isLinked ? options.linkedTable!.tableId : '',
      company_table_view_id: isLinked ? options.linkedTable!.viewId : '',
      exclude_entities_configuration: [],
      exclude_entities_bitmap: null,
      previous_entities_bitmap: null,
      exclude_entity_bitmap: null,
      languages: [],
      certification_keywords: [],
      school_names: [],
      names: [],
      profile_keywords: [],
      headline_keywords: [],
      about_keywords: [],
      connection_count: null,
      max_connection_count: null,
      follower_count: null,
      max_follower_count: null,
      current_role_min_months_since_start_date: null,
      current_role_max_months_since_start_date: null,
      experience_count: null,
      max_experience_count: null,
      include_past_experiences: options.includePastExperiences || false,
      exclude_people_identifiers_mixed: [],
      job_title_mode: 'smart',
      job_functions: options.jobFunctions || [],
      job_title_seniority_levels: options.seniorityLevels || [],
      locations: options.locations || [],
      locations_exclude: [],
      location_cities_exclude: [],
      location_cities_include: [],
      location_countries_exclude: [],
      location_countries_include: [],
      location_regions_exclude: [],
      location_regions_include: [],
      search_raw_location: false,
      location_states_exclude: [],
      location_states_include: [],
      company_sizes: options.companySizes || [],
      company_industries_exclude: [],
      company_industries_include: options.companyIndustries || [],
      company_description_keywords_exclude: [],
      company_description_keywords: [],
      limit: options.limit || null,
      role_range_start_month: null,
      role_range_end_month: null,
      name: '',
      job_title_exclude_keywords: options.jobTitleExcludeKeywords || [],
      job_title_keywords: options.jobTitleKeywords || [],
      job_description_keywords: [],
    };

    const payload = {
      workbookId,
      wizardId: 'find-people',
      wizardStepId: 'people-search',
      formInputs: {
        clientSettings: { tableType: 'people' },
        requiredDataPoint: null,
        basicFields: [
          { name: 'First Name', dataType: 'text', formulaText: '{{source}}.first_name' },
          { name: 'Last Name', dataType: 'text', formulaText: '{{source}}.last_name' },
          { name: 'Full Name', dataType: 'text', formulaText: '{{source}}.name' },
          { name: 'Job Title', dataType: 'text', formulaText: '{{source}}.latest_experience_title' },
          { name: 'Location', dataType: 'text', formulaText: '{{source}}.location_name' },
          { name: 'Company Domain', dataType: 'url', formulaText: '{{source}}.domain' },
          { name: 'LinkedIn Profile', dataType: 'url', formulaText: '{{source}}.url', isDedupeField: true },
        ],
        type: 'people',
        typeSettings: {
          name: 'Find people',
          iconType: 'User',
          actionKey: 'find-lists-of-people-with-mixrank-source',
          actionPackageId: 'e251a70e-46d7-4f3a-b3ef-a211ad3d8bd2',
          previewTextPath: 'name',
          defaultPreviewText: 'Clay Profile',
          recordsPath: 'people',
          idPath: 'profile_id',
          scheduleConfig: { runSettings: 'once' },
          dedupeOnUniqueIds: true,
          inputs,
          hasEvaluatedInputs: true,
          previewActionKey: 'find-lists-of-people-with-mixrank-source-preview',
        },
      },
      sessionId: crypto.randomUUID(),
      currentStepIndex: 0,
      outputs: [],
      firstUseCase: null,
      parentFolderId: null,
    };

    return this.request<unknown>(
      'POST',
      `/workspaces/${workspaceId}/wizard/evaluate-step`,
      payload
    );
  }
}

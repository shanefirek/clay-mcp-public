/**
 * Field Tools
 *
 * Tools for creating formula and AI columns.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { ClayClient } from '../client.js';
import type { TableId, ViewId, FieldId } from '../types/clay.js';
import { tableId, viewId, fieldId, nonEmptyString, authAccountId } from '../validation.js';

export function registerFieldTools(server: McpServer, client: ClayClient): void {
  /**
   * clay_create_field - Create a field of any basic type
   */
  server.registerTool(
    'clay_create_field',
    {
      title: 'Create Field',
      description:
        'Create a column in a Clay table. Supports: text, number, email, url, date, boolean (checkbox), select (dropdown - options added via UI), currency, image.',
      inputSchema: {
        tableId: tableId(),
        name: nonEmptyString.describe('Column name'),
        type: z
          .enum([
            'text',
            'number',
            'email',
            'url',
            'date',
            'boolean',
            'select',
            'currency',
            'image',
          ])
          .describe('Field type'),
      },
    },
    async ({ tableId, name, type }) => {
      try {
        const field = await client.createField(tableId as TableId, name, type);
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
              text: `Error creating field: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_update_field - Update a field's configuration
   */
  server.registerTool(
    'clay_update_field',
    {
      title: 'Update Field',
      description:
        'Update an existing field\'s configuration (name, typeSettings, inputsBinding, etc.) without deleting and recreating it. Preserves downstream references. Use clay_get_field_config first to see the current config. Note: "Field name must be unique" errors can be caused by live fields with the same name OR ghost fields (soft-deleted but name still reserved). For ghosts, try a slightly different name.',
      inputSchema: {
        tableId: tableId(),
        fieldId: fieldId(),
        updates: z
          .record(z.unknown())
          .describe(
            'Partial field config to merge. Examples: { "name": "New Name" }, { "typeSettings": { "formulaText": "..." } }, { "typeSettings": { "inputsBinding": [...] } }'
          ),
      },
    },
    async ({ tableId, fieldId, updates }) => {
      try {
        const field = await client.updateField(
          tableId as TableId,
          fieldId as FieldId,
          updates as Record<string, unknown>
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
              text: `Error updating field: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_delete_field - Delete a field from a table
   */
  server.registerTool(
    'clay_delete_field',
    {
      title: 'Delete Field',
      description: 'Delete a column from a Clay table. This is permanent.',
      inputSchema: {
        tableId: tableId(),
        fieldId: fieldId(),
      },
    },
    async ({ tableId, fieldId }) => {
      try {
        await client.deleteField(tableId as TableId, fieldId as FieldId);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Field ${fieldId} deleted successfully`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error deleting field: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_generate_formula - Generate a formula using AI
   */
  server.registerTool(
    'clay_generate_formula',
    {
      title: 'Generate Formula with AI',
      description:
        'Generate a formula using AI from a natural language description. Returns the formula text that can be used with clay_create_formula_field. The AI will analyze sample data and handle edge cases.',
      inputSchema: {
        tableId: tableId(),
        prompt: nonEmptyString.describe(
          'Natural language description of what the formula should do. Examples: "Combine First Name and Last Name with a space", "Calculate total price from quantity times unit price", "Extract domain from email address"'
        ),
      },
    },
    async ({ tableId, prompt }) => {
      try {
        const result = await client.generateFormula(tableId as TableId, prompt);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                formula: result.formula,
                dataType: result.dataType,
                message: `Generated formula: ${result.formula}`,
                usage: `Use this formula with clay_create_formula_field:\n  formulaText: "${result.formula.replace(/"/g, '\\"')}"`,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error generating formula: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_create_text_field - Create a simple editable text column (convenience wrapper)
   */
  server.registerTool(
    'clay_create_text_field',
    {
      title: 'Create Text Field',
      description:
        'Create a simple editable text column in a Clay table. Shorthand for clay_create_field with type="text".',
      inputSchema: {
        tableId: tableId(),
        name: nonEmptyString.describe('Column name'),
      },
    },
    async ({ tableId, name }) => {
      try {
        const field = await client.createTextField(tableId as TableId, name);
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
              text: `Error creating text field: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_create_formula_field - Create a formula column
   */
  server.registerTool(
    'clay_create_formula_field',
    {
      title: 'Create Formula Field',
      description: 'Create a formula column in a Clay table. Can use raw formula syntax OR natural language with AI generation.',
      inputSchema: {
        tableId: tableId(),
        name: nonEmptyString.describe('Column name'),
        formulaText: z
          .string()
          .optional()
          .describe(
            'Raw formula using {{f_fieldId}} or {{Field Name}} syntax. Example: {{f_abc123}} + " " + {{First Name}}. If not provided, use prompt instead.'
          ),
        prompt: z
          .string()
          .optional()
          .describe(
            'Natural language description for AI formula generation. Example: "Combine First Name and Last Name with a space". If provided, AI will generate the formula.'
          ),
        viewId: viewId('View ID (gv_xxx format) to add the column to'),
      },
    },
    async ({ tableId, name, formulaText, prompt, viewId }) => {
      try {
        let finalFormula = formulaText;

        // If prompt is provided (and no raw formula), use AI to generate
        if (prompt && !formulaText) {
          const generated = await client.generateFormula(tableId as TableId, prompt);
          finalFormula = generated.formula;
        }

        if (!finalFormula) {
          throw new Error('Either formulaText or prompt must be provided');
        }

        const field = await client.createFormulaField(
          tableId as TableId,
          name,
          finalFormula,
          viewId as ViewId
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                field,
                generatedFormula: prompt ? finalFormula : undefined,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error creating formula field: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_create_ai_field - Create a direct LLM column (Use AI)
   */
  server.registerTool(
    'clay_create_ai_field',
    {
      title: 'Create AI Field',
      description:
        'Create a direct LLM column (Use AI). For web research with citations, use clay_create_claygent_field instead. This is for text generation, summarization, and extraction without web browsing.',
      inputSchema: {
        tableId: tableId(),
        name: nonEmptyString.describe('Column name'),
        prompt: nonEmptyString.describe(
          'AI prompt. Use {FieldName} to reference columns. Examples: "What is AI?", "Summarize {Description}", "Extract the company name from {Text}"'
        ),
        model: z
          .enum([
            'gpt-4.1-mini',
            'claude-3-5-sonnet',
            'o4-mini',
          ])
          .optional()
          .describe(
            'AI model. Default: gpt-4.1-mini. Options: gpt-4.1-mini, claude-3-5-sonnet, o4-mini'
          ),
      },
    },
    async ({ tableId, name, prompt, model }) => {
      try {
        const field = await client.createAIField(
          tableId as TableId,
          name,
          prompt,
          { model }
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
              text: `Error creating AI field: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_create_http_api_field - Create an HTTP API column for calling external APIs
   */
  server.registerTool(
    'clay_create_http_api_field',
    {
      title: 'Create HTTP API Field',
      description:
        'Create an HTTP API column for calling external REST APIs. Supports GET, POST, PUT, PATCH, DELETE with headers, body, query params. Use {FieldName} to reference columns in URL or body. Returns JSON response.',
      inputSchema: {
        tableId: tableId(),
        name: nonEmptyString.describe('Column name'),
        url: nonEmptyString.describe(
          'API endpoint URL. Use {FieldName} to insert column values. Example: "https://api.example.com/users/{Email}"'
        ),
        method: z
          .enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
          .optional()
          .describe('HTTP method. Default: GET'),
        headers: z
          .record(z.string())
          .optional()
          .describe(
            'Request headers as key-value pairs. Example: { "Content-Type": "application/json", "Authorization": "Bearer xxx" }'
          ),
        body: z
          .string()
          .optional()
          .describe(
            'Request body (for POST/PUT/PATCH). Use {FieldName} for column values. Example: \'{"name": "{Name}", "email": "{Email}"}\''
          ),
        queryParams: z
          .record(z.string())
          .optional()
          .describe(
            'Query parameters as key-value pairs. Use {FieldName} for column values. Example: { "search": "{Company}" }'
          ),
        authAccountId: authAccountId('HTTP API account ID (aa_xxx) for authentication headers. Get from clay_list_tables or Clay UI.').optional(),
        responseFieldPaths: z
          .array(z.string())
          .optional()
          .describe(
            'JSONPath expressions to extract specific values from response. Example: ["data.results", "meta.total"]'
          ),
        followRedirects: z
          .boolean()
          .optional()
          .describe('Follow HTTP redirects. Default: true'),
        shouldRetry: z
          .boolean()
          .optional()
          .describe('Retry on failure. Default: true'),
        maxRetries: z.number().optional().describe('Max retry attempts'),
        responseTimeout: z.number().optional().describe('Response timeout in ms'),
      },
    },
    async ({
      tableId,
      name,
      url,
      method,
      headers,
      body,
      queryParams,
      authAccountId,
      responseFieldPaths,
      followRedirects,
      shouldRetry,
      maxRetries,
      responseTimeout,
    }) => {
      try {
        const field = await client.createHttpApiField(tableId as TableId, name, {
          url,
          method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | undefined,
          headers,
          body,
          queryParams,
          authAccountId,
          responseFieldPaths,
          followRedirects,
          shouldRetry,
          maxRetries,
          responseTimeout,
        });
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
              text: `Error creating HTTP API field: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_create_claygent_field - Create a Claygent web research column
   */
  server.registerTool(
    'clay_create_claygent_field',
    {
      title: 'Create Claygent Field',
      description:
        'Create a Claygent column for AI-powered web research. Claygent browses the web, extracts data, and returns structured results with citations. Use this for company research, finding contact info, news monitoring, etc.',
      inputSchema: {
        tableId: tableId(),
        name: nonEmptyString.describe('Column name'),
        prompt: nonEmptyString.describe(
          'Research prompt. Use {FieldName} to reference columns. Examples: "Research {Company Domain} and describe what they do", "Find the CEO of {Company} and their LinkedIn URL", "What recent news is there about {Company}?"'
        ),
        metaprompt: z
          .string()
          .optional()
          .describe(
            'Short task description shown in UI (defaults to first 100 chars of prompt)'
          ),
        model: z
          .enum(['clay-neon', 'clay-argon'])
          .optional()
          .describe(
            'Claygent model. Default: clay-neon (faster). clay-argon for complex multi-hop reasoning.'
          ),
        outputFields: z
          .record(
            z.object({
              type: z.string().describe('Field type: string, number, boolean, array'),
              description: z.string().describe('Description of what this field contains'),
            })
          )
          .optional()
          .describe(
            'Structured output schema. Example: { "companyDescription": { "type": "string", "description": "One sentence company description" }, "founded": { "type": "number", "description": "Year founded" } }'
          ),
        maxCostInCents: z
          .number()
          .optional()
          .describe('Maximum cost in cents per run'),
      },
    },
    async ({ tableId, name, prompt, metaprompt, model, outputFields, maxCostInCents }) => {
      try {
        const field = await client.createClaygentField(
          tableId as TableId,
          name,
          prompt,
          {
            model: model as 'clay-neon' | 'clay-argon' | undefined,
            metaprompt,
            outputFields,
            maxCostInCents,
          }
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
              text: `Error creating Claygent field: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_generate_prompt - Generate an optimized prompt using Clay's metaprompter AI
   */
  server.registerTool(
    'clay_generate_prompt',
    {
      title: 'Generate Prompt',
      description:
        'Generate an optimized prompt for Claygent or AI fields using Clay\'s metaprompter AI. Given a task description, returns: suggested use case (claygent vs use-ai), suggested model, and a fully optimized prompt with structured instructions.',
      inputSchema: {
        tableId: tableId('Table ID (t_xxx format) - used to get available columns for context'),
        taskDescription: nonEmptyString.describe(
          'What you want the AI to do. Use {FieldName} to reference columns. Examples: "Research {Company} and describe what they do", "Find the CEO of {Company}", "Summarize {Description}"'
        ),
        existingPrompt: z
          .string()
          .optional()
          .describe('Optional existing prompt to improve. Leave empty to generate a new prompt from scratch.'),
        latencyBudget: z
          .enum(['high', 'low'])
          .optional()
          .describe('Quality vs speed tradeoff. "high" = better quality (default), "low" = faster response'),
      },
    },
    async ({ tableId, taskDescription, existingPrompt, latencyBudget }) => {
      try {
        const result = await client.generatePrompt(
          tableId as TableId,
          taskDescription,
          {
            existingPrompt,
            latencyBudget: latencyBudget as 'high' | 'low' | undefined,
          }
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                suggestedUseCase: result.suggestedUseCase,
                suggestedModel: result.suggestedModel,
                useCaseReasoning: result.useCaseReasoning,
                modelReasoning: result.modelReasoning,
                generatedPrompt: result.generatedPrompt,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error generating prompt: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

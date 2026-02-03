/**
 * Claygent Prompt Template Tools
 *
 * Pre-built prompt templates for common sales workflows.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { ClayClient } from '../client.js';
import type { TableId } from '../types/clay.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { tableId, nonEmptyString } from '../validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TemplateOutputField {
  type: string;
  description: string;
}

interface ClaygentTemplate {
  name: string;
  description: string;
  category: string;
  model: string;
  prompt: string;
  outputFields: Record<string, TemplateOutputField>;
  requiredFields: string[];
}

interface TemplateRegistry {
  _meta: {
    description: string;
    version: string;
    usage: string;
  };
  templates: Record<string, ClaygentTemplate>;
}

function loadTemplates(): TemplateRegistry {
  const templatesPath = path.join(__dirname, '..', 'templates', 'claygent-prompts.json');
  const content = fs.readFileSync(templatesPath, 'utf-8');
  return JSON.parse(content) as TemplateRegistry;
}

export function registerTemplateTools(server: McpServer, client: ClayClient): void {
  /**
   * clay_list_prompt_templates - List all available Claygent prompt templates
   */
  server.registerTool(
    'clay_list_prompt_templates',
    {
      title: 'List Prompt Templates',
      description:
        'List all available pre-built Claygent prompt templates for common sales workflows like news finding, competitor research, hiring signals, etc.',
      inputSchema: {
        category: z
          .string()
          .optional()
          .describe(
            'Filter by category: research, signals, prospecting, personalization, qualification'
          ),
      },
    },
    async ({ category }) => {
      try {
        const registry = loadTemplates();
        const templates = Object.entries(registry.templates)
          .filter(([_, template]) => !category || template.category === category)
          .map(([id, template]) => ({
            id,
            name: template.name,
            description: template.description,
            category: template.category,
            model: template.model,
            requiredFields: template.requiredFields,
          }));

        const categories = [...new Set(Object.values(registry.templates).map((t) => t.category))];

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  totalTemplates: templates.length,
                  categories,
                  templates,
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
              text: `Error listing templates: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_get_prompt_template - Get a specific prompt template with full details
   */
  server.registerTool(
    'clay_get_prompt_template',
    {
      title: 'Get Prompt Template',
      description:
        'Get full details of a specific Claygent prompt template including the prompt, output schema, and required fields.',
      inputSchema: {
        templateId: nonEmptyString.describe(
          'Template ID (e.g., news-finder, competitor-research, hiring-signals, tech-stack-research, decision-maker-finder, funding-signals, pre-call-brief, linkedin-post-analyzer, icp-fit-scorer, case-study-finder)'
        ),
      },
    },
    async ({ templateId }) => {
      try {
        const registry = loadTemplates();
        const template = registry.templates[templateId];

        if (!template) {
          const availableIds = Object.keys(registry.templates);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Template "${templateId}" not found. Available templates: ${availableIds.join(', ')}`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  id: templateId,
                  ...template,
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
              text: `Error getting template: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * clay_create_claygent_from_template - Create a Claygent field using a template
   */
  server.registerTool(
    'clay_create_claygent_from_template',
    {
      title: 'Create Claygent from Template',
      description:
        'Create a Claygent field using a pre-built template. Automatically maps field names from your table to the template variables.',
      inputSchema: {
        tableId: tableId(),
        templateId: nonEmptyString.describe(
          'Template ID (e.g., news-finder, competitor-research, hiring-signals)'
        ),
        fieldName: z
          .string()
          .optional()
          .describe('Custom name for the field (defaults to template name)'),
        fieldMapping: z
          .record(z.string())
          .optional()
          .describe(
            'Map template variables to your field names. Example: {"Company Name": "Account Name", "Domain": "Website"}'
          ),
      },
    },
    async ({ tableId, templateId, fieldName, fieldMapping }) => {
      try {
        const registry = loadTemplates();
        const template = registry.templates[templateId];

        if (!template) {
          const availableIds = Object.keys(registry.templates);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Template "${templateId}" not found. Available templates: ${availableIds.join(', ')}`,
              },
            ],
            isError: true,
          };
        }

        // Apply field mapping to the prompt
        let prompt = template.prompt;
        if (fieldMapping) {
          for (const [templateVar, fieldName] of Object.entries(fieldMapping)) {
            // Replace {{Template Var}} with {{Field Name}}
            const regex = new RegExp(`\\{\\{${templateVar}\\}\\}`, 'g');
            prompt = prompt.replace(regex, `{{${fieldName}}}`);
          }
        }

        // Convert {{Field Name}} to {Field Name} for the API
        prompt = prompt.replace(/\{\{([^}]+)\}\}/g, '{$1}');

        // Create the Claygent field
        const response = await client.createClaygentField(
          tableId as TableId,
          fieldName || template.name,
          prompt,
          {
            model: template.model as 'clay-neon' | 'clay-argon',
            metaprompt: template.description,
            outputFields: template.outputFields,
          }
        );

        // Handle both response formats (wrapped or direct)
        const fieldData = (response as { field?: { id: string; name: string } }).field || response;
        const fieldId = (fieldData as { id: string }).id;
        const createdFieldName = (fieldData as { name: string }).name;

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  templateUsed: templateId,
                  fieldId,
                  fieldName: createdFieldName,
                  requiredInputFields: template.requiredFields,
                  outputFields: Object.keys(template.outputFields),
                  message: `Created "${createdFieldName}" Claygent field from template "${template.name}"`,
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
              text: `Error creating Claygent from template: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

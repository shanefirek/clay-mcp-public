# Clay MCP Server API Reference

Complete reference for all 43 tools available in the Clay MCP server.

## Table of Contents

- [Tables & Views](#tables--views)
- [Records](#records)
- [Fields](#fields)
- [AI & Claygent](#ai--claygent)
- [Enrichments](#enrichments)
- [Discovery & Registry](#discovery--registry)
- [Templates](#templates)

---

## Tables & Views

### `clay_list_tables`

List all tables in a Clay workspace.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID (numeric string) |

**Example:**
```json
{
  "workspaceId": "712043"
}
```

---

### `clay_get_table`

Get table schema including all columns, formulas, enrichment configs, and views.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |

**Example:**
```json
{
  "tableId": "t_abc123xyz"
}
```

**Returns:** Full table schema with fields, views, fieldGroupMap (waterfalls), and settings.

---

### `clay_create_table`

Create a new table in a Clay workbook.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Name for the new table |
| `workbookId` | string | Yes | Workbook ID (wb_xxx format) |
| `workspaceId` | number | Yes | Workspace ID (numeric) |
| `type` | enum | No | Table type: `spreadsheet` (default), `company`, `people`, `jobs` |

**Example:**
```json
{
  "name": "AI Startups Pipeline",
  "workbookId": "wb_abc123",
  "workspaceId": 712043,
  "type": "company"
}
```

---

### `clay_create_workbook`

Create a new workbook in a Clay workspace.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Name for the new workbook |
| `workspaceId` | number | Yes | Workspace ID (numeric) |

---

### `clay_duplicate_table`

Create a copy of a Clay table with all fields, views, and records.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID to duplicate (t_xxx format) |

---

### `clay_export_table`

Export a Clay table view to CSV. Polls for completion and returns download URL.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `viewId` | string | Yes | View ID to export (gv_xxx format) |

**Returns:** Export job with download URL when complete.

---

### `clay_share_table`

Create a shareable link for a Clay table.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `sharingType` | enum | No | `public` (default), `restricted`, `private` |
| `viewId` | string | No | View ID to share (gv_xxx format) |
| `sharedUserEmails` | string | No | Comma-separated emails for restricted sharing |

---

### `clay_duplicate_view`

Create a copy of a view with all its filters and settings.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `viewId` | string | Yes | View ID to duplicate (gv_xxx format) |

---

### `clay_filter_view`

Set filters on a view.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `viewId` | string | Yes | View ID (gv_xxx format) |
| `combinationMode` | enum | No | `AND` (default) or `OR` |
| `filters` | array | Yes | Array of filter conditions |

**Filter Object:**
| Name | Type | Description |
|------|------|-------------|
| `fieldId` | string | Field ID to filter on (f_xxx format) |
| `operator` | string | `EQUAL`, `NOT_EQUAL`, `CONTAIN`, `NOT_CONTAIN`, `EMPTY`, `NOT_EMPTY`, `HAS_ERROR`, `RESULTS`, `NO_RESULTS` |
| `value` | any | Filter value (not needed for EMPTY, NOT_EMPTY, etc.) |

**Example:**
```json
{
  "tableId": "t_abc123",
  "viewId": "gv_xyz789",
  "combinationMode": "AND",
  "filters": [
    { "fieldId": "f_email", "operator": "NOT_EMPTY" },
    { "fieldId": "f_score", "operator": "GREATER_THAN", "value": 80 }
  ]
}
```

---

### `clay_delete_view`

Delete a view from a table. Cannot delete the default view.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `viewId` | string | Yes | View ID to delete (gv_xxx format) |

---

## Records

### `clay_create_record`

Create a new record in a Clay table.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `data` | object | No | Key-value pairs of fieldId: value |

**Example:**
```json
{
  "tableId": "t_abc123",
  "data": {
    "f_company": "OpenAI",
    "f_domain": "openai.com"
  }
}
```

---

### `clay_get_record`

Get a single record by its ID.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `recordId` | string | Yes | Record ID (r_xxx format) |

---

### `clay_batch_create_records`

Create multiple records in a Clay table at once.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `records` | array | Yes | Array of objects with fieldId: value pairs |

**Example:**
```json
{
  "tableId": "t_abc123",
  "records": [
    { "f_company": "OpenAI", "f_domain": "openai.com" },
    { "f_company": "Anthropic", "f_domain": "anthropic.com" }
  ]
}
```

---

### `clay_update_record`

Update a record in a Clay table.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `recordId` | string | Yes | Record ID (r_xxx format) |
| `data` | object | Yes | Key-value pairs of fieldId: value to update |

---

### `clay_delete_records`

Delete one or more records from a Clay table.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `recordIds` | array | Yes | Array of record IDs (r_xxx format) to delete |

---

### `clay_search_records`

Search for records in a Clay table view.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `viewId` | string | Yes | View ID (gv_xxx format) |
| `searchTerm` | string | Yes | Search term to find |

---

### `clay_bulk_fetch_records`

Fetch multiple records by their IDs.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `recordIds` | array | Yes | Array of record IDs (r_xxx format) to fetch |

---

## Fields

### `clay_create_field`

Create a column in a Clay table.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `name` | string | Yes | Column name |
| `type` | enum | Yes | `text`, `number`, `email`, `url`, `date`, `boolean`, `select`, `currency`, `image` |

---

### `clay_create_text_field`

Create a simple editable text column (shorthand).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `name` | string | Yes | Column name |

---

### `clay_create_formula_field`

Create a formula column in a Clay table.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `name` | string | Yes | Column name |
| `formulaText` | string | Yes | Formula using `{{f_fieldId}}` or `{{Field Name}}` syntax |
| `viewId` | string | Yes | View ID (gv_xxx format) to add the column to |

**Example:**
```json
{
  "tableId": "t_abc123",
  "name": "Full Name",
  "formulaText": "{{f_firstName}} + \" \" + {{f_lastName}}",
  "viewId": "gv_xyz789"
}
```

---

### `clay_delete_field`

Delete a column from a Clay table. This is permanent.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `fieldId` | string | Yes | Field ID (f_xxx format) |

---

## AI & Claygent

### `clay_create_ai_field`

Create a direct LLM column (Use AI). For text generation, summarization, and extraction without web browsing.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `name` | string | Yes | Column name |
| `prompt` | string | Yes | AI prompt. Use `{FieldName}` to reference columns |
| `model` | enum | No | `gpt-4.1-mini` (default), `claude-3-5-sonnet`, `o4-mini` |

**Example:**
```json
{
  "tableId": "t_abc123",
  "name": "Company Summary",
  "prompt": "Summarize what {Company Name} does in one sentence based on: {Description}",
  "model": "gpt-4.1-mini"
}
```

---

### `clay_create_claygent_field`

Create a Claygent column for AI-powered web research. Claygent browses the web, extracts data, and returns structured results with citations.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `name` | string | Yes | Column name |
| `prompt` | string | Yes | Research prompt. Use `{FieldName}` to reference columns |
| `metaprompt` | string | No | Short task description shown in UI |
| `model` | enum | No | `clay-neon` (default, faster) or `clay-argon` (complex reasoning) |
| `outputFields` | object | No | Structured output schema |
| `maxCostInCents` | number | No | Maximum cost in cents per run |

**Output Fields Schema:**
```json
{
  "companyDescription": {
    "type": "string",
    "description": "One sentence company description"
  },
  "founded": {
    "type": "number",
    "description": "Year founded"
  },
  "isHiring": {
    "type": "boolean",
    "description": "Whether the company is currently hiring"
  }
}
```

**Example:**
```json
{
  "tableId": "t_abc123",
  "name": "Company Research",
  "prompt": "Research {Company Domain} and describe what they do, when they were founded, and if they're hiring.",
  "model": "clay-neon",
  "outputFields": {
    "description": { "type": "string", "description": "What the company does" },
    "founded": { "type": "number", "description": "Year founded" },
    "isHiring": { "type": "boolean", "description": "Currently hiring" }
  }
}
```

---

### `clay_create_http_api_field`

Create an HTTP API column for calling external REST APIs.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `name` | string | Yes | Column name |
| `url` | string | Yes | API endpoint URL. Use `{FieldName}` for column values |
| `method` | enum | No | `GET` (default), `POST`, `PUT`, `PATCH`, `DELETE` |
| `headers` | object | No | Request headers as key-value pairs |
| `body` | string | No | Request body for POST/PUT/PATCH |
| `queryParams` | object | No | Query parameters as key-value pairs |
| `authAccountId` | string | No | HTTP API account ID (aa_xxx) for auth |
| `responseFieldPaths` | array | No | JSONPath expressions to extract from response |
| `followRedirects` | boolean | No | Follow HTTP redirects (default: true) |
| `shouldRetry` | boolean | No | Retry on failure (default: true) |
| `maxRetries` | number | No | Max retry attempts |
| `responseTimeout` | number | No | Response timeout in ms |

**Example:**
```json
{
  "tableId": "t_abc123",
  "name": "Company Info",
  "url": "https://api.example.com/companies/{Domain}",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer xxx",
    "Content-Type": "application/json"
  },
  "responseFieldPaths": ["data.name", "data.employees"]
}
```

---

### `clay_generate_prompt`

Generate an optimized prompt for Claygent or AI fields using Clay's metaprompter AI.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) - used to get available columns |
| `taskDescription` | string | Yes | What you want the AI to do |
| `existingPrompt` | string | No | Existing prompt to improve |
| `latencyBudget` | enum | No | `high` (default, better quality) or `low` (faster) |

**Returns:**
- `suggestedUseCase`: `claygent` or `use-ai`
- `suggestedModel`: Recommended model
- `useCaseReasoning`: Why this use case
- `modelReasoning`: Why this model
- `generatedPrompt`: Fully optimized prompt

---

## Enrichments

### `clay_list_enrichments`

List all available enrichment providers from the registry.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `category` | string | No | Filter by category: `email-finders`, `crm`, `core`, `company-enrichment`, etc. |

**Returns:** Providers grouped by category with inputs, outputs, and auth requirements.

---

### `clay_create_enrichment`

Create an enrichment column using a provider from the registry.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `enrichmentName` | string | Yes | Enrichment name from registry |
| `fieldName` | string | Yes | Name for the new column |
| `inputMapping` | object | Yes | Map enrichment inputs to field IDs |
| `useOwnAccount` | boolean | No | Use your own account instead of Clay credits |
| `authAccountId` | string | No | Specific auth account ID (overrides useOwnAccount) |

**Example:**
```json
{
  "tableId": "t_abc123",
  "enrichmentName": "hunter-find-email",
  "fieldName": "Work Email",
  "inputMapping": {
    "full_name": "f_name",
    "domain": "f_domain"
  }
}
```

---

### `clay_create_waterfall_field`

Create a waterfall enrichment column with multiple data providers. Providers are tried in order until one succeeds.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `name` | string | Yes | Column name |
| `waterfallConfigs` | array | Yes | Array of enrichment providers to try in order |
| `runMode` | enum | No | `DONT_RUN` (default), `RUN_ALL`, `RUN_SAMPLE` |

**Waterfall Config Object:**
| Name | Type | Description |
|------|------|-------------|
| `name` | string | Display name for this provider step |
| `actionKey` | string | Action key (e.g., "findymail-find-work-email") |
| `actionPackageId` | string | Action package ID (UUID format) |
| `inputsBinding` | array | Input bindings with `name` and `formulaText` |
| `attributePath` | string | Path to output attribute (e.g., "email") |

**Example:**
```json
{
  "tableId": "t_abc123",
  "name": "Work Email",
  "waterfallConfigs": [
    {
      "name": "Findymail",
      "actionKey": "findymail-find-work-email",
      "actionPackageId": "9515bb04-4267-4074-94eb-653545c3c38f",
      "attributePath": "email",
      "inputsBinding": [
        { "name": "full_name", "formulaText": "{{f_name}}" },
        { "name": "company_domain", "formulaText": "{{f_domain}}" }
      ]
    },
    {
      "name": "Hunter",
      "actionKey": "find-email-v2",
      "actionPackageId": "9cfc7721-5c91-423b-a0b0-4cc1f42c6089",
      "attributePath": "email",
      "inputsBinding": [
        { "name": "full_name", "formulaText": "{{f_name}}" },
        { "name": "domain", "formulaText": "{{f_domain}}" }
      ]
    }
  ]
}
```

---

### `clay_create_email_waterfall`

Create an email finder waterfall using providers from the registry. Simplified interface for common email finding patterns.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `fieldName` | string | Yes | Name for the waterfall column |
| `inputMapping` | object | Yes | Map your fields to enrichment inputs |
| `providers` | array | No | Provider names in order (default: all available) |
| `useOwnAccounts` | boolean | No | Use your own accounts instead of Clay credits |

**Input Mapping:**
| Name | Type | Description |
|------|------|-------------|
| `firstName` | string | Field ID for first name |
| `lastName` | string | Field ID for last name |
| `fullName` | string | Field ID for full name (alternative to first+last) |
| `domain` | string | **Required.** Field ID for company domain |
| `company` | string | Field ID for company name |

**Example:**
```json
{
  "tableId": "t_abc123",
  "fieldName": "Work Email",
  "inputMapping": {
    "fullName": "f_name",
    "domain": "f_domain"
  },
  "providers": ["findymail", "hunter", "leadmagic"]
}
```

---

### `clay_run_enrichment`

Run enrichments on specific records and fields.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `fieldIds` | array | Yes | Field IDs (f_xxx format) to run enrichment on |
| `recordIds` | array | Yes | Record IDs (r_xxx format) to enrich |
| `forceRun` | boolean | No | Force re-run even if data exists (default: false) |

---

### `clay_wait_for_enrichment`

Wait for enrichment to complete on specific records and fields.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `fieldIds` | array | Yes | Field IDs (f_xxx format) to wait on |
| `recordIds` | array | Yes | Record IDs (r_xxx format) to wait on |
| `timeoutMs` | number | No | Timeout in milliseconds (default: 120000) |
| `pollIntervalMs` | number | No | Poll interval in milliseconds (default: 2000) |

**Returns:** Success status, completed/failed counts, and enriched values.

---

## Discovery & Registry

### `clay_discover`

Discover all your Clay workspaces, workbooks, tables, and their columns.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `includeFields` | boolean | No | Include field details for each table (default: true) |

**Returns:** Hierarchical structure of workspaces → workbooks → tables → fields with IDs and URLs.

---

### `clay_list_integrations`

List all connected app accounts/integrations in a workspace.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID (numeric string) |

**Returns:** Connected accounts (HubSpot, Salesforce, Google Sheets, etc.) with account IDs for CRM write-back.

---

### `clay_list_claygents`

List all saved Claygent configurations in a workspace.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID (numeric string) |

---

### `clay_search_enrichments`

Search Clay's enrichment catalog to find available data providers.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID (numeric string) |
| `query` | string | Yes | Search query (e.g., "find email", "company data") |

---

### `clay_list_available_actions`

List available enrichment actions and their actionPackageIds from the API.

**Parameters:** None

---

### `clay_get_registry`

Get the full local enrichment provider registry.

**Parameters:** None

**Returns:** All 84+ providers organized by category.

---

### `clay_get_providers_by_category`

Get all providers in a specific category.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `category` | string | Yes | Category: `email-finders`, `crm`, `ai`, `data`, etc. |

---

### `clay_add_enrichment_provider`

Add a new enrichment provider to the local registry.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `category` | string | Yes | Category for the provider |
| `name` | string | Yes | Short name (e.g., "leadmagic") |
| `actionKey` | string | Yes | Action key from the API |
| `actionPackageId` | string | Yes | Action package ID (UUID) |
| `displayName` | string | No | Human-readable display name |
| `description` | string | No | Description of what this provider does |
| `inputFields` | array | No | List of input field names |
| `outputFields` | array | No | List of output field names |

---

### `clay_get_waterfall_presets`

Get pre-built waterfall templates for common enrichment patterns.

**Parameters:** None

**Returns:** Email finder and phone finder waterfall templates with recommended provider order.

---

## Templates

### `clay_list_prompt_templates`

List all available pre-built Claygent prompt templates.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `category` | string | No | Filter by category: `research`, `signals`, `prospecting`, `personalization`, `qualification` |

**Available Templates:**
- `news-finder` - Find recent news about a company
- `competitor-research` - Research competitors
- `hiring-signals` - Analyze hiring activity
- `tech-stack-research` - Identify technologies used
- `decision-maker-finder` - Find key decision makers
- `funding-signals` - Track funding and investment
- `pre-call-brief` - Generate meeting preparation
- `linkedin-post-analyzer` - Analyze LinkedIn activity
- `icp-fit-scorer` - Score ICP fit
- `case-study-finder` - Find relevant case studies

---

### `clay_get_prompt_template`

Get full details of a specific Claygent prompt template.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `templateId` | string | Yes | Template ID (e.g., `news-finder`, `hiring-signals`) |

**Returns:** Full template with prompt, output schema, required fields, and model recommendation.

---

### `clay_create_claygent_from_template`

Create a Claygent field using a pre-built template.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableId` | string | Yes | Table ID (t_xxx format) |
| `templateId` | string | Yes | Template ID |
| `fieldName` | string | No | Custom name (defaults to template name) |
| `fieldMapping` | object | No | Map template variables to your field names |

**Example:**
```json
{
  "tableId": "t_abc123",
  "templateId": "news-finder",
  "fieldName": "Recent News",
  "fieldMapping": {
    "Company Name": "Account Name",
    "Domain": "Website"
  }
}
```

---

## ID Formats Reference

| Type | Format | Example |
|------|--------|---------|
| Table ID | `t_xxx` | `t_0t8m68xYsxTQJV5Jdhe` |
| View ID | `gv_xxx` | `gv_0t8m68xjZrkpt3DBrbw` |
| Field ID | `f_xxx` | `f_0t8m6kwBTxmnPr6AbBg` |
| Record ID | `r_xxx` | `r_0t8m6lcUwKiP4HPSrge` |
| Workbook ID | `wb_xxx` | `wb_0t8m68nEJ2fPZH6GuRz` |
| Auth Account ID | `aa_xxx` | `aa_6vklGXhaYDrB` |
| Source ID | `s_xxx` | `s_0t8m698eKgfWqzY9XAG` |
| Group ID | `gr_xxx` | `gr_0t8m7dtKRztd4wv73Dg` |
| Workspace ID | numeric | `712043` |

---

## Enrichment Provider Categories

| Category | Providers | Description |
|----------|-----------|-------------|
| `email-finders` | 17 | Find work emails (Findymail, Hunter, LeadMagic, etc.) |
| `company-enrichment` | 12 | Enrich company data (Clearbit, Apollo, etc.) |
| `person-enrichment` | 8 | Enrich person data |
| `phone-enrichment` | 5 | Find phone numbers |
| `crm` | 10 | CRM integrations (HubSpot, Salesforce) |
| `social` | 6 | Social media enrichment |
| `data-sources` | 8 | Data import sources |
| `ai` | 4 | AI/LLM providers |
| `core` | 6 | Core utilities (domain lookup, etc.) |
| `validation` | 4 | Email/data validation |
| `job-data` | 2 | Job posting data |
| `other` | 2 | Miscellaneous |

---

## Authentication

The Clay MCP server uses session cookie authentication. Set the `CLAY_SESSION_COOKIE` environment variable:

```bash
CLAY_SESSION_COOKIE='s%3A...' node dist/index.js
```

To get your session cookie:
1. Open Clay in Chrome
2. Open DevTools (Cmd + Option + I)
3. Go to Application > Cookies > app.clay.com
4. Copy the "claysession" cookie value

### Enrichment Auth Priority

For enrichments, auth is resolved in this order:
1. Explicit `authAccountId` parameter
2. Environment variable: `CLAY_{PROVIDER}_ACCOUNT_ID`
3. Clay-managed account (uses Clay credits)
4. No auth (for providers that don't need it)

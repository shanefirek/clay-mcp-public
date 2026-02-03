# Clay MCP Agent Guide

This guide helps AI agents effectively use the Clay MCP tools. Follow these patterns to avoid errors and build tables efficiently.

## Quick Reference: ID Formats

All Clay IDs follow strict patterns. Invalid formats will be rejected:

| Type | Format | Example |
|------|--------|---------|
| Table ID | `t_` + alphanumeric | `t_0t8zm0wGn9TpMAHCP87` |
| Field ID | `f_` + alphanumeric | `f_abc123XYZ` |
| View ID | `gv_` + alphanumeric | `gv_defaultView1` |
| Record ID | `r_` + alphanumeric | `r_record123` |
| Workbook ID | `wb_` + alphanumeric | `wb_myWorkbook1` |
| Workspace ID | numeric string | `"12345"` |
| Auth Account ID | `aa_` + alphanumeric | `aa_hunter123` |
| Source ID | `s_` + alphanumeric | `s_0t98rhr37uW5` |

## Core Workflow Pattern

**Always follow this sequence when working with Clay tables:**

```
1. DISCOVER → Get table schema first
2. UNDERSTAND → Identify field IDs and types
3. ACT → Create fields, records, or run enrichments
4. VERIFY → Check results
```

### Step 1: Get Table Schema First

**ALWAYS call `clay_get_table` before any operation on a table.** This returns:
- All field IDs (you need these for everything)
- Field names and types
- View IDs
- Current record count

```
clay_get_table(tableId: "t_xxx")
→ Returns: { table: { fields: [...], gridViews: [...] } }
```

### Step 2: Map Fields by Name to ID

The response gives you field names and IDs. Build a mental map:
```
"Company" → f_abc123
"Domain" → f_def456
"Email" → f_ghi789
```

### Step 3: Use Field IDs in Operations

When creating enrichments or formulas, reference fields by ID:
```
clay_create_enrichment(
  tableId: "t_xxx",
  enrichmentName: "findymail-find-work-email",
  inputMapping: {
    "full_name": "f_nameFieldId",
    "company_domain": "f_domainFieldId"
  }
)
```

---

## Tool Categories

### Discovery Tools (Start Here)

| Tool | When to Use |
|------|-------------|
| `clay_list_tables` | Find tables in a workspace |
| `clay_get_table` | **Use before ANY table operation** - gets schema |
| `clay_list_integrations` | Find connected OAuth accounts (HubSpot, etc.) |
| `clay_list_enrichments` | See all 1100+ available enrichment providers |

### Record Operations

| Tool | Purpose |
|------|---------|
| `clay_create_record` | Add one row |
| `clay_batch_create_records` | Add multiple rows (more efficient) |
| `clay_update_record` | Modify field values |
| `clay_delete_records` | Remove rows |
| `clay_search_records` | Find records by search term |
| `clay_get_record` | Fetch single record by ID |

### Field Creation

| Tool | Use Case |
|------|----------|
| `clay_create_field` | Basic columns (text, number, email, url, date, boolean) |
| `clay_create_formula_field` | Computed columns using formulas |
| `clay_create_ai_field` | LLM text generation (no web browsing) |
| `clay_create_claygent_field` | AI web research with citations |
| `clay_create_http_api_field` | Call external REST APIs |

### Enrichment Tools

| Tool | Use Case |
|------|----------|
| `clay_create_enrichment` | Add any enrichment from registry |
| `clay_create_email_waterfall` | Multi-provider email finder |
| `clay_create_phone_waterfall` | Multi-provider phone finder |
| `clay_validate_emails` | Email deliverability check |
| `clay_enrich_company` | One-click company data |
| `clay_enrich_person` | One-click person data |
| `clay_run_enrichment` | Trigger enrichment on records |
| `clay_wait_for_enrichment` | Poll until complete |

### High-Level Workflows

| Tool | What It Does |
|------|--------------|
| `clay_source_companies` | Search and create table of companies |
| `clay_source_people` | Search and create table of people |
| `clay_full_lead_workflow` | Complete pipeline: enrich + email + validate |
| `clay_score_leads` | AI-powered ICP scoring |
| `clay_write_personalized_email` | Generate outreach copy |

### CRM Integration

| Tool | Destination |
|------|-------------|
| `clay_push_to_hubspot` | Create HubSpot contacts/companies |
| `clay_push_to_salesforce` | Create Salesforce records |
| `clay_push_to_sheets` | Add rows to Google Sheets |
| `clay_add_to_sequence` | Add to Outreach/Salesloft/Instantly |

---

## Common Patterns

### Pattern: Add Enrichment to Existing Table

```
1. clay_get_table(tableId) → Get field IDs
2. Find the field containing your input data (e.g., domain field)
3. clay_create_enrichment(
     tableId,
     enrichmentName: "apollo-enrich-company",
     fieldName: "Company Info",
     inputMapping: { "domain": "f_domainFieldId" }
   )
4. clay_run_enrichment(tableId, [newFieldId], [recordIds])
5. clay_wait_for_enrichment(tableId, [fieldId], [recordIds])
```

### Pattern: Create Email Finder Waterfall

```
1. clay_get_table(tableId) → Find name and domain fields
2. clay_create_email_waterfall(
     tableId,
     fieldName: "Work Email",
     inputMapping: {
       firstName: "f_firstNameId",
       lastName: "f_lastNameId",
       domain: "f_domainId"
     }
   )
```

### Pattern: Build Table from Scratch

```
1. clay_create_table(name, workbookId, workspaceId, type: "company")
2. Use returned tableId for all following operations
3. clay_create_field(tableId, "Domain", "text")
4. clay_batch_create_records(tableId, [{ "f_domainField": "acme.com" }, ...])
5. Add enrichment fields as needed
```

### Pattern: Research with Claygent

```
1. clay_get_table(tableId) → Get input field IDs
2. clay_create_claygent_field(
     tableId,
     name: "Company Research",
     prompt: "Research {Domain} and describe what the company does",
     outputFields: {
       "description": { type: "string", description: "One sentence description" },
       "industry": { type: "string", description: "Primary industry" }
     }
   )
```

---

## Input Mapping Syntax

When mapping enrichment inputs to your table fields:

### Using Field IDs (Recommended)
```json
{
  "domain": "f_abc123",
  "email": "f_def456"
}
```
The tool automatically wraps these as `{{f_abc123}}`.

### Using Formulas
```json
{
  "full_name": "{{f_firstName}} + \" \" + {{f_lastName}}",
  "query": "\"site:\" + {{f_domain}}"
}
```

### Literal Values
```json
{
  "limit": "25",
  "country": "\"United States\""
}
```

---

## Anti-Patterns (Avoid These)

### DON'T: Guess field IDs
```
WRONG: inputMapping: { "domain": "f_domain" }  // Guessed ID
RIGHT: First call clay_get_table, then use actual field ID
```

### DON'T: Use field names instead of IDs
```
WRONG: inputMapping: { "domain": "Domain" }  // Field name
RIGHT: inputMapping: { "domain": "f_actualFieldId" }
```

### DON'T: Skip the schema lookup
```
WRONG: Immediately call clay_create_enrichment without knowing fields
RIGHT: Always call clay_get_table first
```

### DON'T: Forget to run enrichments
Creating an enrichment field doesn't run it. You must call:
```
clay_run_enrichment(tableId, [fieldIds], [recordIds])
```

### DON'T: Poll immediately
After running enrichment, wait a moment before checking results:
```
clay_run_enrichment(...)
clay_wait_for_enrichment(tableId, [fieldIds], [recordIds], timeoutMs: 60000)
```

---

## Understanding the Registry

The enrichment registry contains 1100+ providers in 20+ categories:

| Category | Examples |
|----------|----------|
| `email-finders` | findymail, hunter, leadmagic, prospeo |
| `company-enrichment` | apollo, clearbit, crunchbase |
| `person-enrichment` | apollo, cognism, lusha |
| `phone-finders` | nymblr, datagma |
| `technographics` | builtwith, wappalyzer |
| `linkedin` | proxycurl, phantombuster |
| `crm` | hubspot, salesforce |
| `sales-engagement` | instantly, smartlead, outreach |
| `ai` | claygent, use-ai |

### Finding Providers

```
# List all providers
clay_list_enrichments()

# Filter by category
clay_list_enrichments(category: "email-finders")

# Get schema for specific provider
clay_get_action_schema(actionKey: "findymail-find-work-email")
```

---

## Error Handling

### Invalid ID Format
```
Error: Table ID must be in t_xxx format
Fix: Check the ID format - should be t_ followed by alphanumeric
```

### Field Not Found
```
Error: Field f_xxx not found
Fix: Call clay_get_table to get current field IDs
```

### Enrichment Input Missing
```
Error: Required input 'domain' not provided
Fix: Check clay_get_action_schema for required inputs
```

### Auth Required
```
Error: No auth account for provider
Fix: Either use Clay-managed account (default) or provide authAccountId
```

---

## Best Practices

1. **Always get schema first** - `clay_get_table` before any operation
2. **Use descriptive field names** - "Company Info" not "Field1"
3. **Batch operations** - Use `clay_batch_create_records` for multiple rows
4. **Wait for enrichments** - Use `clay_wait_for_enrichment` to poll
5. **Check the registry** - `clay_list_enrichments` to find providers
6. **Use waterfalls for emails** - Multiple providers increase success rate
7. **Validate IDs** - All IDs follow strict format patterns

---

## Quick Start Examples

### "Find emails for my leads"
```
1. clay_get_table(tableId)
2. Identify first name, last name, and domain fields
3. clay_create_email_waterfall(tableId, "Work Email", { firstName: "f_x", lastName: "f_y", domain: "f_z" })
4. clay_run_enrichment(tableId, [emailFieldId], recordIds)
5. clay_wait_for_enrichment(...)
```

### "Enrich companies with funding data"
```
1. clay_get_table(tableId)
2. Identify domain field
3. clay_enrich_company(tableId, domainFieldId, ["funding"])
```

### "Research companies with AI"
```
1. clay_get_table(tableId)
2. Identify company/domain fields
3. clay_create_claygent_field(tableId, "Research", "Research {Domain} and explain what they do")
4. clay_run_enrichment(...)
```

# Clay MCP Server

## For Agents: Read This First

**Before writing any code that uses ClayClient, you MUST read:**
- `docs/CLIENT_API.md` - Complete API reference with method signatures and response structures

**Critical gotchas:**
1. `getTable()` returns nested data: fields are at `.table.fields`, NOT `.fields`
2. `getTableFields()` exists as a lighter alternative to `getTable()` for just fields
3. `createHttpApiField()` takes a config OBJECT, not positional params

---

## Business Context

### Ideal Customer Profile (ICP)

**Company Fit:**
- Industry: B2B SaaS, DevTools, MarTech
- Size: 50-500 employees (growth stage)
- Funding: Series A-C preferred
- Geography: US, UK, Canada, Western Europe

**Contact Fit:**
- Titles: VP/Director/Head of Sales, Marketing, RevOps, Growth
- Seniority: Manager+ (no individual contributors)

**Disqualify:**
- Company < 20 employees
- No website or domain unreachable
- Consulting/agency
- Government/education

### Workflow Playbooks

**Outbound Prospecting:**
1. Source companies → 2. Enrich company → 3. Find decision makers → 4. Get work emails (waterfall) → 5. Validate emails → 6. Score leads → 7. Push to sequence

**Inbound Lead Enrichment:**
1. Email from form → 2. Enrich person → 3. Enrich company → 4. Score against ICP → 5. Route to Sales or Nurture

### Connected Integrations
- CRM: HubSpot, Salesforce
- Sequences: Instantly, HubSpot sequences
- Slack: #new-leads channel

---

## Project Overview

Clay MCP server providing 73 tools for full Clay table automation via reverse-engineered v3 API.

**GitHub:** https://github.com/shanefirek/clay-mcp

### Quick Reference: Available Tools

| Category | Tools |
|----------|-------|
| Sourcing | `clay_wizard_find_companies`, `clay_wizard_find_people` |
| Tables | `clay_list_tables`, `clay_get_table`, `clay_create_table`, `clay_duplicate_table`, `clay_export_table`, `clay_share_table` |
| Records | `clay_create_record`, `clay_get_record`, `clay_batch_create_records`, `clay_update_record`, `clay_delete_records`, `clay_search_records` |
| Fields | `clay_create_field`, `clay_create_text_field`, `clay_create_formula_field`, `clay_create_ai_field`, `clay_create_claygent_field`, `clay_create_http_api_field` |
| Enrichments | `clay_create_enrichment`, `clay_create_email_waterfall`, `clay_create_phone_waterfall`, `clay_validate_emails`, `clay_enrich_company`, `clay_enrich_person` |
| Workflows | `clay_research_company`, `clay_find_similar_companies`, `clay_score_leads`, `clay_write_personalized_email` |
| CRM | `clay_push_to_hubspot`, `clay_push_to_salesforce`, `clay_push_to_sheets`, `clay_add_to_sequence` |
| Auto-mapping | `clay_analyze_table`, `clay_suggest_enrichments`, `clay_auto_enrich` |

**Note:** The wizard tools (`clay_wizard_find_companies`, `clay_wizard_find_people`) use Clay's Mixrank data source and are the same flow as the Clay UI.

---

## Current Status (Jan 2026)

### What Works
- **Wizard sourcing**: Both `wizardFindCompanies` and `wizardFindPeople` work via Clay's v3 wizard endpoint
- **Linked tables**: `wizardFindPeople` supports chaining from an existing company table (pass `linkedTable` config with tableId, viewId, fieldId, recordIds, companyIdentifiers)
- **All table/record/field CRUD**: Standard REST operations work reliably
- **Enrichment fields + waterfalls**: Well-tested patterns
- **AI fields**: Claygent, Use AI work
- **Webhook sources**: Create tables with inbound webhook URLs

### What Was Removed
Pruned 10 broken tools that used old API approaches (`sourceSettings`, `POST /sources`) which return "Invalid subscriptions" errors:
- `clay_source_companies`, `clay_source_people`, `clay_source_people_at_companies`
- `clay_find_companies`, `clay_find_people_linked`, `clay_find_people_at_company`
- `clay_create_find_people_field`, `clay_create_find_companies_field`
- `clay_add_find_companies_source`, `clay_add_find_people_source`

### API Notes
- Clay's internal API is reverse-engineered and may change
- Wizard endpoints (`/workspaces/{id}/wizard/evaluate-step`) are the only reliable way to create tables with data sources
- Session cookies expire - refresh from Chrome DevTools when you get 401s

---

### Key Files

| File | Purpose |
|------|---------|
| `src/client.ts` | ClayClient class - all API methods |
| `src/enrichments/registry.json` | 85+ enrichment provider configs |
| `docs/CLIENT_API.md` | **Complete API reference** |

---

## Commands

```bash
npm run build          # Build TypeScript
npm run dev            # Watch mode
npm test               # Run tests

# Test with session cookie
CLAY_SESSION_COOKIE='s%3A...' npm test -- tests/mcp-tools.integration.test.ts
```

---

## Documentation Index

| Document | Content |
|----------|---------|
| `docs/CLIENT_API.md` | **Primary reference** - All ClayClient methods with signatures and response shapes |
| `docs/CLAYGENT_API.md` | Claygent field configuration details |
| `docs/METAPROMPTER_API.md` | Prompt generation API |
| `docs/enrichment-auth-guide.md` | Auth account configuration |
| `src/enrichments/registry.json` | All enrichment provider actionKeys and packageIds |

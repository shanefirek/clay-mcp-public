# Clay MCP Server

## For Agents: Read This First

**Key docs:**
- `docs/AGENT_GUIDE.md` - Best practices for using the MCP tools
- `docs/TOOLS_SUMMARY.md` - Complete list of all 73 tools

---

## Project Overview

Clay MCP server providing 74 tools for full Clay table automation.

**GitHub:** https://github.com/shanefirek/clay-mcp-public

### Quick Reference: Available Tools

| Category | Tools |
|----------|-------|
| Sourcing | `clay_wizard_find_companies`, `clay_wizard_find_people` |
| Tables | `clay_list_tables`, `clay_list_workbook_tables`, `clay_get_table`, `clay_create_table`, `clay_duplicate_table`, `clay_export_table`, `clay_share_table` |
| Records | `clay_list_records`, `clay_create_record`, `clay_get_record`, `clay_batch_create_records`, `clay_update_record`, `clay_delete_records`, `clay_search_records` |
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

### Notes
- Session cookies expire - refresh from Chrome DevTools when you get 401s

---

## Commands

```bash
npm run build          # Build TypeScript
npm run dev            # Watch mode
npm test               # Run tests
```

---

## Documentation

| Document | Content |
|----------|---------|
| `docs/AGENT_GUIDE.md` | Best practices for AI agents using this MCP |
| `docs/TOOLS_SUMMARY.md` | Complete list of all 73 tools |

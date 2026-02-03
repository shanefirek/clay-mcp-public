# Clay MCP Tools Reference

This MCP server provides **73 tools** for full control of Clay tables.

> **For AI Agents:** See [AGENT_GUIDE.md](./AGENT_GUIDE.md) for usage patterns and best practices.

## Tool Categories

### Table & Workspace (13 tools)

| Tool | Description |
|------|-------------|
| `clay_list_tables` | List all tables in a workspace |
| `clay_get_table` | Get table schema with all fields and views |
| `clay_create_table` | Create a new table |
| `clay_create_workbook` | Create a new workbook |
| `clay_duplicate_table` | Copy a table with all data |
| `clay_export_table` | Export to CSV |
| `clay_share_table` | Create shareable link |
| `clay_duplicate_view` | Copy a view with filters |
| `clay_filter_view` | Set view filters |
| `clay_delete_view` | Delete a view |
| `clay_create_view` | Create a filtered view |
| `clay_list_claygents` | List saved Claygent configs |
| `clay_list_integrations` | List connected OAuth accounts |

### Record Operations (7 tools)

| Tool | Description |
|------|-------------|
| `clay_create_record` | Create a single record |
| `clay_get_record` | Get a record by ID |
| `clay_batch_create_records` | Create multiple records |
| `clay_update_record` | Update record fields |
| `clay_delete_records` | Delete records by ID |
| `clay_search_records` | Search records in a view |
| `clay_bulk_fetch_records` | Fetch multiple records by ID |

### Field Creation (9 tools)

| Tool | Description |
|------|-------------|
| `clay_create_field` | Create basic field (text, number, email, url, date, boolean, select, currency, image) |
| `clay_delete_field` | Delete a field |
| `clay_create_text_field` | Create editable text column |
| `clay_create_formula_field` | Create formula column (supports AI generation) |
| `clay_generate_formula` | Generate formula with AI |
| `clay_create_ai_field` | Create "Use AI" LLM column |
| `clay_create_claygent_field` | Create Claygent web research column |
| `clay_create_http_api_field` | Create HTTP API column |
| `clay_generate_prompt` | Generate optimized prompt with metaprompter |

### Enrichment Tools (11 tools)

| Tool | Description |
|------|-------------|
| `clay_list_enrichments` | List all 1100+ providers by category |
| `clay_search_enrichments` | Search enrichment catalog |
| `clay_create_enrichment` | Create enrichment field from registry |
| `clay_create_email_waterfall` | Multi-provider email finder |
| `clay_create_phone_waterfall` | Multi-provider phone finder |
| `clay_validate_emails` | Email validation |
| `clay_enrich_company` | One-click company enrichment |
| `clay_enrich_person` | One-click person enrichment |
| `clay_create_waterfall_field` | Custom waterfall field |
| `clay_run_enrichment` | Trigger enrichment run |
| `clay_wait_for_enrichment` | Wait for completion |

### Registry Tools (4 tools)

| Tool | Description |
|------|-------------|
| `clay_get_registry` | Get full provider registry |
| `clay_get_action_schema` | Get action input/output schema |
| `clay_add_enrichment_provider` | Add provider to registry |
| `clay_get_providers_by_category` | Get providers by category |

### Auto-Mapper Tools (4 tools)

| Tool | Description |
|------|-------------|
| `clay_analyze_table` | Infer semantic types from fields |
| `clay_suggest_enrichments` | Suggest enrichments for table |
| `clay_auto_enrich` | One-click intelligent enrichment |
| `clay_build_input_mapping` | Generate input mapping for any action |

### CRM Integration (4 tools)

| Tool | Description |
|------|-------------|
| `clay_push_to_hubspot` | Create/update HubSpot objects |
| `clay_push_to_sheets` | Add rows to Google Sheets |
| `clay_push_to_salesforce` | Create/update Salesforce records |
| `clay_add_to_sequence` | Add to sales sequences (Outreach, Instantly, etc.) |

### Workflow Tools (14 tools)

| Tool | Description |
|------|-------------|
| `clay_write_personalized_email` | AI email generation |
| `clay_research_company` | Deep company research |
| `clay_find_similar_companies` | Lookalike company finder |
| `clay_full_lead_workflow` | Complete lead enrichment pipeline |
| `clay_find_job_changes` | Job change detection |
| `clay_send_slack_notification` | Send Slack alerts |
| `clay_lookup_company` | Quick company lookup |
| `clay_lookup_person` | Quick person lookup |
| `clay_score_leads` | AI ICP scoring |
| `clay_get_tech_stack` | Technology stack lookup |
| `clay_find_funding` | Funding data lookup |
| `clay_find_news` | Company news lookup |
| `clay_find_linkedin_posts` | LinkedIn activity lookup |
| `clay_get_waterfall_presets` | Get pre-built waterfall templates |

### Template Tools (3 tools)

| Tool | Description |
|------|-------------|
| `clay_list_prompt_templates` | List Claygent templates |
| `clay_get_prompt_template` | Get template details |
| `clay_create_claygent_from_template` | Create Claygent from template |

### Source & Sourcing Tools (8 tools)

| Tool | Description |
|------|-------------|
| `clay_wizard_find_companies` | Create company table with Mixrank sourcing (same as Clay UI wizard) |
| `clay_wizard_find_people` | Create people table with Mixrank sourcing (same as Clay UI wizard) |
| `clay_create_webhook_table` | Create table with webhook source (returns webhook URL) |
| `clay_list_sources` | List data sources for a table |
| `clay_get_source` | Get source details including webhook URL |
| `clay_set_webhook_response_type` | Set webhook response format (JSON/PLAIN_TEXT) |
| `clay_create_webhook_auth_token` | Create auth token for webhook security |
| `clay_delete_source` | Delete a data source |

### Audit Tools (4 tools)

| Tool | Description |
|------|-------------|
| `clay_snapshot_table` | Create snapshot of table config (fields, views, settings) |
| `clay_compare_snapshots` | Compare two snapshots to see what changed |
| `clay_check_table_drift` | Compare current table against a baseline snapshot |
| `clay_snapshot_workspace` | Snapshot all tables in a workspace |

---

## ID Formats

All IDs are validated against these patterns:

| Type | Format | Example |
|------|--------|---------|
| Table | `t_[a-zA-Z0-9]+` | `t_abc123` |
| Field | `f_[a-zA-Z0-9]+` | `f_def456` |
| View | `gv_[a-zA-Z0-9]+` | `gv_xyz789` |
| Record | `r_[a-zA-Z0-9]+` | `r_rec001` |
| Workbook | `wb_[a-zA-Z0-9]+` | `wb_book1` |
| Workspace | `[0-9]+` | `"12345"` |
| Auth Account | `aa_[a-zA-Z0-9]+` | `aa_auth1` |
| Source | `s_[a-zA-Z0-9]+` | `s_src001` |

---

## Enrichment Registry

The registry contains **1100+ providers** across **21 categories**:

- `email-finders` - Findymail, Hunter, LeadMagic, Prospeo, etc.
- `person-enrichment` - Apollo, Clearbit, Cognism, Lusha
- `company-enrichment` - Apollo, Crunchbase, Harmonic
- `phone-finders` - Nymblr, Datagma, Firmable
- `technographics` - BuiltWith, Wappalyzer
- `linkedin` - Proxycurl, PhantomBuster
- `crm` - HubSpot, Salesforce, Pipedrive
- `sales-engagement` - Instantly, Smartlead, Outreach
- `ai` - Claygent, Use AI
- `traffic-seo` - SimilarWeb, Ahrefs
- `core` - Domain lookup, HTTP API, Web scraping
- And more...

---

## Usage Flow

```
1. clay_get_table(tableId)     → Get schema, field IDs
2. Identify input fields        → Map field names to IDs
3. clay_create_enrichment(...)  → Add enrichment column
4. clay_run_enrichment(...)     → Trigger on records
5. clay_wait_for_enrichment(...) → Wait for results
```

See [AGENT_GUIDE.md](./AGENT_GUIDE.md) for detailed patterns and examples.

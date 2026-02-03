# Clay MCP Server

Give Claude full control over your Clay tables via the Model Context Protocol.

> **Note:** This is an unofficial integration using Clay's internal API (reverse-engineered). Not affiliated with Clay.

## What It Does

- **73 tools** for full table control
- **1100+ enrichment providers** across 21 categories
- **AI columns**: Claygent, GPT, HTTP API fields
- **Waterfalls**: Multi-provider email/phone finders
- **CRM integration**: HubSpot, Salesforce, Google Sheets
- **Clay credits by default**: Uses Clay-managed API accounts when available

## Documentation

- **[Agent Guide](docs/AGENT_GUIDE.md)** - Best practices for AI agents using this MCP
- **[Tools Reference](docs/TOOLS_SUMMARY.md)** - Complete list of 73 tools
- **[API Reference](docs/CLAY_API_REFERENCE.md)** - Reverse-engineered Clay API

## Quick Start

### 1. Install & Build

```bash
git clone https://github.com/shanefirek/clay-mcp.git
cd clay-mcp
npm install
npm run build
```

### 2. Get Your Session Cookie

Clay's internal API uses session cookies (not API keys):

1. Open [app.clay.com](https://app.clay.com) in Chrome
2. Open DevTools (`Cmd + Option + I` on Mac, `F12` on Windows)
3. Go to **Application** → **Cookies** → `app.clay.com`
4. Copy the `claysession` cookie value (starts with `s%3A...`)

### 3. Configure Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "clay": {
      "command": "node",
      "args": ["/absolute/path/to/clay-mcp/dist/index.js"],
      "env": {
        "CLAY_SESSION_COOKIE": "s%3Ayour-session-cookie-here"
      }
    }
  }
}
```

**Optional:** Add your own API account overrides:

```json
{
  "mcpServers": {
    "clay": {
      "command": "node",
      "args": ["/absolute/path/to/clay-mcp/dist/index.js"],
      "env": {
        "CLAY_SESSION_COOKIE": "s%3Ayour-session-cookie-here",
        "CLAY_HUNTER_ACCOUNT_ID": "aa_your_hunter_account",
        "CLAY_APOLLO_OAUTH_ACCOUNT_ID": "aa_your_apollo_account"
      }
    }
  }
}
```

### 4. Restart Claude Desktop

The Clay tools will now be available in Claude.

---

## Key Tools

> See [docs/TOOLS_SUMMARY.md](docs/TOOLS_SUMMARY.md) for the complete list of 73 tools.

### Essential Tools

| Tool | Description |
|------|-------------|
| `clay_get_table` | **Start here** - Get table schema with field IDs |
| `clay_create_enrichment` | Add any enrichment from 1100+ providers |
| `clay_create_email_waterfall` | Multi-provider email finder |
| `clay_run_enrichment` | Trigger enrichment on records |
| `clay_wait_for_enrichment` | Wait for completion |

### High-Level Workflows

| Tool | Description |
|------|-------------|
| `clay_wizard_find_companies` | Create company table via Clay wizard |
| `clay_wizard_find_people` | Create people table via Clay wizard |
| `clay_full_lead_workflow` | Complete: enrich + email + validate |
| `clay_enrich_company` | One-click company enrichment |
| `clay_push_to_hubspot` | Push to HubSpot CRM |

### AI Fields

| Tool | Description |
|------|-------------|
| `clay_create_claygent_field` | AI web research with citations |
| `clay_create_ai_field` | LLM text generation |
| `clay_create_formula_field` | Formula with optional AI generation |

### Webhook Sources

| Tool | Description |
|------|-------------|
| `clay_create_webhook_table` | Create table with inbound webhook URL |
| `clay_get_source` | Get webhook URL and config |
| `clay_set_webhook_response_type` | Set JSON or plain text response |

### Audit & Drift Detection

| Tool | Description |
|------|-------------|
| `clay_snapshot_table` | Capture table config for version control |
| `clay_check_table_drift` | Compare current state vs baseline |
| `clay_snapshot_workspace` | Snapshot all tables at once |

---

## Enrichment Registry

The server includes **1100+ enrichment providers** across **21 categories**:

| Category | Example Providers |
|----------|-----------|
| **Email Finders** | Findymail, Hunter, LeadMagic, Prospeo, Dropcontact |
| **Person Enrichment** | Apollo, Clearbit, Cognism, Lusha, People Data Labs |
| **Company Enrichment** | Apollo, Crunchbase, Harmonic, Ocean.io |
| **Phone Finders** | Nymblr, Datagma, Firmable |
| **LinkedIn** | Proxycurl, PhantomBuster |
| **Sales Engagement** | Instantly, Smartlead, Outreach, Salesloft |
| **CRM** | HubSpot, Salesforce, Pipedrive |
| **Technographics** | BuiltWith, Wappalyzer |
| **AI** | Claygent, Use AI (GPT-4) |
| **Core** | Domain lookup, HTTP API, Web scraping |

See `clay_list_enrichments()` for the full list.

### Authentication Priority

The server resolves which API account to use in this order:

1. **Environment variable override** - `CLAY_HUNTER_ACCOUNT_ID=aa_xxx`
2. **Explicit parameter** - `authAccountId: "aa_xxx"` in tool call
3. **Clay-managed account** - Uses Clay credits (default)

### Clay-Managed Accounts (Default)

19 providers have **Clay-managed accounts** - these use Clay credits instead of requiring your own API keys:

- Findymail, Hunter, LeadMagic, Prospeo, Dropcontact
- Datagma, Icypeas, Smarte
- Apollo (all actions)
- BuiltWith
- Use AI (OpenAI)

### Using Your Own API Keys

To use your own connected accounts instead of Clay credits, set environment variables:

```bash
# In .env or Claude Desktop config
CLAY_HUNTER_ACCOUNT_ID=aa_your_account_id
CLAY_FINDYMAIL_ACCOUNT_ID=aa_your_account_id
CLAY_APOLLO_OAUTH_ACCOUNT_ID=aa_your_account_id
CLAY_BUILT_WITH_ACCOUNT_ID=aa_your_account_id
```

Find your account IDs:
```bash
npx ts-node scripts/discover-clay-accounts.ts
```

Or use the `useOwnAccount` parameter:
```
clay_create_enrichment(..., useOwnAccount: true)
```

---

## Example Prompts

Ask Claude things like:

**Records:**
- "Show me the schema for table t_abc123"
- "Create a record with First Name: John, Last Name: Doe, Company: acme.com"
- "Update record r_xyz to set Email to john@acme.com"

**Enrichments:**
- "Find emails for all records in my table using Findymail"
- "Create an email waterfall with Findymail → Hunter → LeadMagic"
- "Run Apollo person enrichment on records r_123 and r_456"

**AI Columns:**
- "Create a Claygent column that researches {Company} and writes a one-sentence description"
- "Add an AI column that finds the CEO's LinkedIn URL for {Company}"

**Webhooks:**
- "Create a new table with a webhook source so I can POST data from Zapier"
- "Get the webhook URL for my inbound leads table"

**Audit & Compliance:**
- "Snapshot this table's config so I can track changes"
- "Check if the table has drifted from the baseline"
- "Snapshot all tables in my workspace"

---

## Configuring for Your Organization

The MCP provides tools, but Claude needs **business context** to make good decisions. Add a `CLAUDE.md` file to your project (or system prompt) with your org's specific configuration:

### ICP Definition

Tell Claude who you're targeting:

```markdown
## Ideal Customer Profile

**Company Fit:**
- Industry: B2B SaaS, DevTools, MarTech
- Size: 50-500 employees
- Funding: Series A-C
- Geography: US, UK, Western Europe

**Contact Fit:**
- Titles: VP/Director of Sales, Marketing, RevOps
- Seniority: Manager+ (no ICs for outbound)

**Disqualify:**
- < 20 employees
- Agencies/consultancies
- Government/education
```

### Preferred Enrichments

Specify which providers to use and in what order:

```markdown
## Enrichment Preferences

**Email Finding (in order):**
1. Findymail (best accuracy)
2. Hunter (fallback)
3. LeadMagic (last resort)

**Company Data:** Apollo (use Clay credits)
**Person Data:** Apollo → Clearbit
**Validation:** Always run Findymail validation before sequences

**Never use:** [list any providers to avoid]
```

### Workflow Standards

Define your quality gates and processes:

```markdown
## Workflow Rules

1. **Always validate emails** before pushing to sequences
2. **Score all leads** before CRM push:
   - Score > 70 → Route to Sales
   - Score < 70 → Nurture sequence
3. **Research before outreach** - run Claygent for personalization
4. **Naming convention:**
   - Tables: `{YYYY-MM} - {Source} - {Purpose}`
   - Views: `Ready to Sequence`, `Needs Review`, `Disqualified`
```

### Signal Weights

For lead scoring:

```markdown
## Scoring Signals

| Signal | Weight | Reason |
|--------|--------|--------|
| Recent funding | +30 | Budget available |
| Hiring sales/marketing | +25 | Growth mode |
| Uses competitor tech | +20 | In-market |
| Title matches ICP | +20 | Right person |
| No LinkedIn profile | -20 | Hard to reach |
| Catch-all email | -15 | Deliverability risk |
```

### Connected Integrations

List your destinations:

```markdown
## Integrations

- **CRM:** HubSpot (primary)
- **Sequences:** Instantly (outbound), HubSpot (inbound)
- **Notifications:** Slack #new-leads
```

This context helps Claude choose the right tools, providers, and workflows for your specific business.

---

## Webhook Sources

Create tables that accept inbound data via HTTP POST:

```
1. clay_create_webhook_table("Inbound Leads", workbookId, workspaceId)
   → Returns webhook URL: https://api.clay.com/v3/sources/webhook/inbound-leads-xxx

2. POST data to the webhook URL from any external system (Zapier, n8n, custom app)

3. Data flows into Clay table automatically
```

Options:
- `responseType: "JSON"` - Returns structured response
- `responseType: "PLAIN_TEXT"` - Returns simple "OK"
- Auth tokens available for secure webhooks

---

## Drift Detection

Track config changes and enforce SOPs with audit tools:

```
1. Create baseline:
   clay_snapshot_table(tableId) → Save JSON to git

2. Check for drift:
   clay_check_table_drift(tableId, baseline)
   → "🚨 DRIFT: 2 fields added, 1 view renamed"

3. Investigate:
   clay_compare_snapshots(before, after)
   → Shows exactly what changed
```

Use cases:
- Detect unauthorized field additions
- Enforce naming conventions
- Audit trail for compliance
- Version control table configs in git

---

## MCP Resources

Browse Clay data directly via resource URIs:

| URI | Description |
|-----|-------------|
| `clay://workspaces` | List all workspaces |
| `clay://tables/{tableId}` | Table schema |
| `clay://tables/{tableId}/fields` | Field definitions |
| `clay://enrichments` | Provider registry |

---

## Development

```bash
# Install
npm install

# Build
npm run build

# Watch mode (rebuild on changes)
npm run dev

# Type check
npm run typecheck
```

### Project Structure

```
clay-mcp/
├── src/
│   ├── index.ts              # Entry point
│   ├── server.ts             # MCP server setup
│   ├── client.ts             # Clay API client
│   ├── auth.ts               # Session cookie handling
│   ├── rate-limiter.ts       # API rate limiting
│   ├── validation.ts         # Zod schemas for ID validation
│   ├── tools/
│   │   ├── tables.ts         # Table/view management (13 tools)
│   │   ├── records.ts        # Record CRUD (7 tools)
│   │   ├── fields.ts         # Formula/AI fields (9 tools)
│   │   ├── enrichments.ts    # Enrichment tools (11 tools)
│   │   ├── workflows.ts      # High-level workflows (14 tools)
│   │   ├── crm.ts            # CRM integration (4 tools)
│   │   ├── sourcing.ts       # (deprecated - see sources.ts)
│   │   ├── sources.ts        # Webhook + wizard sourcing (8 tools)
│   │   ├── audit.ts          # Drift detection (4 tools)
│   │   ├── automapper.ts     # Auto-mapping (4 tools)
│   │   ├── registry.ts       # Provider registry (4 tools)
│   │   └── templates.ts      # Claygent templates (3 tools)
│   ├── enrichments/
│   │   ├── index.ts          # Registry loader & auth resolution
│   │   └── registry.json     # 1100+ provider actions
│   ├── resources/            # MCP resources
│   └── types/                # TypeScript types
├── docs/
│   ├── AGENT_GUIDE.md        # Best practices for AI agents
│   ├── TOOLS_SUMMARY.md      # All 73 tools documented
│   └── CLAY_API_REFERENCE.md # Reverse-engineered API
└── dist/                     # Compiled output
```

---

## Troubleshooting

### Session Cookie Expired

When you see 401 errors, your session cookie has expired:

1. Get a fresh cookie from Chrome DevTools
2. Update `CLAY_SESSION_COOKIE` in your Claude config
3. Restart Claude Desktop

### Enrichment Not Running

- Make sure input fields have valid data (domains should be like `acme.com`, not `Acme Inc`)
- Check for `settingsError` on the field - indicates misconfiguration
- Try `forceRun: true` to re-run even if data exists

### Rate Limiting

The MCP includes built-in rate limiting to avoid overwhelming Clay's API:
- Sliding window algorithm with automatic backoff
- Handles 429 responses gracefully
- No configuration needed - works automatically

---

## Contributing

PRs welcome! Especially for:

- More `actionPackageId`s for enrichment providers
- Additional Clay-managed account IDs
- Better auth handling (OAuth, browser extension)
- New API endpoints
- Tests

---

## Disclaimer

This is an **unofficial** integration using Clay's **internal API**.

- The API may change without notice
- Requires session cookies (not official API keys)
- Use at your own risk
- Not affiliated with or endorsed by Clay

---

## License

MIT

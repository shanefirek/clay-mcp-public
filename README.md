<div align="center">

# Clay MCP Server

**73 tools. 1,100+ enrichment providers. Full control over Clay from Claude Code.**

Clay has no public API. This MCP server maps Clay's entire internal surface — tables, records, enrichments, AI columns, waterfalls, CRM sync, webhooks, and drift detection — so you can run your GTM workflows from the terminal.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org)

Built by [Shane Firek](https://shanefirek.com) · [LinkedIn](https://linkedin.com/in/shanefirek) · [GitHub](https://github.com/shanefirek)

</div>

---

<table>
<tr>
<td width="25%" align="center"><strong>73 Tools</strong><br/>Tables, records, fields, enrichments, workflows, CRM, webhooks, audit</td>
<td width="25%" align="center"><strong>1,100+ Providers</strong><br/>Full enrichment registry across 21 categories — email, phone, company, person, technographics</td>
<td width="25%" align="center"><strong>No Public API Needed</strong><br/>Maps Clay's internal endpoints via session cookie. Same access as your browser.</td>
<td width="25%" align="center"><strong>Claude Code Native</strong><br/>MCP server — works in Claude Code, Claude Desktop, Cursor, or any MCP client</td>
</tr>
</table>

---

## Quick Start

```bash
git clone https://github.com/shanefirek/clay-mcp-public.git
cd clay-mcp-public
npm install && npm run build
```

Get your session cookie from Chrome DevTools:

1. Open [app.clay.com](https://app.clay.com)
2. DevTools → Application → Cookies → `app.clay.com`
3. Copy the `claysession` value (starts with `s%3A...`)

Add to your MCP config:

```json
{
  "mcpServers": {
    "clay": {
      "command": "node",
      "args": ["/path/to/clay-mcp-public/dist/index.js"],
      "env": {
        "CLAY_SESSION_COOKIE": "s%3Ayour-session-cookie-here"
      }
    }
  }
}
```

Restart Claude. You're live.

---

## What You Can Do

### Tables & Records
```
"Show me the schema for table t_abc123"
"Create a record with First Name: John, Company: acme.com"
"Update record r_xyz to set Email to john@acme.com"
```

### Enrichments & Waterfalls
```
"Find emails for all records using Findymail"
"Create an email waterfall: Findymail → Hunter → LeadMagic"
"Run Apollo person enrichment on records r_123 and r_456"
```

### AI Columns
```
"Create a Claygent column that researches {Company} and writes a summary"
"Add an AI column that finds the CEO's LinkedIn URL"
```

### CRM & Webhooks
```
"Push these records to HubSpot"
"Create a table with a webhook source for inbound leads"
```

### Audit & Drift Detection
```
"Snapshot this table's config"
"Check if the table has drifted from the baseline"
```

---

## Tool Categories

| Category | Tools | What It Does |
|----------|-------|-------------|
| **Tables** | 13 | Create, list, get schema, manage views |
| **Records** | 7 | CRUD operations on table rows |
| **Fields** | 9 | Formula, AI, and Claygent columns |
| **Enrichments** | 11 | Run any of 1,100+ providers |
| **Workflows** | 14 | Full lead workflows, company enrichment, email waterfalls |
| **CRM** | 4 | HubSpot, Salesforce, Google Sheets push |
| **Sources** | 8 | Webhook tables, wizard (find companies/people) |
| **Audit** | 4 | Snapshot, drift detection, workspace audit |
| **Registry** | 4 | Search and browse enrichment providers |
| **Templates** | 3 | Claygent prompt templates |

See [docs/TOOLS_SUMMARY.md](docs/TOOLS_SUMMARY.md) for the full reference.

---

## Enrichment Registry

1,100+ providers across 21 categories. Use Clay-managed accounts (billed to Clay credits) or bring your own API keys.

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

19 providers have Clay-managed accounts — no API key needed, billed to your Clay credits.

### Using Your Own API Keys

```bash
CLAY_HUNTER_ACCOUNT_ID=aa_your_account_id
CLAY_FINDYMAIL_ACCOUNT_ID=aa_your_account_id
CLAY_APOLLO_OAUTH_ACCOUNT_ID=aa_your_account_id
```

Find account IDs: `npx ts-node scripts/discover-clay-accounts.ts`

---

## How Authentication Works

Clay has no public API or API key system. This server authenticates using a **session cookie** — the same token your browser uses when you log into app.clay.com.

The session cookie has full access to your Clay account: tables, records, enrichments, CRM integrations, credits. Treat it like a password.

| File | Contains secrets? | Gitignored? |
|------|-------------------|-------------|
| `.env` | Yes | Yes |
| `.mcp.json` | Yes | Yes |
| `.env.example` | No | No |

If you suspect a cookie was exposed, log out of Clay to invalidate the session.

---

## Configuring for Your Org

The MCP provides tools, but Claude needs **business context** to make good decisions. Add a `CLAUDE.md` to your project with:

- **ICP definition** — who you're targeting (industry, size, titles)
- **Enrichment preferences** — which providers in what order
- **Workflow rules** — quality gates, scoring thresholds, naming conventions
- **Signal weights** — what signals matter for lead scoring

See the [Agent Guide](docs/AGENT_GUIDE.md) for detailed examples.

---

## Documentation

| Doc | What It Covers |
|-----|---------------|
| [Agent Guide](docs/AGENT_GUIDE.md) | Best practices for AI agents using this MCP |
| [Tools Summary](docs/TOOLS_SUMMARY.md) | All 73 tools with parameters and descriptions |
| [API Reference](docs/CLAY_API_REFERENCE.md) | Mapped Clay API endpoints |

---

## Development

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm run dev          # Watch mode
npm run test         # Run tests
npm run lint         # Type check
```

---

## Contributing

PRs welcome. Especially for:

- Additional enrichment provider `actionPackageId`s
- Clay-managed account IDs
- New API endpoint mappings
- Tests
- Better auth handling (OAuth, browser extension)

---

## Disclaimer

Unofficial integration using Clay's internal API. The API may change without notice. Requires session cookies. Not affiliated with or endorsed by Clay. Use at your own risk.

---

## License

MIT

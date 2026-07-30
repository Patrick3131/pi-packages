---
owner: repo-maintainers
last_verified: 2025-03-25
applies_to: /**
inherits_from: none
canonical_for: System architecture and data flow
---

# CONTEXT.md

## System Overview

pi-crawl4ai is a Pi extension that provides web crawling capabilities using the crawl4ai Docker service. It supports optional proxy rotation for anonymous crawling.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Pi Agent                                 │
│                                                                  │
│  ┌─────────────────┐                                            │
│  │   "crawl" tool  │                                            │
│  │                 │                                            │
│  │  - urls[]       │                                            │
│  │  - format       │                                            │
│  │  - waitFor      │                                            │
│  │  - jsCode       │                                            │
│  └────────┬────────┘                                            │
│           │                                                      │
└───────────┼──────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Extension (this repo)                       │
│                                                                  │
│  ┌─────────────┐    ┌──────────────┐    ┌────────────────┐      │
│  │ config.ts   │───▶│ crawlTool.ts │───▶│ HTTP Request   │      │
│  │             │    │              │    │                │      │
│  │ - baseUrl   │    │ - params     │    │ - POST /crawl  │      │
│  │ - proxy     │    │ - format     │    │                │      │
│  └─────────────┘    └──────────────┘    └───────┬────────┘      │
│                                                  │               │
└──────────────────────────────────────────────────┼───────────────┘
                                                   │
                    ┌──────────────────────────────┤
                    │                              │
                    ▼                              ▼
        ┌───────────────────┐          ┌───────────────────┐
        │   crawl4ai API    │          │   Proxy Server    │
        │   (Docker :11235) │          │   (if configured) │
        │                   │          │                   │
        │  /crawl           │◀─────────│  Oxylabs ISP      │
        │  /crawl/stream    │          │  or custom URL    │
        │  /md              │          │                   │
        └─────────┬─────────┘          └───────────────────┘
                  │
                  ▼
        ┌───────────────────┐
        │   Target Website  │
        │                   │
        │   - JS rendering  │
        │   - Markdown gen  │
        │   - Link extract  │
        └───────────────────┘
```

## Data Flow

### 1. Tool Invocation

```
User: "Crawl https://example.com"
  │
  ▼
Pi calls "crawl" tool with { urls: ["https://example.com"], format: "markdown" }
  │
  ▼
crawlTool.ts builds payload
  │
  ▼
POST to CRAWL4AI_BASE_URL/crawl
```

### 2. Request Payload

```json
{
  "urls": ["https://example.com"],
  "browser_config": {
    "proxy": {
      "server": "http://pr.oxylabs.io:7777",
      "username": "user-xxx",
      "password": "xxx"
    }
  },
  "crawler_config": {
    "markdown_generator": true
  }
}
```

### 3. Response Processing (token-budgeted)

```
crawl4ai returns CrawlResult[]
  │
  ▼
toFormattedPages()  // prefer fit_markdown, normalize
  │
  ▼
decideReturnMode()  // auto | inline | files
  │
  ├─ inline: apply char budgets, optional truncate + save
  └─ files:  auto-save full bodies, return page index + excerpts
  │
  ▼
Return slim details (no raw HTML/markdown dump) to Pi
```

Token-budget defaults live in `config.tokenBudget` / env (`CRAWL4AI_MAX_CHARS_*`, `CRAWL4AI_RETURN_MODE`, …) and can be overridden per call.

### 4. Retention / cleanup

Saved sessions under `outputDir` are pruned after saves when `retention.enabled` is true:

- `maxSessions` — keep newest N
- `maxAgeDays` — drop older than N days
- `maxTotalMb` — soft total size cap (oldest first)

Only dirs with `crawl-manifest.json` are deleted. Manual: `/crawl-sessions`, `/crawl-cleanup [dry-run]`.

### 5. Progressive read (`crawl_read`)

On save, each markdown page also writes:
- `*.outline.md` — headings + short previews
- `*.meta.json` — title, charCount, headings[]
- manifest `pages[]` with file/outline/meta paths

`crawl_read` opens those artifacts with modes `outline | chunks | window | full` and a hard `maxChars` budget. `/crawl-on` enables both `crawl` and `crawl_read`.

## Configuration Layers

```
Environment Variables
        │
        ▼
┌─────────────────┐
│    config.ts    │
│                 │
│  Priority:      │
│  1. PROXY_URL   │
│  2. OXYLABS_*   │
│  3. No proxy    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ buildBrowser    │
│ Config()        │
│                 │
│  Creates proxy  │
│  config for     │
│  crawl4ai       │
└─────────────────┘
```

## Extension Points

### Adding New Tools

1. Create `src/features/<name>/<name>Tool.ts`
2. Define types in `src/features/<name>/types.ts`
3. Register in `src/index.ts`

### Adding New Output Formats

1. Add type to `CrawlFormat` in `types.ts`
2. Add handling in `formatResult()` in `crawlTool.ts`
3. Update tool description

## Dependencies

| Package | Purpose |
|---------|---------|
| `@mariozechner/pi-coding-agent` | Extension API types |
| `@sinclair/typebox` | Schema definitions |

## External Dependencies

| Service | Purpose | Required |
|---------|---------|----------|
| crawl4ai Docker | Web crawling engine | Yes |
| Proxy server | Anonymous crawling | No |

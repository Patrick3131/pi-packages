---
owner: repo-maintainers
last_verified: 2026-04-15
applies_to: /**
inherits_from: none
canonical_for: System architecture and data flow
---

# CONTEXT.md

## System Overview

pi-crawl4ai is a Pi extension that provides web crawling capabilities using a crawl4ai
Docker/API service. Auth profiles (cookies/headers/user-agent) are applied client-side.
Egress/proxy is **server-managed** (operator pinning proxy on the crawl4ai host). This
client never sends `proxy` / `proxy_config` in crawl request bodies.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Pi Agent                                 │
│  crawl / crawl_read tools                                        │
└───────────┬─────────────────────────────────────────────────────┘
            │ POST /crawl  (urls, browser_config cookies/headers/UA,
            │              crawler_config; Authorization bearer)
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Extension (this package)                    │
│  config → auth selection → browser_config (no proxy)             │
│  token budget → optional save + crawl_read                       │
└───────────┬─────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│   crawl4ai API (Docker)                                          │
│   Chromium → PinningProxy → operator ISP proxy → target          │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Tool Invocation

```
User: "Crawl https://example.com"
  → Pi calls crawl { urls: ["https://example.com"], format: "markdown" }
  → buildBrowserConfig() (auth only)
  → POST CRAWL4AI_BASE_URL/crawl
```

### 2. Response Processing (token-budgeted)

```
crawl4ai returns CrawlResult[]
  → toFormattedPages()
  → decideReturnMode()  // auto | inline | files
  → inline or auto-save + page index
  → slim details to Pi
```

### 3. Progressive read (`crawl_read`)

Saved pages get `*.outline.md`, `*.meta.json`, and manifest `pages[]` with paths relative to the session. Files-mode crawl output also exposes the exact manifest and page paths; read the manifest first or use an exact path, never a flattened filename. `crawl_read` can resolve a page URL through a manifest/session and reports missing paths as tool errors.

Inline results with `save` omitted or `false` are not persisted; truncated inline content cannot be recovered by `crawl_read`.

`crawl_read` modes: outline | chunks | window | full.

### 4. Retention

Saved sessions under `outputDir` pruned after saves when retention enabled.

## Configuration Layers

```
JSON config (.pi/crawl4ai.json or ~/.pi/agent/extensions/crawl4ai.json)
  → env fallback (CRAWL4AI_*)
  → defaults
```

Relevant keys: `url`, `apiToken`, `timeoutMs`, `minRequestIntervalMs`,
`authProfiles`, `tokenBudget`, `retention`, `outputDir`. Startup on/off for
`crawl` / `crawl_read` lives in `.pi/tools.json`.

## Extension Points

### Adding New Tools

1. Create `src/features/<name>/<name>Tool.ts`
2. Define types in `src/features/<name>/types.ts`
3. Register in `src/index.ts`

## Dependencies

| Package | Purpose |
|---------|---------|
| `@mariozechner/pi-coding-agent` | Extension API types |
| `@sinclair/typebox` | Schema definitions |

## External Dependencies

| Service | Purpose | Required |
|---------|---------|----------|
| crawl4ai Docker/API | Web crawling engine + egress | Yes |

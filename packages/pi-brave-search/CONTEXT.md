---
owner: repo-maintainers
last_verified: 2026-04-15
applies_to: /**
inherits_from: ../../CONTEXT.md
canonical_for: Package architecture and data flow
---

# CONTEXT.md

## System Overview

pi-brave-search is a Pi extension that exposes Brave Web Search through a single `brave_search` tool. It is designed to pair well with `pi-crawl4ai`: search first, then crawl selected result URLs when full page content is needed.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                      Pi Agent                        │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │              "brave_search" tool              │  │
│  │  - query                                       │  │
│  │  - count / offset                              │  │
│  │  - country / language / safesearch             │  │
│  └───────────────────────────┬────────────────────┘  │
└──────────────────────────────┼───────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────┐
│                Extension (this repo)                │
│                                                      │
│  ┌─────────────┐        ┌────────────────────────┐  │
│  │ config.ts   │───────▶│ searchTool.ts          │  │
│  │ - apiKey    │        │ - parameter mapping    │  │
│  │ - baseUrl   │        │ - HTTP request         │  │
│  │ - timeout   │        │ - result normalization │  │
│  └─────────────┘        └─────────────┬──────────┘  │
└───────────────────────────────────────┼─────────────┘
                                        │
                                        ▼
                          ┌──────────────────────────┐
                          │   Brave Search API       │
                          │   GET /web/search        │
                          └─────────────┬────────────┘
                                        │
                                        ▼
                          ┌──────────────────────────┐
                          │ Ranked search results    │
                          │ titles, URLs, snippets   │
                          └──────────────────────────┘
```

## Data Flow

1. Pi invokes `brave_search` with a query.
2. `searchTool.ts` builds a Brave Search request.
3. The extension sends `GET /web/search` with the subscription token.
4. The response is normalized into compact result objects.
5. Pi can use result URLs directly or pass them to `crawl` later.

## Configuration Layers

1. `.pi/brave-search.json`
2. `~/.pi/agent/extensions/brave-search.json`
3. Environment variables
4. Defaults for base URL and timeout

## Dependencies

| Package | Purpose |
|---------|---------|
| `@mariozechner/pi-coding-agent` | Extension API |
| `@sinclair/typebox` | Tool schema |

## External Dependencies

| Service | Purpose | Required |
|---------|---------|----------|
| Brave Search API | Web search results | Yes |

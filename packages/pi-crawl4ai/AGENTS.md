---
owner: repo-maintainers
last_verified: 2026-04-15
applies_to: /**
inherits_from: none
canonical_for: Package-specific working agreements
---

# AGENTS.md

## Purpose

This document defines working agreements, conventions, and navigation for the pi-crawl4ai extension.

## Scope

A Pi extension for web crawling using crawl4ai. Egress/proxy is owned by the crawl4ai
server (operator pinning proxy).

## Commands

```bash
npm run build      # Build the extension
npm run dev        # Build with watch mode
npm run typecheck  # Type check
npm run lint       # Lint
npm run test       # Run tests
npm run test:coverage  # Run tests with coverage
```

## Architecture

```
src/
├── index.ts              # Extension entry point
├── config.ts             # Configuration loading from env/JSON
└── features/
    └── crawl/
        ├── crawlTool.ts      # Crawl tool implementation
        ├── crawlReadTool.ts  # Progressive reader for saved pages
        ├── tokenBudget.ts    # Result size budgeting
        ├── saveOutput.ts     # Disk persistence + sidecars
        └── types.ts          # TypeScript types
```

## Conventions

### Code Style

- TypeScript strict mode
- `camelCase` for variables/functions
- `PascalCase` for types/interfaces/classes
- `kebab-case` for files

### Environment Variables

All configuration via environment variables or JSON (no hardcoded credentials):

| Variable | Description | Default |
|----------|-------------|---------|
| `CRAWL4AI_BASE_URL` | crawl4ai Docker API URL | `http://localhost:11235` |
| `CRAWL4AI_API_TOKEN` | Bearer token for crawl4ai API | - |
| `CRAWL4AI_TIMEOUT` | Request timeout (ms) | `60000` |
| `CRAWL4AI_MIN_REQUEST_INTERVAL_MS` | Client request pacing | - |
| `CRAWL4AI_OUTPUT_DIR` | Saved crawl root | `./output-crawl4ai` |

Do **not** configure client-side proxy credentials. Proxy/egress belongs on the crawl4ai host.

### Adding New Features

1. Create a new folder in `src/features/`
2. Export types from `types.ts`
3. Export tool registration from feature module
4. Import and register in `src/index.ts`
5. Add tests in `<feature>.test.ts`

### Testing

- Tests colocated with source: `src/**/*.test.ts`
- Mock external dependencies (fetch, APIs)
- Use `global.mockFetch()` helper for fetch mocking
- Run tests before committing

## Change Policy

- Update this file when package conventions change
- Keep CONTEXT.md architecture in sync with major structural changes

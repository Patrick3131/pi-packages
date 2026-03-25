---
owner: repo-maintainers
last_verified: 2025-03-25
applies_to: /**
inherits_from: none
canonical_for: Repo-wide working agreements and navigation
---

# AGENTS.md

## Purpose

This document defines working agreements, conventions, and navigation for the pi-crawl4ai extension.

## Scope

A Pi extension for web crawling using crawl4ai with optional proxy support.

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
├── config.ts             # Configuration loading from env
└── features/
    └── crawl/
        ├── crawlTool.ts  # Crawl tool implementation
        └── types.ts      # TypeScript types
```

## Conventions

### Code Style

- TypeScript strict mode
- `camelCase` for variables/functions
- `PascalCase` for types/interfaces/classes
- `kebab-case` for files

### Environment Variables

All configuration via environment variables (no hardcoded credentials):

| Variable | Description | Default |
|----------|-------------|---------|
| `CRAWL4AI_BASE_URL` | crawl4ai Docker API URL | `http://localhost:11235` |
| `CRAWL4AI_PROXY_URL` | Full proxy URL with auth | - |
| `OXYLABS_USER` | Oxylabs username | - |
| `OXYLABS_PASS` | Oxylabs password | - |
| `OXYLABS_HOST` | Oxylabs proxy host | `pr.oxylabs.io` |
| `OXYLABS_PORT` | Oxylabs proxy port | `7777` |
| `CRAWL4AI_TIMEOUT` | Request timeout (ms) | `60000` |

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

- Update `AGENTS.md` when adding new features or changing conventions
- Update `CONTEXT.md` when architecture changes
- Update `README.md` for user-facing changes

## References

- Pi extension docs: https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md
- crawl4ai docs: https://github.com/unclecode/crawl4ai

---
owner: repo-maintainers
last_verified: 2026-09-30
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
npm run test       # Run tests
npm run test:coverage  # Run tests with coverage
```

## Architecture

```
src/
├── index.ts              # Extension entry point
├── config/               # Configuration loading from env/JSON
└── features/
    └── crawl/
        ├── crawlTool.ts      # Remote crawling + file-first/filter wiring
        ├── crawlReadTool.ts  # Progressive reader for saved pages
        ├── http.ts           # Shared deadline/auth/bounded HTTP
        ├── presentation.ts   # Fixed previews + compact saved-page indexes
        ├── saveOutput.ts     # Complete persistence + sidecars
        ├── bm25.ts           # Shared structural query ranking
        ├── trafilatura.ts    # Optional HTML-stdin Python extraction
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
| `CRAWL4AI_TRAFILATURA_PYTHON` | Explicit Python executable with trafilatura>=2,<3 | Unset (optional) |

Do **not** configure client-side proxy credentials. Proxy/egress belongs on the crawl4ai host.

### Adding New Features

1. Create a new folder in `src/features/`
2. Export types from `types.ts`
3. Export tool registration from feature module
4. Import and register in `src/index.ts`
5. Add tests in `<feature>.test.ts`

### Behavior and resources

- Omitted save is file-first, even for small pages; auto returns exact references. save=false opts out; inline previews never truncate saved bodies. Keep fixed 12,000-character body previews, default 6,000-character reads and host byte/line limits. Presentation defaults are not JSON/env configuration; caller preview controls can lower crawl caps.
- BM25 retains pre-filter source and valid empty selections. Trafilatura saves rendered raw HTML first; extraction is optional, local HTML-stdin only, with no dependency installation or silent fallback. Document native structure losses instead of heuristic repairs.
- Keep external /tools/presets/CLI activation authoritative. No lifecycle active-set mutations; crawl-status is on-demand, without startup network/subprocess probes.
- Agent resources use package crawl4ai, model inherit and exactly crawl/crawl_read; no bash/subagent grants. Declare pi.subagents.agents in root Git and standalone manifests and include agents in npm files. Provider loading is distinct from discovery: document child extensions/subagentOnlyExtensions guidance, not machine-specific paths or shell fallback.
- Keep deferred CSS/XPath/schema/provider engines, prompt templates, custom UI and capability registries out of this slice.

### Testing

- Tests colocated with source: `src/**/*.test.ts`
- Mock external dependencies (fetch, APIs)
- Use `global.mockFetch()` helper for fetch mocking
- Run tests before committing
- Run npm pack dry-run and actual installed pi-subagents discovery checks after resource changes; inspect model inheritance and the strict tool allowlist. Do not launch children without operator authorization.
- Real API proof must not use a plain HTTPS fallback. Stock 0.9.4 rejects untrusted deep strategies; the operator discovery-services capability supports bounded non-streaming traversal without relaxing ordinary UNTRUSTED or SSRF/egress gates. Other deployments require their own runtime proof. HTTP abort is not proof of remote browser cancellation.

## Change Policy

- Update this file when package conventions change
- Keep CONTEXT.md architecture in sync with major structural changes

Host imports use `@earendil-works/pi-coding-agent` and `typebox`; both are host-provided peers, never runtime dependencies.

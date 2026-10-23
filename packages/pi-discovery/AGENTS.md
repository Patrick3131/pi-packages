---
owner: repo-maintainers
last_verified: 2026-10-23
applies_to: packages/pi-discovery/**
inherits_from: ../../AGENTS.md
canonical_for: pi-discovery package conventions
---

# pi-discovery — AGENTS.md

## Purpose

SearXNG search and server-owned Luna research tools.

## Rules

- Tools: `web_search_searxng` and `web_answer`; no additional provider surface.
- Do not add `web_fetch`, Brave API search, or xAI search.
- Default the tool **off**.
- Default URL is the VPN bind, not localhost.
- Default engines are `brave,duckduckgo`.
- Keep MIT attribution to `pi-searxng-search`.

## Commands

```bash
npm test --workspace=packages/pi-discovery
npm run typecheck --workspace=packages/pi-discovery
```

`typebox` is supplied by Pi; declare it as a peer, not a runtime dependency.

Environment reads belong in src/config.ts. Default-off uses native ToolDefinition.defaultActive;
project/preset/loadout ownership stays with Pi/toolkit. Answer validates wire data,
keeps search evidence distinct from citations and never retries. Auth is server-owned.

Keep the default HTTP timeout above the maximum exposed server budget. Queue
waiting belongs to the total request deadline; execution is separately bounded
by the service. Do not add client retries or admission predictions.

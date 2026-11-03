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

- Tools: `web_search_searxng`, `web_answer`, `ad_library_keyword_ads` and
  `ad_library_domain_ads`. Ad Library talks only to the discovery API; no provider secrets.
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

Ad Library defaults off. Its HTTP timeout is max(configured 130000ms floor, server
budget + 10000ms), supporting 180000ms requests with 190000ms client budgets.
Preserve AbortError, sanitized server codes, receipts, partial and truncation.

Ad Library model-visible output includes landing domains/URLs, page IDs, ad copy
and supplied image/video/carousel previews. Native outputSchema/structuredContent
exposes all API-returned ads and metadata to codemode. Text previews are bounded
and explicitly shortened; structured data remains available. Counts are samples,
not total active inventory. Domain not-found/ambiguous outcomes preserve server
codes and are normal lookup outcomes, never proof that a brand has no ads.

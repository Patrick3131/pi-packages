---
owner: repo-maintainers
last_verified: 2026-10-23
applies_to: packages/pi-discovery/**
inherits_from: ../../CONTEXT.md
canonical_for: pi-discovery architecture
---

# pi-discovery — Context

```
src/config.ts   URL / enable flags
src/search.ts   GET /search?format=json
src/answer.ts   bounded cancellable POST /v1/web-answer
src/index.ts    register both tools with native defaultActive
```

Live instance: Dokploy `Tools` / `discovery-services`, JSON on
`http://10.8.0.1:18089` and `http://172.18.0.1:18089`. No API token.

`pi-packages/research` exports the shared web_search_searxng tool descriptor and execution client so other harnesses reuse the coding-agent tool name, description and parameter schema.

Environment reads belong in src/config.ts. Default-off uses native ToolDefinition.defaultActive;
project/preset/loadout ownership stays with Pi/toolkit. Answer validates wire data,
keeps search evidence distinct from citations and never retries. Auth is server-owned.

Web answers default to a 180-second total server budget (up to 300 seconds)
and a 310-second HTTP timeout. Server admission allows two running and 32 waiting
requests; individual Codex turns remain capped at 60 seconds. Explicit HTTP
timeout overrides must still exceed the requested server budget by five seconds.

The shared answer descriptor explains question/instructions, returned-source cap and total server budget. It supports URL discovery without requiring a separate raw-search tool in every consumer.

## Meta Ad Library

`ad_library_keyword_ads` discovers advertisers by keyword; `ad_library_domain_ads`
requires exactly one of `domain` or `page_id`. Both accept country, active_only,
max_ads (1–300) and timeout_ms (5000–180000, default 120000). They default off;
enable with `DISCOVERY_AD_LIBRARY_ENABLED=1` or per-project `.pi/tools.json`.
The configured `DISCOVERY_AD_LIBRARY_TIMEOUT_MS` is a floor (130000 by default);
effective timeout includes 10000ms beyond the server budget. No client retries.
Results expose receipts, resolved-page votes, partial results and truncation.
Harness-neutral exports: `searchAdLibrary`, `adsForAdvertiser`, `formatAdLibrary`,
`AdLibraryClientError`. Errors preserve safe server codes and Retry-After;
caller abort remains AbortError. Live tests opt in with `DISCOVERY_LIVE=1`.

Ad Library model-visible output includes landing domains/URLs, page IDs, ad copy
and supplied image/video/carousel previews. Native outputSchema/structuredContent
exposes all API-returned ads and metadata to codemode. Text previews are bounded
and explicitly shortened; structured data remains available. Counts are samples,
not total active inventory. Domain not-found/ambiguous outcomes preserve server
codes and are normal lookup outcomes, never proof that a brand has no ads.

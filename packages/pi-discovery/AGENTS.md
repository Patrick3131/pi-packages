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

- Tools: `web_search_searxng`, `web_answer`, `ad_library_keyword_ads`,
  `ad_library_domain_ads`, `social_profile`, `social_profile_posts` and
  `social_post`. Ad Library and social talk only to the discovery API; no provider
  secrets.
- Social tools are Instagram only. Send exactly one selector, never a caller-built
  upstream URL, and keep canonical URL validation mirrored between client and service.
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

API 0.3.1 resolves dynamic template copy using one representative card. Preserve
`template_fields` and zero-based `representative_card_index` in structured
output; the text formatter labels this source and shows its product landing
URL separately. Unresolved copy is null. Legacy template strings are labelled
unavailable in text previews. DCO cards may be variants, not carousel slides.

Social routes default off via `DISCOVERY_SOCIAL_ENABLED`. `DISCOVERY_SOCIAL_TIMEOUT_MS`
is a 130000ms floor; an omitted tool timeout resolves to the route default (30000
profile/post, 120000 profile-posts) and the HTTP budget is max(floor, effective server
budget + 10000), reaching 190000ms for 180000ms samples. No Instagram, proxy, cookie
or query-id configuration belongs in Pi.

Preserve the full social wire contract in structured output: ids/platform/observed_at,
profile and post records, media reference URLs, nullable counts, requested/returned
counts, tri-state `has_more_posts`, `failed_posts`, `sample_failure` including
`retry_after_s`, truncation/warnings order and timings. HTTP 200 partial data is
`status: partial` with `isError` unset; only failed HTTP/client calls are errors, and
404 keeps the exact route-specific `not_found` code. `partial` is not a retry signal:
no client retries, waits, rotation or reacquisition, and no `Retry-After` on HTTP 200.

Model-visible social text stays under 12000 characters with at most five post previews
of 300 caption characters and an explicit shortening label. Keep null/zero/hidden
counts, actual post authors and unknown continuation visible, and never present pinned
encounter order as the latest chronological posts.

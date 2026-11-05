---
owner: repo-maintainers
last_verified: 2026-10-23
applies_to: packages/pi-discovery/**
inherits_from: ../../CONTEXT.md
canonical_for: pi-discovery architecture
---

# pi-discovery — Context

```
src/config.ts           URL / enable flags / timeout floors
src/search.ts           GET /search?format=json
src/answer.ts           bounded cancellable POST /v1/web-answer
src/ad-library.ts       POST /v1/ad-library/search client and result types
src/ad-library-tools.ts native Ad Library tools and output schema
src/social.ts           POST /v1/social/{profile,profile-posts,post} clients
src/social-validation.ts selector, URL and wire-response validation
src/social-tools.ts     native social tools, schemas and registration
src/index.ts            register every tool with native defaultActive
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

API 0.3.1 resolves dynamic template copy using one representative card. Preserve
`template_fields` and zero-based `representative_card_index` in structured
output; the text formatter labels this source and shows its product landing
URL separately. Unresolved copy is null. Legacy template strings are labelled
unavailable in text previews. DCO cards may be variants, not carousel slides.

## Social profile and post metadata

`social_profile` calls one profile query, `social_profile_posts` adds a bounded
listing + hydration sample, and `social_post` queries one exact post. All three are
Instagram only, default off, enabled by `DISCOVERY_SOCIAL_ENABLED=1/true` or the
project tool selection, and talk only to the Discovery API: Pi holds no Instagram,
proxy, cookie or query-id configuration. The service's own `SOCIAL_ENABLED` gate
remains authoritative, so a disabled server still answers with a typed
`social_disabled` error.

`src/social-validation.ts` owns request selectors and response parsing. Requests
carry exactly one selector and an explicit `platform: "instagram"`; omitted
`timeout_ms` values resolve to 30000 (profile/post) or 120000 (profile-posts) before
the fetch, `max_posts` resolves to 12, and URLs must be canonical HTTPS
`instagram.com`/`www.instagram.com` forms without userinfo, explicit ports,
percent-encoded paths, backslashes, traversal or reserved profile segments. Responses
are validated against the documented contract and rejected as `malformed` rather than
defaulted; unknown extra fields are preserved.

`src/config.ts` resolves `DISCOVERY_BASE_URL` plus a `DISCOVERY_SOCIAL_TIMEOUT_MS`
floor (130000 default). The HTTP budget is max(floor, effective server budget +
10000), so a 180000 ms sample gets 190000 ms. One fetch per call: no retries, no
rotation, no admission prediction and no health probe. Caller abort wins and stays
`AbortError`; the owned timer and abort listener are cleared on every exit.

`SocialClientError` mirrors the Ad Library error shape (code, status, serverCode,
requestId, retryAfterMs, reason) and never carries raw response or transport text.
HTTP 200 partial data stays `structuredContent.status = "partial"` with `isError`
unset and keeps `sample_failure.retry_after_s`; a 404 becomes `not_found` with the
exact `social_profile_not_found` or `social_post_not_found` code. Harness-neutral
exports: `getSocialProfile`, `getSocialProfilePosts`, `getSocialPost`,
`formatSocialProfile`, `formatSocialProfilePosts` and `formatSocialPost`.

---
owner: repo-maintainers
last_verified: 2026-09-30
applies_to: /**
inherits_from: none
canonical_for: System architecture and data flow
---

# pi-crawl4ai architecture

## Boundary

The configured remote Crawl4AI browser/API service owns URL fetching, rendering and egress/proxy. The client retains bearer auth and never sends proxy credentials/settings. Basic tools require neither local Python/browser nor pi-subagents.

```text
crawl → validation/deadline → process-local pacing → POST /crawl
  → validate/normalize response → optional saved rendered HTML + Trafilatura
  → optional shared BM25 → complete save → compact paths/manifest or bounded inline
                                      ↓
                         crawl_read exact path / URL lookup
```

`src/index.ts` registers typed `crawl` / `crawl_read` and on-demand status/session/cleanup commands. Registration performs no network/subprocess probes and does not alter the active tool set. `/tools`, presets and explicit CLI/child allowlists own activation. No persistent UI, prompts, automatic delegation or new extraction/provider/schema engine.

## Transport and service contract

`http.ts` composes caller abort and the configured deadline across pacing, fetch/body and extraction, bounds responses to 20 MiB and redacts diagnostics. Trailing service slashes are normalized. No POST retry; HTTP cancellation may leave server browser work running. Total failures/malformed responses are errors; mixed failures are explicitly partial; empty ordinary content warns.

`waitFor` maps milliseconds to `delay_before_return_html` seconds. Cache uses typed `CacheMode` enabled/bypass. Deep traversal uses typed BFS/DFS/best-first strategies and filter chains; public maxDepth=1 maps to upstream zero (seed only).

Stock upstream 0.9.4 rejects untrusted deep strategies. The operator-managed discovery-services deployment exposes narrowly validated, non-streaming server-owned strategies while preserving ordinary UNTRUSTED loading, SSRF/DNS pinning and operator egress. Operator attempts/frontiers/deadlines are bounded; deep streaming/raw-regex filters are unsupported. Other deployments still need genuine runtime proof; health/unit/package checks are insufficient.

## File-first policy and presentation

`presentation.ts` defines fixed previews and compact saved-page indexes. Omitted save persists even small crawls; auto returns paths. Explicit inline saves complete bodies too. save=false means bounded inline with no writes; files+no-save fails preflight. Smaller positive caller preview caps apply, bounded by the fixed 12,000-character total body cap. Default deep maxPages is 10 and index excerpts are 200 characters; presentation defaults have no JSON/env plumbing. Final output uses host byte/line truncation; the index lists at most 20 entries and points to the complete manifest. `crawl_read` defaults to 6,000 characters and is also host-bounded. Saved content is not presentation-truncated; zero remaining space is not unlimited.

## Durable artifacts and reads

`saveOutput.ts` allocates unique sessions and bounded full-URL-hashed filenames, writes bodies/sidecars first and publishes the manifest atomically last. `pages[].file` stays the primary output. Optional feature metadata:

- `sourceFile`: pre-BM25 Markdown/text; `filter`: query, threshold and matched/total counts.
- `rawHtmlFile`: rendered HTML saved before Trafilatura; `extractor`: name/includeLinks.

Manifests record crawl provenance additively: `request` holds the effective values (`format`, `bypassCache`, `preferFitMarkdown`, optional `waitFor`, `jsCode` as a boolean only, `deepCrawl` with resolved strategy/depth/maxPages plus filters, optional `bm25`, optional `extractor`); `service.baseUrl` is written with URL userinfo stripped; failed `pages[]` entries keep a redacted `error`. `jsCode` source and configured tokens never reach disk, and the legacy top-level `deepCrawl` field remains for existing readers.

For Trafilatura+BM25, sourceFile is extracted pre-filter content, not a second original Markdown archive; rawHtmlFile is the original recovery source. Extraction errors report that exact HTML path even before manifest publication. Ordinary unfiltered crawls need no source archives. URL resolution requires `pages[]` records; directories require a manifest rather than selecting an arbitrary Markdown file. Safe exact-page reads need neither a manifest nor a timestamp.

Outlines/meta and paths remain session-relative in manifests. Generated/manifest paths reject traversal/symlink escape; this is not a whole-tool filesystem sandbox. Relative output/read paths use ctx.cwd. Exact printed page paths work directly; outline-first is optional.

`crawl_read` supports outline/chunks/window/full, shared BM25 query ranking and labelled excerpt/source ranges. URL-only lookup selects the newest matching completed default-root session. Explicit session/manifest context is strict, with no global fallback; custom outputs use exact paths. A missing newest matching artifact does not silently become stale content.

`cleanup.ts` sees completed owned sessions only, excludes the just-returned session during that save's cleanup and uses soft size retention. Later retention may expire it; no permanent pinning or lease contract. Its listing parse also exposes `host` (first requested URL, falling back to the first saved page) and `pageCount` (`pages[]` length, falling back to `totalPages`), degrading to `undefined` instead of failing.

`/crawl-sessions` prints `n. name  size MB  host ×pages  timestamp` rows. A selector (`n`, exact name or unique name prefix, resolved by `sessions.ts` against the same newest-first listing) drills into one session: the exported manifest-overview renderer runs with numbering and a 20-page cap plus `… and N more`, the request summary is bounded, and the manifest path is always printed. The drill-down enters model context as a `crawl-sessions` message; selector failures are a notification in UI mode and a message in headless runs, naming the candidates or the searched root, so no other session's pages appear.

## Filters and optional extraction

`bm25.ts` implements one Unicode-aware Okapi scorer (k1=1.5, b=0.75). Fence-aware heading sections and headingless paragraphs preserve selected code/table blocks and source order, without a full AST or heading/reference reconstruction. Crawl BM25 requires one URL, Markdown/text and no deep crawl; threshold defaults to 1.0 (finite >=0, nonblank query required). Empty matches are a valid empty saved file with original references. Read queries reuse positive scoring with no public read threshold; ranking does not replace output caps.

`trafilatura.ts` spawns one explicitly configured Python with HTML stdin, no shell/URL fetch/install. Supported setup is trafilatura>=2,<3. Native tables/formatting are enabled; includeLinks defaults false. Markdown/text only; text requires the extractor and extraction requires saving. The wrapper bounds input/output/stderr, observes the remaining crawl deadline, terminates then force-kills after a short grace and cleans listeners/timers. Missing dependency/failure is actionable, never a silent fallback. Native structure/table/link/image losses are documented; read preserved sources instead of heuristic supplementation.

## Configuration and resources

JSON search: working directory, `.pi/`, then `~/.pi/agent/extensions/`, using `crawl4ai.json` before `.crawl4ai.json` per directory. Prefer `.pi/crawl4ai.json` for project setup. Env fallback/defaults and `${ENV_VAR}` substitution apply. Keys include url/apiToken/timeoutMs/minRequestIntervalMs/outputDir, retention and `trafilatura.pythonPath` (`CRAWL4AI_TRAFILATURA_PYTHON`). See README/.env.example for setup.

`agents/{scrape,crawl,extract}.md` declare package crawl4ai, model inherit, exactly crawl/crawl_read and no nested subagents. Root Git and standalone npm discovery uses `pi.subagents.agents`; npm files include agents and dist. Model inference is labelled and facts are source-backed, not schema-validated extraction. Named tools do not load their provider: foreground children need operator-configured extensions/subagentOnlyExtensions, while background children can use normal discovery. No hardcoded machine paths, installer, global symlinks or fallback shell tools.

## Dependencies and validation

`@earendil-works/pi-coding-agent` and `typebox` are host-provided peers, not bundled runtime copies. Tests are colocated; strict live tests are explicitly opt-in and never substitute plain HTTPS for browser/API proof. Package discovery, actual Python, interactive/headless and authorized child launch evidence are distinct from unit/build checks. Deep-strategy support is deployment-specific.

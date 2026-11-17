---
status: backlog
owner: engineering
last_reviewed: 2026-10-21
canonical_ref: none
---

# Crawl package landscape and improvement options for pi-crawl4ai

## Type

research

## Trigger

A user-supplied package link (`https://pi.dev/packages/@xberg-io/opencode-crawlberg?name=crawl`)
plus a request to survey crawl packages generally and compare them with
`packages/pi-crawl4ai`, collecting reusable inspirations.

## Method and evidence quality

Two independent research lanes were run by `web-researcher` children (tools:
`bash`, `crawl`, `crawl_read`, `read`, `write`). Neither lane had
`web_search_searxng` in its tool set, so discovery used git clones, the npm
registry API, GitHub/PyPI JSON APIs, and `crawl` against documentation pages.
All clones used `/tmp/crawl-research/`; nothing was installed and no file in this
repository was modified. Child run ids: `c4454aff` (ecosystem),
`2049fd30` (upstream).

Evidence is graded below:

- **SOURCE-READ** — read directly from upstream source/README at the stated commit.
- **VERIFIED HERE** — re-checked by the parent against our own code at the cited line.
- **INFERRED** — plausible but not directly observed.

Upstream baseline: `crawl4ai` clone at commit `30165f1ee1fb61f6cce1477feed2acc5e2181e25`,
`__version__ = "0.9.5"` (2026-10-14) with an `[Unreleased]` section on top. No
live probe of the deployed server was performed; see Open Questions.

## 1. The linked package is not a crawler for Pi

**SOURCE-READ.** `@xberg-io/opencode-crawlberg` (npm latest `1.11.1`, MIT) is a
skills + prompt-templates package. pi.dev reports its types as `skill, prompt`,
with no extension, no MCP registration and no tools; its own README states it
"does not register MCP servers, hooks, or native Pi extensions". Its entry points
are the slash commands `/crawlberg-scrape` and `/crawlberg-crawl`.

Its real tool surface lives elsewhere in the same monorepo
(`github.com/xberg-io/crawlberg`, Rust engine, not Firecrawl/Crawl4AI):

- **OpenCode plugin** — `crawlberg_scrape`, `crawlberg_crawl`, `crawlberg_map`,
  each `spawn("crawlberg", …)` against a **locally installed binary**
  (`brew install xberg-io/tap/crawlberg`), returning
  `{ title, content: stdout+stderr, metadata: { exitCode, signal, command, subcommand } }`.
- **MCP server** (stdio, 9 tools) — `scrape`, `crawl`, `map`, `batch_scrape`,
  `batch_crawl`, `download`, `interact`, `generate_citations`, `get_version`.
- **REST server** — Firecrawl-v1-compatible: `/v1/scrape`, `/v1/crawl`,
  `/v1/map`, `/v1/batch/scrape`, `/v1/download`, plus `/openapi.json`.

Notable engineering worth learning from (independent of transport choice):

- Every MCP tool returns both a human text block and `structuredContent`, and the
  advertised `outputSchema` is derived from the **same struct** with tests
  asserting they cannot drift.
- Per-item batch results (`BatchScrapeItem { url, ok, result?, error? }`) so one
  bad URL cannot fail a batch.
- An honest dual-shape `download` result: either `{mime_type, size, filename,
  content_hash}` or an explicit "this was HTML, not a document" shape.
- RFC 9111 shared-cache semantics, including ignoring a malformed `max-age`
  rather than treating it as zero.
- `map` as a first-class render-free operation ("does not render pages — use it
  to plan a crawl").
- Tool annotation hints treated as a tested contract, with `interact` correctly
  marked `destructive_hint: true`.

## 2. Landscape: where our design sits

Survey scope: Pi registry (`pi-scraper`, `pi-web-kit`, `@pixu1980/pi-web`,
`@danypops/pi-web-spider`, `donsetch`, `pi-firecrawl-lite`), the Firecrawl / Exa /
Tavily MCP servers, Jina Reader, `microsoft/markitdown`, and OpenCode's native
`webfetch`.

**Central finding: our file-first architecture is the mainstream design, and our
implementation is the most rigorous instance of it.** OpenCode's own `webfetch`
documents "large text results may be replaced with a preview while the complete
output is retained in managed storage". Every serious comparator converges on
preview-inline + full-payload-out-of-context + a continuation path. We already
have the hard parts: unique sessions, manifest published last, atomic artifact
writes, retention, outline/chunks/window/full reads, BM25 ranking, and provenance
with secrets stripped.

The competitors beat us on **ergonomics around truncation and metadata**, and on
two capabilities we do not expose at all. Nothing found invalidates our
constraints (file-first, server-owned egress, no client proxy, no shell-scraping
fallback, inert until `/tools`).

| Comparator | Distinctive idea worth studying |
| --- | --- |
| `@pixu1980/pi-web` | Truncation footer naming the exact next call: `[Showing 12000 of 45210 chars. Use pi_web_read({id, offset: 12000}) …]`; low-quality flag instead of nothing when extraction misses |
| `pi-web-kit` | `range` envelope per item (`offset/limit/returned/total/truncated/hasPrevious/hasNext/nextOffset`); explicit `omittedContextCharacters` accounting; `outputSchema` on every tool |
| `@danypops/pi-web-spider` | `contentOk: false` honest-failure signal; cache-query mode over already-fetched pages at zero network cost; verbatim quotes with URL text fragments |
| `pi-scraper` | Measured declaration-token budget per tool (1,489 → 724 tokens, 51.4%) with an activation ladder; `linesMatching`/`contextLines` reads; `resume`/`crawlId` crawl state |
| `donsetch` | `must_contain`, `toc`, `section` reducers; short result handles (`S1…Sn`) so referring to a result is cheap |
| Firecrawl MCP | Freshness as a first-class param (`maxAge`, with an explicit warning that success ≠ current); async job + status tool; cost disclosure in descriptions |
| Jina Reader | `x-cache-tolerance` (staleness seconds); `x-max-tokens` (truncate) vs `x-token-budget` (reject if over) kept explicitly distinct |
| OpenCode `webfetch` | Content negotiation via ordered `Accept` headers (ask for markdown rather than converting); per-resource permission gate with saved decisions |

## 3. Verified findings about our own package

Each row was re-checked by the parent against this repository.

| Finding | Evidence | Impact |
| --- | --- | --- |
| `preferFitMarkdown: true` is a silent no-op on a stock server — we never send `markdown_generator`, and upstream only builds `fit_markdown` when a `content_filter` is configured. | **VERIFIED HERE**: `crawlCore.ts:172-176` sends only `cache_mode`, `delay_before_return_html`, `js_code`, `deep_crawl_strategy`. `crawlCore.ts:122-123` normalizes `fit_markdown: null → undefined`, a guard that only exists if the server really returns null. **SOURCE-READ**: `markdown_generation_strategy.py` builds fit markdown only under `if content_filter or self.content_filter`. | Our documented default main-content preference degrades to raw markdown. `PruningContentFilterLXML` is in the untrusted allowlist, so populating it is a client-only payload change. |
| `jsCode` cannot work against ≥0.9.0 servers: `js_code` is in `UNTRUSTED_FORBIDDEN_FIELDS` and returns HTTP 400, with no operator opt-in for the `/crawl` body (only `/execute_js` behind `CRAWL4AI_EXECUTE_JS_ENABLED`). | **VERIFIED HERE**: we send it at `crawlCore.ts:175`. **Corroborated** by our own in-flight item, which recorded two production requests rejected as untrusted `js_code`. | Already covered by `AC3` of the content-preservation item; this independently confirms a real 400 rather than a policy choice. |
| `waitFor` is only a blind delay; upstream's real `wait_for` (CSS-selector condition) is allowlisted. | **VERIFIED HERE**: `crawlCore.ts:174` maps ms to `delay_before_return_html` seconds. | SPA readiness is guesswork. A selector wait is strictly better, server-side, and cheap to expose. |
| We ignore result fields we already receive: `tables`, `media`, `markdown_with_citations`/`references_markdown`, `cache_status`, `head_fingerprint`, `redirected_url`, `console_messages`. | **SOURCE-READ**: `crawl4ai/models.py` `CrawlResult`. | Citations and tables are free grounded evidence currently discarded. |
| Cache default diverges from upstream: we default to `enabled`, upstream `CrawlerRunConfig` defaults to `BYPASS`. | **VERIFIED HERE**: `crawlCore.ts:172`. | Deliberate, but undocumented as a divergence — and `cache_status` is available so freshness need not be guessed. |
| Name collision: our `pi-crawl4ai` is unpublished on npm while an unrelated maintainer's `pi-crawl4ai@0.3.2` (repo `romek-rozen/pi-crawl4ai`) occupies the name with a near-identical description, and pi.dev's `pi-crawl4ai` entry resolves to their repository. | **VERIFIED HERE**: `packages/pi-crawl4ai/package.json` declares `name: "pi-crawl4ai"` with no `private` and a publishable `files` list. **SOURCE-READ**: a later source-level review found a trusted-local `crwl` CLI wrapper with no manifest, retention, provenance or harness-neutral export — see [the extraction comparison](2026-10-21-research-trafilatura-and-extraction-comparison.md). | `pi install npm:pi-crawl4ai` installs a third party's code. Our README already steers to the Git install. The naming decision is still open, but the colliding package is not a functional substitute.

## 4. Ranked improvement options

Effort: S ≤ 1 day, M ≈ 2-4 days, L > 1 week. "Class" marks whether the change
alters what content reaches the model (Δtokens) or is metadata only.

### Tier 1 — client-only, additive, no server change

| # | Idea | Why it helps | Effort | Risk | Class |
| --- | --- | --- | --- | --- | --- |
| 1 | Populate `fit_markdown` by sending `markdown_generator` with `PruningContentFilterLXML`, behind an explicit flag that is not the existing default | Largest single per-page token reduction available; makes an existing documented default real instead of decorative | S | M–H: pruning can drop needed content; must report which source was used | ΔTokens |
| 2 | Truncation footer naming the exact next call, e.g. `[Showing 12,000 of 45,210 chars → crawl_read({path: "<exact>", mode: "window", offset: N})]` | Removes the top agent failure mode: a bounded preview leads to a re-crawl or a give-up. We print exact paths but do not close the loop | S | L | Metadata |
| 3 | Per-page quality field (`contentOk`/`quality: "low"` with reason and the raw-HTML reference) | Stops an SPA shell being treated as a successful read; matches our no-false-success posture | S | L | Metadata |
| 4 | Omitted-content accounting as numbers (`omittedChars`/`omittedSections`), keeping truncate-vs-reject explicitly distinct | Presentation limits become facts instead of prose the model must infer | S | L | Metadata |
| 5 | Local read filters on saved pages (`linesMatching`, `contextLines`, `caseSensitive`) | Zero-egress "where is X in this file" over disk we already wrote | S | L | ΔTokens |
| 6 | `range` envelope on previews and reads (`offset/limit/returned/total/truncated/hasNext/nextOffset`) | Makes "is there more?" a fact; lets a caller plan several reads in one turn | S–M | L | Metadata |

### Tier 2 — needs a deliberate design decision

| # | Idea | Why it helps | Effort | Risk | Class |
| --- | --- | --- | --- | --- | --- |
| 7 | Structured result envelope plus a declared schema, with one struct deriving both the serialized value and the advertised schema (plus a drift test) | Today consumers parse our prose; ideas 3, 4, 6 and 8 all need somewhere to live | M | L | Metadata |
| 8 | Real cache freshness: `check_cache_freshness`, persist `cache_status`/`head_fingerprint` per URL in the manifest, report "changed since last session" | Turns repeated crawls into cheap freshness checks; ship `unknown` first, never fabricate a verdict | S | M: needs the operator's pinned-egress proxy on ≥0.9.5 | ΔTokens |
| 9 | Ranked next-links: `score_links=True` gives per-link `intrinsic_score`/`contextual_score`/`total_score`; bounded `link_preview_config` adds titles for up to 100 candidates without crawling | Stops deep crawl being blind; better answers from a bounded budget | M | L | ΔTokens |
| 10 | llms.txt / `.md`-alternate resolution before rendering | Potentially the largest win for docs sites; upstream Crawl4AI has **no** llms.txt support at all (repo-wide search), so this is greenfield | M | L: many sites lack it; must degrade silently to a normal crawl | ΔTokens |
| 11 | Session-wide near-duplicate collapse (SimHash/MinHash over saved markdown) | Mirror/paginated/print pages are common in docs sites; upstream dedupes URLs only | M | L | ΔTokens |
| 12 | Chunk output mode: section-aware chunks with breadcrumb headers, token estimate, and the BM25 score we already compute | Reuses `bm25.ts`'s existing heading/section splitter; gives retrieval-ready units with no new dependency | M | L | ΔTokens |
| 13 | Expose `css_selector`, `target_elements`, `excluded_tags`, `only_text`, `word_count_threshold`, `remove_consent_popups`, `remove_overlay_elements` | All are allowlisted scalars; consent banners and nav are pure junk tokens. Note this reopens the CSS/XPath deferral in `packages/pi-crawl4ai/AGENTS.md` only for *cropping*, not for extraction schemas | S | L | ΔTokens |

### Tier 3 — reject or defer

- **`map` / inventory mode** (sitemap and robots.txt discovery). The most
  repeated pattern in the survey, but `SeedingConfig` is server-side only. Do not
  emulate it client-side; that would breach server-owned egress. Ask the operator
  for a bounded server-side capability instead.
- **Declared-token measurement** of our own tool schemas. Cheap and honest as
  documentation, but self-activating tools would contradict our stated rule that
  activation stays with `/tools` and presets.

## 5. Patterns to explicitly reject

1. CLI or binary shell-out as the tool implementation (`crawlberg`, `browserwright`, `donsetch`).
2. **Auto-downloading a prebuilt binary on first use** (`crawlberg`'s MCP launcher
   resolves PATH → npx → uvx → Homebrew → prebuilt download). Supply-chain hazard
   and a violation of our no-automatic-installation rule.
3. Client-side proxy parameters (our README promises egress credentials stay on the server).
4. Local headless-Chrome / TLS-fingerprint / WAF-bypass tiers — duplicates the remote
   renderer and moves anti-bot evasion into the client trust boundary.
5. In-memory page caches as the **primary** content store (fine as a derived read
   index; adopting it as the store re-introduces unrecoverable omitted content).
6. A supervised local daemon owning the cache and all fetches.
7. Interactive browser automation as core scope (keep it a separate opt-in package).
8. Hidden model calls inside the extraction path.
9. Keyless multi-provider fallback chains and provider sprawl.
10. Client-side SSRF guards as a substitute for server-side egress control — keep
    path containment for local reads, never as a reason to fetch locally.

## 6. Upstream reference notes worth keeping

**SOURCE-READ** from `crawl4ai/async_configs.py` at the stated commit. Since 0.9.0
the Docker server parses every request body with `Provenance.UNTRUSTED`, which
type-gates and field-gates config. No environment variable makes a body trusted.

- **Untrusted-forbidden fields (presence ⇒ HTTP 400):** `js_code`,
  `js_code_before_wait`, `c4a_script`, `deep_crawl_strategy`, `proxy_config`,
  `proxy_rotation_strategy`, `proxy_session_*`, `fallback_fetch_function`,
  `experimental`, `base_url`, `simulate_user`, `override_navigator`, `magic`,
  `process_in_browser`, `shared_data`, `session_id`; on `BrowserConfig`:
  `proxy`, `extra_args`, `user_data_dir`, `channel`, `cdp_url`, `storage_state`,
  `cookies`, `headers`, `init_scripts`, `browser_context_id`, `target_id`.
- **Operator opt-ins that widen specific gates:** `CRAWL4AI_ALLOW_DEEP_CRAWL`,
  `CRAWL4AI_EXECUTE_JS_ENABLED`, `CRAWL4AI_HOOKS_ENABLED`, `CRAWL4AI_MAX_TIMEOUT_MS`.
- **Reconciliation with our docs:** our README states stock upstream rejects
  untrusted deep strategies while the operator-managed discovery-services
  deployment supports bounded traversal. That is consistent with the above — the
  operator enables `CRAWL4AI_ALLOW_DEEP_CRAWL`. `js_code` has no equivalent
  opt-in for the `/crawl` body.
- **Clamps:** default max timeout 60,000 ms (so our `waitFor` ceiling is 60 s),
  max scroll steps 1,000, max delay 60 s, link-preview caps 100 links / 10 concurrency / 10 s.
- **Allowlisted classes of interest we do not use:** `PruningContentFilter`,
  `PruningContentFilterLXML`, `BM25ContentFilter`, `JsonCssExtractionStrategy`,
  `JsonXPathExtractionStrategy`, `JsonLxmlExtractionStrategy`,
  `RegexExtractionStrategy`, `DefaultMarkdownGenerator`, `DefaultTableExtraction`,
  `VirtualScrollConfig`, `LinkPreviewConfig`, `HTTPCrawlerConfig`,
  `PDFContentScrapingStrategy`, `RegexChunking` (class only — its `patterns` are refused).
- **Unused endpoints:** `POST /md` (`f=fit|raw|bm25|llm`), `POST /html`,
  `POST /screenshot`, `POST /pdf`, `GET /artifacts/{id}`,
  `POST /crawl/job` + `GET /crawl/job/{id}`, `POST /crawl/stream` (NDJSON),
  `POST /execute_js` (gated), `GET /ask`, and the MCP bridge.
- **Chunking:** only `RegexChunking` is sendable, with its patterns refused, so the
  default `["\n\n"]` split is the effective limit. All other upstream chunking
  strategies are untrusted-excluded.
- **llms.txt:** no support anywhere upstream (repo-wide search found no code
  reference). The spec (llmstxt.org v2) also defines `.md` alternates and
  `rel="alternate" type="text/markdown"`.
- **Extraction engines:** keep Trafilatura. No candidate beats it for
  article HTML→Markdown — alternatives are AGPL (`firecrawl`), very heavy
  (`docling`), network-dependent (`jina-ai/reader`), or document-oriented rather
  than web-article-oriented (`markitdown`, which is complementary if we ever
  route PDFs or Office documents). `newspaper3k` is superseded by `newspaper4k`.

## 7. Relationship to existing open work

`2026-10-21-bug-crawl-content-preservation-and-contract.md` already covers:
ordinary text without Python, source-view preservation and provenance, decoupling
`includeLinks` from the extractor, `allowJsCode` default-off, error classification
with stable codes, HTTP status/content-type metadata, explicit non-support for
PDFs, and match-centered reads of oversized sections.

Overlap with this document is intentional corroboration, not duplication:

- Idea 1 (`fit_markdown`) is related but distinct — that item makes raw markdown
  the default; this one is about actually producing fit markdown at all.
- Idea 2 partially overlaps `AC5` (match-centered windows with continuation
  information). `AC5` covers query reads of oversized sections; idea 2 concerns
  the ordinary preview footer.
- Idea 3 extends the "usable-content reporting" already planned there.

Everything else in Tier 1 and Tier 2 is new and unclaimed.

## 8. Open questions

1. **Deployed server reality.** Is `js_code` currently failing in production? Is
   `CRAWL4AI_ALLOW_DEEP_CRAWL` / `CRAWL4AI_EXECUTE_JS_ENABLED` / `CRAWL4AI_HOOKS_ENABLED`
   set? One live `jsCode` request and one `deepCrawl` request would settle what is
   currently SOURCE-READ but unobserved.
2. **`crawl_read` surface growth.** Ideas 5, 6 and 12 all add read behaviour to a
   tool that already has four modes. Prefer a single `filter` object over new modes?
3. **Page handles.** Short ids (`a1b2c3`) would lower model path errors but add
   indirection to an exact-path contract our README treats as a guarantee. If
   adopted: keep exact paths always printed, and make a bad handle a hard error.
4. **`fit_markdown` pruning risk.** Is an opt-in flag enough, or does the default
   need to change once the filtering behaviour is observed on real pages?
5. **Name collision.** Document as Git-only, rename, or publish under a scoped
   name? No decision taken. The candidate substitute has since been inspected
   ([comparison](2026-10-21-research-trafilatura-and-extraction-comparison.md)):
   a trusted-local `crwl` wrapper, so it answers quick page reading but not
   operator-owned egress, retained evidence, or the harness-neutral export.
6. **Token accounting.** Our caps are character-based; upstream has no token
   accounting in the crawl path. Not measured here; any "Δtokens" label in this
   document is mechanism-based, not benchmarked.

## 9. Sources

**Repository inspection** (cloned to `/tmp/crawl-research/`, nothing installed):

1. `github.com/xberg-io/crawlberg` @ `51645bb2ee16a40a1e0ca345c5294d5010fdbf5d` —
   `README.md`, `plugin/.opencode/plugins/crawlberg.js`,
   `crates/crawlberg/src/mcp/{params,outputs,tool_result,server}.rs`,
   `crates/crawlberg/src/tower/cache.rs`, `crates/crawlberg/src/api/router.rs`,
   `crates/crawlberg-cli/src/cli.rs`.
2. `github.com/mendableai/firecrawl-mcp-server` — `README.md`, `src/server.ts`.
3. `github.com/tavily-ai/tavily-mcp` — `src/index.ts`.
4. `github.com/exa-labs/exa-mcp-server` — `src/tools/*.ts`.
5. `github.com/sst/opencode` (blobless + sparse) — `packages/core/src/tool/plugin/webfetch.ts`,
   `websearch.ts`, `packages/core/src/tool/html-markdown.ts`.
6. `github.com/unclecode/crawl4ai` @ `30165f1` — `crawl4ai/__version__.py`, `CHANGELOG.md`,
   `async_configs.py`, `extraction_strategy.py`, `content_filter_strategy.py`,
   `chunking_strategy.py`, `markdown_generation_strategy.py`, `table_extraction.py`,
   `models.py`, `adaptive_crawler.py`, `cache_validator.py`, `async_url_seeder.py`,
   `deep_crawling/{filters,scorers}.py`, `async_crawler_strategy.py`,
   `deploy/docker/{server.py, api.py, schemas.py, job.py, config.yml, mcp_bridge.py}`.
7. Local read-only: `packages/pi-crawl4ai/{README.md,AGENTS.md,CONTEXT.md,package.json}`
   and `src/features/crawl/{crawlCore,saveOutput,presentation,bm25,http}.ts`.

**Registry and documentation pages:**

8. `https://pi.dev/packages/@xberg-io/opencode-crawlberg?name=crawl` and `https://pi.dev/packages?name={crawl,scrape,fetch}`.
9. `https://registry.npmjs.org/@xberg-io%2Fopencode-crawlberg`, and the registry READMEs for
   `pi-scraper`, `@pixu1980/pi-web`, `@danypops/pi-web-spider`, `pi-web-kit`,
   `pi-firecrawl-lite`, `donsetch`, `pi-crawl4ai`.
10. `https://docs.crawl4ai.com/` and `https://opencode.ai/docs/tools/`.
11. `https://llmstxt.org/` (spec v2) and `https://trafilatura.readthedocs.io/en/latest/evaluation.html`.
12. `https://api.github.com/repos/{adbar/trafilatura, buriy/python-readability, microsoft/markitdown, docling-project/docling, jina-ai/reader, firecrawl/firecrawl, apify/crawlee, codelucas/newspaper, unclecode/crawl4ai}`
    and `https://pypi.org/pypi/{trafilatura, readability-lxml, markitdown, docling, html2text, crawlee, chonkie}/json`.

**Not verified or unreachable:** `github.com/xberg-io/opencode-crawlberg` returns 404 by
design (the npm `repository` field points at `github.com/xberg-io/crawlberg`); `jina-ai/reader-lm`
returns 404 and a scoped search found no results; `pi-firecrawl-lite`'s published README has no
parameter reference, so its tool schema is INFERRED; `donsetch` internals are README claims only;
no live probe was made against the deployed Crawl4AI server.

## 10. Next step

Tier 1 items 1-6 are additive, client-only and independent of the open
content-preservation item. Idea 1 carries the only real behavioural risk and the
largest token payoff; open question 1 should be settled by a live probe before
treating the `js_code` and capability findings as observed rather than read.

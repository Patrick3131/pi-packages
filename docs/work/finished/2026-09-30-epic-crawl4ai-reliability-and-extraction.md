---
status: done
owner: engineering
last_reviewed: 2026-09-30
canonical_ref: packages/pi-crawl4ai/CONTEXT.md
---

# Crawl4AI: reliable crawling and simpler focused reading

## Type

Epic — three small delivery phases. Implement serially by default; no nine-lane architecture project.

## Problem

Our remote crawling and progressive reader are useful, but the earlier plan added too much machinery around them: adaptive budgets, artifact lifecycle contracts, capability profiles, structured extraction strategies, UI and multiple workflow surfaces. These are not prerequisites for reliable reading.

This revision replaces that plan and its acceptance criteria. It retains the concrete reliability fixes and Romek's useful extraction ideas, but explicitly defers speculative features. This is planning only; extension code is unchanged.

## Outcome

Keep our configured Crawl4AI server and server-managed egress. Save complete crawls by default, return concise file references, and read only what is needed. Fix deadlines, artifact collisions and stale reads; add BM25 and optional Trafilatura. Remove crawl-on/off and provide focused agents without adding another model/provider system.

## Scope

### Included

- Existing HTTP transport, auth and crawl/crawl_read tool names.
- Configured timeout/cancellation, honest errors, basic request/response checks and pacing fixes.
- File-first output, simple output caps, safe unique files, existing manifests/retention/read modes.
- Single-page structural BM25 filtering and shared query ranking for saved pages.
- Optional local Trafilatura on server-rendered HTML, without local browser installation.
- Removal of crawl-on/off; one on-demand status command; brief tool progress.
- Three optional least-privilege agents and package/docs updates.

### Deferred / excluded

- CSS/XPath and server LLM JSON extraction. An extract agent can use the active Pi model to interpret saved content; a separate extraction engine/provider is a future feature only if repeatable structured scraping is needed.
- Custom renderers, status footer, new prompt templates and a separate crawl-test command. Existing tool rendering, agents and an opt-in integration test suffice.
- outputSchema/structuredContent for codemode, new exposure modes/namespaces and generic adapter/plugin frameworks. Keep typed content/details; add programmatic output only when a consumer needs it.
- Manifest v2, migration machinery, artifact selector parameter, session pins/leases and transactional storage framework. Extend the existing manifest with a few optional fields.
- A full Markdown AST/parser, heading-ancestry reconstruction, or heuristic table/image supplementation from a second extractor. Preserve source and document extraction limitations instead.
- A server capability registry, version negotiation or separate browser test infrastructure. Record the tested service version when available and test the actual endpoint.
- New configurable resource budgets, token counting, benchmarking dashboard and client retry framework.
- Local Crawl4AI/browser/proxy setup, automatic Python installation, global agent symlinks or autonomous delegation.
- Unrelated repository/configuration changes.

## Implementation Notes

### 1. Review findings and why a cap still matters

The original plan had 11 acceptance criteria, 14 risk families and nine ownership slices. That was excessive for this extension. The proposed replacement has six acceptance criteria and three phases.

**We need output limits, not an adaptive budget subsystem.** BM25 reduces irrelevant text but does not cap size: a matching table or documentation section can still be huge. File-first crawl output also does not protect a later read from filling the model context. Use a few constants and the host truncation helpers, not token estimators or nested budget configuration.

File-first has a real tradeoff: a tiny page normally needs an extra read. Prefer predictability here, matching Romek's workflow; explicit inline mode remains for low-latency one-page requests. This deliberately replaces the earlier hybrid auto-size decision.

Previously inspected source findings remain implementation targets, not claims of new runtime verification:

- config.timeout is loaded but fetch does not enforce it.
- Zero remaining budget returns unlimited content; auto mode can lose per-page-overflow text without saving.
- Session timestamps have second precision; lossy URL filenames can collide.
- URL lookup is unsorted and explicit missing context can silently search other sessions.
- Heading splitting can treat fenced-code headings as document structure.
- Pacing queue identity cleanup and queued cancellation need correction; pacing is process-local, not server-wide.
- Live test can pass via plain HTTPS fallback, which is not browser/API proof.

Recorded earlier baseline on 2026-09-30: 11 suites / 150 tests and typecheck passed; the live case used HTTPS fallback. Recheck before implementation; do not recreate the already repaired TypeBox/Jest ESM problem.

Romek reference: https://github.com/romek-rozen/pi-crawl4ai at 0800955512c238986b70af6a49f9f11b562b5cfb (v0.3.2). Borrow file-first output, BM25 and optional Trafilatura, not the local crwl/browser transport. Retain MIT attribution if code is copied.

### 2. Small implementation boundary

```text
crawl → existing HTTP server → save source → optional Trafilatura → optional BM25
                                               ↓
                                  saved output + exact paths
                                               ↓
                                        crawl_read
```

Reuse current modules. Add only bm25.ts and trafilatura.ts (plus justified tests) initially. A small shared HTTP helper is acceptable if diagnostics and crawl genuinely duplicate auth/deadline handling; do not require separate validation, normalization, rendering and pipeline modules before writing working code.

Use native typed tool definitions instead of registration as-any casts. Validate external response shape at the boundary; no comprehensive new type taxonomy. Use ctx.cwd for relative files. The factory registers capabilities without network requests/subprocesses; tool execution works without terminal UI. No unsolicited stdout logs in machine-readable modes. Host imports remain peers, not bundled runtime copies.

### 3. Replace adaptive budgeting with file-first output

- Omitted save means save to the configured output directory, including small pages. Omitted/auto returnMode means compact file references/index, not adaptive size selection.
- save=true/custom directory saves; explicit inline mode returns a bounded preview while retaining complete files.
- save=false means no disk write and bounded inline output; warn if content was omitted. save=false with explicit returnMode=files fails before network activity.
- Keep returnMode and existing maxCharsPerPage/maxCharsPerCall inputs as compatibility controls, not the recommended API. Honor explicit positive limits as smaller preview caps, bounded by the host hard limit; do not add new env knobs or a new budget object. Existing JSON/env values remain accepted for explicit inline previews. No source data is truncated before saving.
- Default explicit-inline body cap: 12,000 characters total per call. Default crawl_read cap: existing 6,000 characters. Final result also uses Pi's byte/line truncation limit. Larger caller overrides may not exceed the host hard limit; zero remaining space means zero content, never unlimited.
- Reserve space for a short omission notice and exact saved path. Default page index lists at most 20 entries, then points to the complete manifest. This is presentation truncation, not a maximum crawl-page count.
- Keep existing read modes and maxChars; no artifact selector. Exact printed paths work directly; outline-first is optional, not prescribed ceremony.

This is an intentional behavior change: small crawls now persist by default and auto returns paths. Document it plainly. Existing save=false remains the opt-out. Do not silently ignore explicit legacy controls or retain the old adaptive branch alongside the new policy.

### 4. Reliability without a new transport platform

- Enforce the configured deadline through queued pacing, fetch and response-body reading. Compose caller cancellation with the deadline; check pre-abort and clean timers/listeners. Trafilatura uses the same remaining deadline. Do not add another per-call timeout parameter now.
- Preserve server URL/bearer auth; normalize trailing slash and never send proxy settings. No automatic crawl POST retries, since JS or timed-out remote work may have effects.
- Validate HTTP(S) target URLs, positive finite numeric settings, single seed for deep crawl, response envelope/results and supported filter combinations. Bound HTTP response bytes with one internal safety ceiling (initially 20 MiB), not a configurable resource-policy system.
- Use abortable queue waiting and fix identity cleanup. Keep existing pacing settings and describe them as per-process. Cross-process/deep-crawl pacing belongs on the server.
- Total page failure is a real tool error; mixed success explicitly reports partial results. Empty page content is a warning; empty BM25 selection is a valid result. Bound/redact error previews and never expose bearer tokens.
- Verify waitFor, cache, depth and include/exclude/domain filter behavior against the actual service. Preserve public seed-only maxDepth=1 by translating upstream depth if needed. A successful health GET alone is not proof of these semantics. Unsupported API settings error clearly, without a capability registry.
- HTTP cancellation does not guarantee server-side browser cancellation; document that limitation.

### 5. Minimal durable artifacts

Keep current output directory, pages[].file, manifest, outlines/meta and retention policy. New manifest fields are optional and additive: sourceFile for pre-filter Markdown, rawHtmlFile when Trafilatura is used, and filter/extractor options when relevant. pages[].file remains the requested primary output. Old manifests need no rewrite; omitted fields mean ordinary saved page.

Use mkdtemp/exclusive unique session allocation and a bounded URL slug with full-URL hash. This handles parallel calls/processes without a lock/lease system. Write page files first and publish the manifest last via atomic rename; retention only sees complete sessions. Do not add source archives for every ordinary crawl: preserve predecessor/raw HTML when lossy filtering/extraction actually needs recovery.

Never truncate saved bodies. Prevent generated/manifest paths escaping their session, including symlinks; do not claim the whole tool is a security sandbox. Keep explicit custom output sessions supported. Clean only owned completed sessions, exclude the session being returned from that cleanup pass, and treat size cap as soft when that session alone is oversized. Existing retention can expire it later; no permanent pinning guarantee.

URL-only reads select newest completed default-root session; explicit session/manifest context errors if absent or wrong, without global fallback. Report chosen path/time. No whole-filesystem search or artifact lifecycle API.

### 6. BM25: one small shared implementation

Add bm25Query and bm25Threshold (default 1.0, finite >=0, requires nonblank query) to crawl. Initial crawl-time support is one URL, Markdown/text, no deep crawl. Save source and filtered output; return paths, query and matched-section count. A high threshold may produce a legitimate empty file with an original reference.

Use Okapi BM25 (k1=1.5, b=0.75) and deterministic Unicode-aware tokenization. Start with heading-bounded sections, plus paragraph chunks for headingless documents. Track code fences so code headings are ignored; do not split tables/code blocks mid-block. Preserve selected sections in source order, including their existing headings/links/tables. Do not build a full Markdown AST or repair every cross-section reference; original content remains available.

Reuse BM25 scoring for crawl_read query ranking, selecting positive matches until the reading cap. No second public read-threshold parameter. For oversized sections, an explicitly labelled excerpt plus source line range/path is acceptable; users can request window/full. Saved filtered artifacts remain complete. Query ranking and output truncation are separate, small functions.

### 7. Optional Trafilatura, deliberately modest

Add extractor=trafilatura and text format (text initially requires this extractor). Use one configured local Python executable (trafilatura.pythonPath / CRAWL4AI_TRAFILATURA_PYTHON) with a documented supported installation/version. Only the existing server fetches/renders URLs; local Python receives HTML on stdin, no network fetching, shell interpolation or automatic installation.

Use Trafilatura's native formatting/tables enabled by default and includeLinks optional/default false. Defer image controls, multiple formatting toggles and table/image reconstruction heuristics. If native extraction loses relevant structure, report the limitation and read preserved HTML/Markdown instead of merging content heuristically.

Persist raw HTML before extraction; missing dependency/failure gives actionable setup and original references, never a silent fallback. Check pre-abort, bound stdout/stderr, terminate on cancel/deadline and force-kill after short grace. Clear timers/listeners; cleanup is idempotent. These subprocess safeguards are necessary, not optional complexity.

### 8. Activation, diagnostics and agents

Delete crawl-on/off and their helper/tests. No aliases or lifecycle active-set changes; /tools, presets and explicit CLI/child allowlists remain authoritative. Keep crawl-sessions/cleanup. Add only crawl-status: on-demand service health and optional extractor availability, auth-aware and bounded, no activation or network-on-load. Use ordinary tool rendering and brief onUpdate stages, no new custom UI.

Bundle namespaced agents (package: crawl4ai; names scrape/crawl/extract), inherit current model, no bash or subagent permissions:

- scrape: crawl/crawl_read; read one page, optionally clean/filter, report source and limits.
- crawl: crawl/crawl_read; bounded BFS/DFS/best-first and cross-page source-backed summary.
- extract: crawl/crawl_read; use the active agent model to report requested structured facts from saved content, missing values explicit. This is model interpretation, not promised deterministic CSS/XPath extraction or schema validation.

Agents are instructions, not a new engine. No hidden model calls or auto-delegation. Declare pi.subagents.agents in root Git and standalone manifests (the installed discovery contract), include resources in package files. Basic tools work without pi-subagents or Python; missing child provider yields guidance, not shell fallback. Defer separate prompts: ordinary tool use already works, and agents cover specialization.

### 9. Three delivery phases

1. Reliability + file-first policy + activation removal. Ship independently after regression/real-server checks.
2. Shared BM25 + optional agents. Validate query/no-match recovery and package discovery.
3. Optional Trafilatura. Add only after phase 2 works; benchmark a few representative pages for useful cleanup, not a universal token-reduction target.

All three phases are included in this package; deferred features above are not completion gates. Record actual service evidence, basic interactive/headless and child-provider checks, scoped diffs and migration docs. No speculative all-mode compatibility certification or release dashboard.

## Files

Verified existing paths to reuse/update:

- packages/pi-crawl4ai/src/index.ts and index.test.ts — delete activation commands, add minimal status.
- packages/pi-crawl4ai/src/features/crawl/{crawlTool,crawlReadTool,tokenBudget,saveOutput,outline,cleanup,requestPacing,types}.ts and existing colocated tests — targeted policy/reliability/filter changes.
- packages/pi-crawl4ai/src/config/{loader,runtime,types}.ts and src/config.test.ts / src/configLoader.test.ts — validate existing settings and one Python path.
- packages/pi-crawl4ai/src/features/crawl/liveCrawl.integration.test.ts — opt-in genuine API proof, no browser-success fallback.
- packages/pi-crawl4ai/{package.json,README.md,AGENTS.md,CONTEXT.md,.env.example} — resources/setup/migration.
- package.json and README.md — root Git agent discovery and overview.

Proposed new paths: packages/pi-crawl4ai/src/features/crawl/{bm25,trafilatura}.ts and justified tests; packages/pi-crawl4ai/agents/{scrape,crawl,extract}.md. Add a small HTTP helper only if reuse warrants it. Preserve working ESM test configuration; no mandatory toolchain rewrite.

## Acceptance Criteria

- [x] AC1: Existing remote service/auth/egress remain; configured deadline/cancel and queue cleanup work; malformed responses and total failures are real errors; actual wait/depth/filter/cache behavior is verified without HTTPS fallback.
- [x] AC2: Default crawl saves complete bodies and returns bounded references; explicit inline/no-save behavior follows the documented policy; host/read caps hold with zero remaining space; sources are recoverable unless explicitly unsaved.
- [x] AC3: Concurrent sessions/distinct URLs do not overwrite; manifest publishes last; old sessions/custom outputs still read; newest and strict-context lookup work; cleanup never immediately deletes returned or escaped/unrelated files.
- [x] AC4: Single-page BM25 and saved-page queries use shared ranking, preserve saved section structure/order, record query/counts and valid no-match output, and retain original references; incompatible requests fail preflight.
- [x] AC5: Optional Trafilatura uses rendered HTML stdin only, preserves source, supports Markdown/text and native tables/formatting/optional links, handles missing dependency and process cleanup; basic crawling needs no Python.
- [x] AC6: crawl-on/off are gone; external activation survives reload/child allowlists; status is on-demand; three optional agents discover correctly; typed/mode-safe tools, tests/build and clear migration/setup docs pass with unrelated changes preserved.

## Validation

See companion test plan for the 2026-09-30 implementation evidence. All three phases are implemented; root regressions, 213 package tests, typecheck/build, resource discovery, interactive/headless Pi, an authorized scrape child and native Trafilatura checks passed. Independent review found and verified fixes for indented-code splitting and text sidecar lookup; no remaining code findings were reported.

**COMPLETE — AC1 production proof obtained on 2026-09-30.** The operator approved a narrow discovery-services capability rather than disabling upstream security. Source commit `52d583da93ee51670507fc4e7d10fb277eab3f35` was published; production deployment commit `0b81e4a` changed only the Crawl4AI image pin to digest `sha256:185df5dae5091775c4345ef037e252b89ccfdf60815b5a7bfc1fb6a4c93319bd`. Dokploy deployment `03Gn75um_sBzWK6I6cSmF` completed; Crawl4AI is healthy and the other services were not recreated. All three genuine Pi live cases now pass: rendered delay, typed cache, and actual seed-depth/maxPages/include/exclude/domain traversal. Unauthenticated access is 401, loopback/metadata probes are 400, HTTP/HTTPS IP echoes show operator ISP egress, private-only bindings/public-port closure remain, and recent logs contain no API/proxy credentials. No HTTPS fallback, local browser replacement or broad trusted deserialization was used. The final independent audit found no remaining behavioral gate across AC1–AC6. Earlier HTTP 400 evidence remains historical, not an unresolved blocker.

## Open Questions

None. All six criteria are verified, including operator-approved production traversal. File-first behavior and deferred scope remain unchanged.

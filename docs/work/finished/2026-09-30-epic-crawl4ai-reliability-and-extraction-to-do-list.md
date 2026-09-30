---
status: done
owner: engineering
last_reviewed: 2026-09-30
canonical_ref: packages/pi-crawl4ai/CONTEXT.md
---

# Crawl4AI simplified implementation To-Do

Contract: [spec](2026-09-30-epic-crawl4ai-reliability-and-extraction.md). Evidence: [tests](2026-09-30-epic-crawl4ai-reliability-and-extraction-test.md).

## Slices

Implement serially by default. Optional parallel work has three exclusive owners, not nine lanes. Paths below are relative to packages/pi-crawl4ai except explicit root paths. Tests follow their production owner; new paths are proposed, not existing.

| Slice | Owns (paths) | Depends on |
| ----- | ------------ | ---------- |
| Core — reliability/output/integration | src/index.ts and index.test.ts; src/config/**; src/config.ts; src/configLoader.ts; src/config.test.ts; src/configLoader.test.ts; src/features/crawl/crawlTool.ts, crawlReadTool.ts, tokenBudget.ts, saveOutput.ts, cleanup.ts, requestPacing.ts, types.ts and their tests; liveCrawl.integration.test.ts; optional HTTP helper | Filter/extractor modules only for their final wiring |
| Filters — pure ranking and optional Python wrapper | src/features/crawl/outline.ts and outline.test.ts; new bm25.ts/trafilatura.ts and their tests | - |
| Resources — agents/docs/manifests | agents/**; package.json; README.md; AGENTS.md; CONTEXT.md; .env.example; root package.json and README.md; this three-file work package | Core/Filters only to validate final documented behavior |

Core phase 1 can ship before filters; filter modules may be developed independently against the spec. One Core owner integrates them and handles public schema/config edits. Resource drafting can proceed independently, but final docs/package smoke wait for working tools. No subagents are launched or required by this table.

## Tasks

### Phase 1 — dependable file-first crawling (AC1–AC3, AC6)

- [x] Refresh baseline/diff and preserve existing uncommitted host/ESM changes; do not redo fixed toolchain work.
- [x] Enforce configured deadline across pacing/fetch/body, fix queued abort and identity cleanup, validate basic inputs/response envelope and surface partial/total failures. Keep bearer auth, server egress and no automatic POST retries.
- [x] Replace adaptive auto-return logic with default complete saves and compact references. Keep explicit inline/save=false and legacy smaller caps; final output/read safety limits remain constants plus existing host truncation helpers.
- [x] Fix zero/exhausted output handling; reserve artifact footer; cap index listing at 20 while retaining complete manifest. Never truncate before saving.
- [x] Add unique session allocation and full-URL hashed filenames; publish manifest last; retain existing shape with optional source/filter fields instead of a versioned storage redesign.
- [x] Fix newest-first URL reads, strict explicit context and ctx.cwd handling; enforce artifact path containment and protect the newly returned session from current cleanup.
- [x] Remove crawl-on/off registrations/helper/obsolete tests; preserve external tools/preset/CLI control. Add only on-demand crawl-status and short onUpdate stages, no custom rendering or startup network/log noise.
- [x] Use native typed tool definitions; extend existing tests for named regressions and verify actual service wait/cache/depth/filter behavior before shipping phase 1.

### Phase 2 — focused reading and agents (AC4, AC6)

- [x] Add one shared BM25 scorer with fence-aware sections, paragraph fallback, intact table/code blocks and source-order output; no full Markdown parser or reference-reconstruction machinery.
- [x] Expose bm25Query/bm25Threshold for single-page crawl; save original + filtered file and no-match statistics. Reuse scoring for crawl_read queries without a second read threshold API.
- [x] Add namespaced scrape/crawl/extract agents with inherited model and crawl/crawl_read only. Extract uses normal model interpretation, not a new remote provider/schema engine.
- [x] Add pi.subagents.agents to root Git and standalone package manifests and include resource files. Do not add prompts/installers/symlinks/automatic delegation.
- [x] Verify matching/no-match recovery, package discovery and explicitly requested child tool/provider loading.

### Phase 3 — optional native Trafilatura cleanup (AC5)

- [x] Add one explicit Python path setting and optional extractor/text mode; remote server still fetches/renders, local process only receives HTML stdin.
- [x] Use native formatting/tables and optional links; preserve raw HTML, document losses instead of heuristic supplementation or an option explosion.
- [x] Bound IO and remaining deadline, pre-abort without spawn, terminate/force-kill and clean listeners/timers idempotently. Missing dependency errors retain original reference, no silent fallback or install.
- [x] Verify actual configured Python extraction on representative pages and shared BM25 composition; record quality limits, not guaranteed percentage savings.

## Validation

- [x] AC1: deadline/cancel/auth/error regressions and genuine API wait/depth/filter/cache evidence.
- [x] AC2: default complete save, inline/no-save/legacy cap boundaries and reserved references.
- [x] AC3: unique atomic artifacts, legacy/newest/strict-context reads, containment and retention safety.
- [x] AC4: shared BM25, structural order, empty result and original recovery.
- [x] AC5: native extractor behavior, missing dependency, actual child cleanup and source preservation.
- [x] AC6: activation removal, status, optional agents, typed tests/build and interactive/headless/package smoke.

## Docs

- [x] Document new file-first default, no-save/inline escape hatches, unchanged remote egress, simple limits and legacy settings compatibility.
- [x] Document optional Python setup, extraction limitations, agent tool/provider discovery and ordinary /tools/preset use.
- [x] State that JSON engines, prompts, custom UI and programmatic output contracts are deferred, not required completion work. Retain source/license attribution if code is reused.

## Implementation evidence — 2026-09-30

All implementation slices and two independent-review fixes are delivered. Review confirmed the indented-code and `.txt` sidecar corrections with no remaining code findings. Root `npm run test` passed, including 213 crawl tests (three opt-in live cases skipped), tools/presets and restore-config regressions. Crawl typecheck/build and five actual SDK/resource-discovery checks passed. Interactive tools/preset/reload/status, print/JSON execution, native Trafilatura composition/source recovery and a strict scrape child with parent crawling inactive were observed; details are in the companion test plan.

**Resolved on 2026-09-30:** operator-approved discovery-services source `52d583da` implements narrowly bounded nonstream deep construction while leaving ordinary UNTRUSTED/SSRF/egress protections intact. Production pin `0b81e4a` rolled out the immutable reviewed image; all three strict Pi live cases passed, including real traversal/filter/page/depth semantics. Independent final audit found no remaining behavioral gate. Production auth/private-target/HTTP+HTTPS ISP egress/bindings/log checks also passed. The earlier HTTP 400 was reproduced before the change and is retained as historical evidence in the test plan.

## Completion

- [x] Six acceptance criteria verified with actual evidence; no implicit addition of deferred scope.
- [x] Test plan updated with commands/results and missing gates resolved, not replaced with fallback claims.
- [x] Scoped diff excludes unrelated work; all three docs set to done and moved together to configured finished directory only after implementation. Current state is done; the verified three-file package is in the finished directory.

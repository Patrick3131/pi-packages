---
status: done
owner: engineering
last_reviewed: 2026-10-22
canonical_ref: none
---

# Reliable crawl contracts and preserved page evidence Test Plan

Primary: [work item](2026-10-21-bug-crawl-content-preservation-and-contract.md). Execution: [to-do list](2026-10-21-bug-crawl-content-preservation-and-contract-to-do-list.md).

## Coverage Decision

Automated coverage required.

Reason: production regressions caused dropped source evidence, repeated invalid calls and misleading recovery advice. Use existing package tests with mocked acquisition and real temporary artifact I/O. Planning changes documentation only; the tests described below are for implementation and have not been run for these fixes.

Prefer updating existing cases. Budget at most three new top-level cases (roster/source preservation, late-match recovery, document routing); extend existing parameterized validation, configuration, HTTP-error and artifact cases for the other branches. Any additional case must name a distinct uncovered risk before admission. Do not reproduce one defect in both pure and adapter suites.

## Risk Coverage

| Material failure risk | Existing coverage | Cheapest stable proof | Planned change |
|---|---|---|---|
| Valid text/link requests fail or legacy JavaScript is misrepresented as supported | `crawlTool.test.ts` validation/serialization cases; `src/config.test.ts`, `src/config/loader.test.ts` | Existing mocked-fetch boundary | Update current invalid combinations, prove text without Python and save:false, and ensure default descriptors and legacy rejection agree without a nonfunctional allow switch. |
| A security refusal gets unrelated advice or exposes credentials | `crawlTool.test.ts` HTTP/deep-refusal/redaction cases | Existing shared HTTP path through mocked acquisition | Add js_code/actual-deep/unknown-refusal variants to existing cases; preserve abort/body-limit semantics and no retry. |
| Optional extraction/filtering loses the only usable page evidence | `crawlTool.test.ts` extraction/BM25 integration; `saveOutput.test.ts` original/provenance cases | Mock service response plus real temporary files | Add one compact card/list regression and extend existing provenance/legacy cases. Test requested-view and original-view separation without requiring Python for broad text. |
| Search returns unrelated document prefixes instead of a late evidence match | `outline.test.ts` section selection/excerpt bounds; `crawlReadTool.test.ts` progressive reads | Pure chunk selection at its owner | Add one minified late-match/continuation case; retain existing Markdown/code/table block coverage. |
| Error pages or unsupported documents are represented as usable page evidence | `crawlTool.test.ts` mixed/empty/status fixtures; `presentation.test.ts`, `saveOutput.test.ts` detail/manifest cases | Existing response boundary plus artifact round-trip | Extend status/content-type cases; add one routing matrix for query-bearing PDF, unexpected PDF response type and ordinary textual resources. |
| Shared consumers receive a different or unbuildable contract | Existing shared core/export layout and package scripts | Typecheck/build plus small built-export smoke | No duplicate behavior suite: invoke built research exports with a mocked service response and inspect public descriptor/defaults. |

## Automated Cases

1. **Broad page evidence** (`AC1`, `AC2`): a synthetic rendered HTML page has nine creator cards with names, handles, links and a small factual roster list. Ordinary text without Python retains all nine, including in complete saved files under small previews. Explicit optional article extraction may omit cards, but the separately referenced original HTML/Markdown stays complete and readable. Keep raw fixture data synthetic; names/counts demonstrate a regression rather than freeze production copy. Reuse the existing extractor fixture/mock seam; do not introduce a second article-extraction engine.
2. **Late matches** (`AC5`): an approximately 87k-character minified document contains relevant tokens well after character 40k and multiple matches. A bounded query returns actual nearby evidence and honest positions; the next continuation returns further evidence without omission loops or invented complete JSON. Keep the existing no-query/Markdown behavior tests as the owner of their unchanged contracts.
3. **Document routing** (`AC6`): a query-bearing .pdf request gives unsupported_document before HTML extraction/Python; a PDF response with an opaque URL is classified after the service response. Ordinary text/JSON/XML requires no Trafilatura and preserves a textual payload only when supplied by the service; missing original data is not fabricated. A mixed batch retains supported page results with an explicit unconfigured-document reason, not a false whole-batch success. Full PDF extraction is a required acceptance case in the linked capability package.

Extend rather than duplicate existing cases for the remaining criteria: legacy JavaScript rejection and supported deep traversal, field-specific refusal advice, credentials/redaction, includeLinks, BM25 constraints, non-2xx/empty results, legacy/additive manifests and source selection. If an existing case already proves a requirement, retain it and record that evidence rather than adding another.

## Browser Or Manual Verification

| Step | Expected result |
|---|---|
| Inspect shared default descriptors and ordinary text behavior from the built research export with an injected fixture response. | Default crawl JavaScript absent, supported interaction deferred to the linked package, no Coding Agent/TUI runtime imports, no Python needed for basic text. |
| Compare synthetic roster extraction and late-match recovery before/after the change. | RED reproduces dropped/inaccessible evidence where practical; GREEN retrieves names, handles and original references within the existing caps. |
| Optional read-only comparison with previously acquired public-page artifacts, if an operator supplies them. | Source evidence can be recovered without new crawls, provider charges or canonical business writes; record provenance and limitations. This is supplementary, not a dependency of readiness. |
| If later authorized, genuine configured-service smoke of ordinary text/deep traversal and known unsupported JavaScript. | Actual server behavior matches the chosen descriptor; no relaxed security, direct-HTTPS substitution or claim that mocked transport proves deployment compatibility. |
| Inspect migration notes and package dry-run. | Consumers know that defaults changed and how original-view metadata is adopted; legacy files remain readable and required resources ship. |

No browser or dev server is needed for deterministic acceptance. Close any temporary runtime started for an explicitly authorized live check.

## Commands

Run from `/Users/patrick/Development/pi-packages`. These scripts were verified in the root/package manifests while planning.

```sh
npm run test --workspace=packages/pi-crawl4ai
npm run typecheck --workspace=packages/pi-crawl4ai
npm run build --workspace=packages/pi-crawl4ai
npm run build:research
npm pack --dry-run --workspace=packages/pi-crawl4ai
npm pack --dry-run
git diff --check
```

The package test script already runs Jest serially. After the research build, use a small disposable Node import of `dist/research.mjs` with injected/mocked acquisition to verify export usability; record the exact smoke command at implementation time. Do not invent a permanent test framework or run unrelated full-repo suites without a dependency/change justification. If configuration/agent-resource changes touch restore/discovery behavior, run the relevant existing checks and record why they became necessary.

Structured-output validation: extend existing details/manifest/read cases for the shared schema, original/view identity, HTTP/cache unknowns and nextCall revision/range accounting. Do not add schema-source-text comparisons; validate actual returned values against the exported schema. Metadata-derived counts must exclude unread/omitted ranges honestly.

## Acceptance Evidence

| Check | Result | Evidence |
|---|---|---|
| Planning placement, templates and applicable policy | passed | Root/package/work-folder AGENTS/CONTEXT and installed task-and-plan-routing templates read on 2026-10-21; no PI_WORK_* overrides present. |
| Current implementation/test owner inspection | passed | Source and existing cases listed in primary Implementation Notes and Risk Coverage inspected; prior production audit reused explicitly. |
| Regression coverage (`AC1`–`AC6`) | passed locally | Nine-card broad text/original artifacts, PDF/textual routing and minified UTF-16 continuation added; existing cases updated for raw defaults, refusal classification and source provenance. No fresh pre-fix RED run was captured; historical reproductions are the stated motivation. Scoped 4 suites / 133 tests passed on 2026-10-21. |
| Package typecheck/build and research build (`AC7`) | passed locally | Package typecheck, build and root research build passed. Full baseline suites passed; concurrent feature capability cases are validated by the next work package. Export smoke verifies mocked acquisition and real temporary artifact reads against exported schemas; final combined npm test/typecheck gates and package build passed after review. |
| Packaging and scoped diff | passed locally | Workspace and root npm pack --dry-run completed; git diff --check clean. Independent Astra medium review passed after corrections; final full toolkit npm test/typecheck and package build passed. |
| Live service / Melon Labs adoption | not run | Outside this planning request and not implied by local checks. |

## Explicitly Not Testing

- Exact documentation/error prose, source-code layout, ordinary rendering snapshots, coverage percentages or compiler-enforced type passthrough.
- Duplicate copies of deadlines, cancellation, response caps, symlink containment, parser/library internals or Python process lifecycle already covered by their owning tests.
- Creator persistence, agency classification, Backend authorization/receipts, final assignment status or downstream interpretation of article evidence; these belong to Melon Labs follow-up work.
- Paid/live research, PDF parsing (covered by the linked capability package), OCR, index performance, Code Mode, browser automation, subagents, publication/deployment or changes to the server's untrusted policy.
- Generic keyword classifiers that claim any page containing login text is unusable.
- Reimplementation of Melon Labs' already-fixed corrective-message retention or reconstruction of historical tool_failed records; keep that consumer's existing coverage at its own boundary.

## Open Questions

None

## Implementation evidence (2026-10-21)

Commands executed: package Jest (full baseline owners, then `--runTestsByPath src/features/crawl/crawlReadTool.test.ts src/features/crawl/crawlTool.test.ts src/features/crawl/presentation.test.ts src/features/crawl/saveOutput.test.ts --silent`, 4 suites / 133 tests), package typecheck/build, `npm run build:research`, workspace/root `npm pack --dry-run`, and `git diff --check`.

A disposable `node --input-type=module` smoke imports `executeCrawl`, `executeCrawlRead`, `CrawlEvidenceSchema` and `ReadEvidenceSchema` from `dist/research.mjs`; uses `options.acquire` with one synthetic HTML fixture; saves to an OS temporary directory; validates both returned envelopes with `Value.Check`; reads the saved text and deletes its temporary directory. This exercises the production bundle without public-site/network fallback. Actual service/deployment acceptance belongs to the next capability package. No production session was replayed.

## Independent implementation review corrections (2026-10-21)

Astra medium identified six material gaps. Corrections now account delivery from the final host-capped rendered source prefix, display HTTP/usability failures consistently, center oversized headingless multiline queries and require a complete match or explicit insufficient_budget, retain exact repeated-line window positions, atomically publish manifests only after final delivery metadata, and reject known PDFs before unsupported service acquisition while keeping mixed supported pages. Existing regression cases were extended for these distinct failures; scoped five suites / 136 tests passed. Package typecheck passed. The subsequent full run passed 13 suites and 225 tests but its existing TERM-resistant Python-child fixture failed to start within its startup window; this result is recorded as a failed full gate, pending rerun, rather than a green suite. A fresh Astra medium follow-up subsequently approved all corrections. The final package rerun passed 227 tests (three opt-in cases skipped); full toolkit npm test/typecheck and package/research builds passed, clearing the earlier fixture failure.

## Cache timestamp correction (2026-10-22)

Final contract audit found upstream `cached_at` was omitted while cache status survived. Release 0.1.5 preserves it as optional normalized `cachedAt`, independently of acquisition time; absent/invalid values remain null. The authentic service fixture now verifies result → manifest → crawl_read retention. Independent Astra medium review approved the additive contract. Package tests passed (227 tests, three opt-in skips), package typecheck and research build passed. Release 0.1.4 remains immutable.

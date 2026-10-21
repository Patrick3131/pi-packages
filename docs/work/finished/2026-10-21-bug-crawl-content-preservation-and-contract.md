---
status: in-progress
owner: engineering
last_reviewed: 2026-10-21
canonical_ref: none
---

# Reliable crawl contracts and preserved page evidence

## Type

bug

## Problem

The shared crawl tool couples ordinary text output to optional article extraction, exposes options that the configured service may reject, and can omit relevant content while reporting a successful crawl. Its recovery reader can return the beginning of a large matching HTML section instead of the actual matching text. These failures affect both Coding Agent sessions and consumers of `@patrick3131/pi-packages/research`.

Reused investigation evidence from the preceding production audit on 2026-10-21, not a fresh production audit during planning:

- Seven retained Melon Labs assignments made 127 crawl calls with 42 recorded failures, and 101 crawl reads with one failure. Twenty-eight historical errors retained only `tool_failed`; their causes cannot be reconstructed conclusively. Their arguments violate the current contract: 14 ordinary text requests, 13 includeLinks requests without an extractor, and one multi-seed deep request.
- Two JavaScript requests were rejected as untrusted `js_code`, then received incorrect deep-crawl advice. The inspected service reported 0.9.5; the deployed 0.1.3 research bundle matched both local bundles by SHA-256 at audit time. This is historical evidence, not a version pin for future implementation.
- 100Media's saved homepage HTML contained nine roster cards. Trafilatura retained the roster heading but dropped the cards; its Press-page extraction dropped an explicit roster list. Raw-HTML recovery returned an early section under a 20,000-character budget, before names around characters 44,000–53,000.
- The separately supplied PDF example failed locally on `format:"text"`; it did not test PDF acquisition. No PDF was requested in the seven audited production assignments.

## Outcome

Callers can request ordinary text without Python, receive actionable capability/input errors, retain broad source evidence independently of optional extraction/filtering, and recover matches from large saved documents. Acquisition success and content limitations are distinguishable. The same contract is available through the Coding Agent adapter and the harness-neutral research export.

## Scope

### Included

- Public crawl/read descriptors, shared execution/read cores, configuration and harness-neutral exports.
- Ordinary text rendering; explicit optional Trafilatura with preserved originals; raw versus fit Markdown defaults.
- Honest default descriptors and actionable rejection of the legacy jsCode-on-/crawl path. Working interactive access, structured selection and PDF acquisition are owned by the linked capability package, not disabled as a final product decision.
- Field-specific bounded errors, content-type/status metadata, explicit unsupported-document handling, and targeted artifact reading.
- Existing package guidance, configuration documentation, release/consumer migration notes and proportional regression coverage.

### Excluded

- Melon Labs code, database writes, assignment replays, Backend evidence validation, agency-fit decisions and creator saves.
- Code Mode, FFF indexing, browser automation, subagent orchestration, automatic retries, provider switching or new execution budgets.
- PDF parsing and browser interaction implementations, owned by the linked capability package; OCR, client-side proxy/egress, globally relaxed untrusted/SSRF policies and automatic installation remain excluded.
- Publishing, version bumps, commits, remote installation/sync and production deployment. Build/pack validation is included; release requires a separate instruction.

## Implementation Notes

### Newly checked repository evidence

- `packages/pi-crawl4ai/src/features/crawl/crawlCore.ts`: `validateParams` requires Trafilatura for text and includeLinks, and requires saving for extraction. Optional extraction overwrites `result.markdown`; BM25 follows extraction. Raw HTML is retained for Trafilatura but the service's original Markdown is not retained in parallel.
- `crawlToolDefinition.ts` in the same directory: one flat public schema exposes text, jsCode, includeLinks, extractor and filtering combinations. `crawlTool.ts` spreads this descriptor into Coding Agent registration. `src/research.ts` exports the descriptor/core to other hosts.
- `http.ts`: the HTTP-error matcher classifies any `untrusted request` as a deep-strategy rejection. Existing transport formatting already bounds/redacts immediate connection causes; retain that work.
- Already implemented in the Melon Labs consumer: `apps/agents/src/adapters/pi-durable/safe-failure.ts` preserves ordinary corrective messages with targeted credential redaction through `normalizeToolFailure`; `host.ts` uses that normalizer. The 28 historical `tool_failed` records predate that fix and are not evidence of an outstanding message-retention defect. Do not reimplement the consumer fix here or attempt to reconstruct discarded historical causes.
- `outline.ts`: oversized first matching sections are sliced from their start. `crawlReadCore.ts` ranks heading/paragraph sections and then applies delivery caps. This is unsuitable for one-line/minified HTML matches late in a section.
- `presentation.ts`: result details retain statusCode, but displayed `[ok]` primarily follows service success. `saveOutput.ts` manifests retain success/title/count but not HTTP status or content type.
- `config/types.ts`, `loader.ts`, `runtime.ts`: optional Python configuration is separate from ordinary acquisition. `package.json` has no runtime dependencies; parser support must be a declared dependency if added, not an accidental transitive import.
- Existing tests already cover file-first persistence, complete saved bodies, BM25 originals, optional extractor process handling, HTTP redaction, body/deadline limits, exact artifact lookup and symlink containment. Extend those owners rather than duplicating their risks.

Related completed work: [crawl reliability and extraction](../finished/2026-09-30-epic-crawl4ai-reliability-and-extraction.md) and [connection diagnostics](../finished/2026-10-01-bug-crawl-connection-errors.md). This package deliberately revises their text/extractor coupling and source-view behavior; it does not reopen their whole scope.

### Implementation approach

Keep this one serial unit: parameter semantics, configuration, artifact metadata and shared consumers form one moving interface. Do not split overlapping writable paths among agents.

1. Separate acquisition, broad rendering, optional main-content extraction and filtering in the existing core. Ordinary Markdown defaults to the service's raw Markdown rather than fit Markdown. Render text from acquired HTML with a maintained HTML parser, excluding executable/style content while preserving card/list text and useful link identity. Do not use regular expressions as an HTML parser or introduce local Python for ordinary text. If a parser is required, declare a direct runtime dependency; `parse5` is the default implementation choice, subject to the package's Node/ESM build checks.
2. Keep file-first behavior and existing preview/response/deadline limits. Save raw HTML when available and original unfiltered service Markdown for saved HTML crawls. Treat optional extracted/filtered output as a separate view with explicit provenance. Preserve `pages[].file` as the requested output for existing consumers; add optional original-artifact references and label them clearly in output. Never describe an extracted view as the only original source. Legacy manifests remain readable without fabricated original references.
3. Make includeLinks meaningful for ordinary output rather than a hidden extractor dependency. Markdown/text keep useful link targets when requested; links-only output retains its existing role. Keep BM25's one-document/no-deep constraint and expose that constraint with a precise corrective error. A declaration need not encode every cross-field rule, but descriptors and runtime validation must agree.
4. Do not add a client allowJsCode switch that merely resends forbidden js_code to /crawl. Keep ordinary crawling/deep traversal working, remove jsCode from the default descriptor, and give legacy direct callers a precise unsupported-operation explanation naming the supported interaction tool once available. The capability package owns the real server/client interaction path. No permission is inferred from a version/health response.
5. Classify a rejected js_code field separately from an actual deep strategy rejection; preserve unknown refusals without guessed advice. Continue targeted credential redaction before truncation. Use small stable error codes on the existing error path, not a new error framework or automatic retry loop. Third-party hosts still own how they retain returned errors.
6. Preserve HTTP status and content type in optional manifest/result fields. Known non-success HTTP responses and empty requested content receive explicit usability diagnostics. Do not treat the mere presence of login text as proof of an inaccessible page: useful public social posts can contain that text too. Distinguish acquisition success from content usability, including mixed batches, without silently admitting an error page as evidence.
7. Carry HTTP/content-type facts and per-page errors without forcing textual resources through article extraction. During standalone completion of this baseline, an unconfigured PDF handler reports an explicit unsupported capability; this is transitional, not a permanent PDF policy. The linked capability package supplies the configured PDF path and is required for end-to-end document acceptance. Preserve partial batches and do not create a direct-fetch egress fallback.
8. For query reads of oversized unstructured sections, return bounded windows around actual matches, with character positions/continuation sufficient for a one-line file. Preserve existing semantic section behavior for ordinary Markdown/code/table blocks. Do not dump the complete document, invent complete JSON from fragments or increase caps to mask the defect.

9. Export one schema-backed, versioned structured envelope alongside bounded human output for crawl/read. Derive output validation/schema from the same contract rather than maintaining divergent types. Include per-page acquisition success, usability reason (usable/unusable/unknown), status/content type, original/view references, source timestamp/cache status where supplied, and returned-range/omission data. Unknown freshness stays unknown. Preview omissions and extraction loss are distinct; do not claim complete factual coverage from either size ratio or a keyword heuristic. Read ranges use UTF-16 character offsets for text; retain legacy line-window reads. A nextCall carries exact artifact/view identity and a revision/hash so an expired or changed source fails explicitly instead of silently switching files. Signed cursor infrastructure is unnecessary for this local artifact contract. Keep existing return content/details additive; host adapters map structured data into their native output mechanism. Code Mode adoption belongs to the agent package.
10. Include compact table/image/link metadata already present in service responses with source references when available. Do not automatically append every image or reconcile tables into an article view. Preserve a lossy-view label and originals rather than building a generic block-diff/repair engine. A future supplementation mode needs separate measured evidence.

## Decisions and Assumptions

- `D1` Scope is the shared pi-packages acquisition/read layer. Melon Labs adoption and business validation are a separate follow-up after a published consumer upgrade; planning creates no permission to release or deploy.
- `D2` Keep Trafilatura only as an explicit compatibility/article view. It is neither the default nor a prerequisite for text/includeLinks. Do not create an additional extraction tool or a summarizer/subagent framework in this package.
- `D3` Keep `pages[].file` compatible as requested output; add original-view references and provenance rather than changing the meaning silently. Defaults favor raw page content. Consumers choosing an extracted file as evidence must migrate separately.
- `D4` Legacy jsCode-on-/crawl is not a usable capability. Default descriptors hide it; the linked capability package implements explicit, supported browser interaction. Deep crawling is already available via the existing operator-owned bounded server path and must remain working.
- `D5` This baseline establishes representation/error contracts; the linked capability package must implement PDF extraction before the complete initiative is accepted. No general document service or OCR is required.
- `D6` The default working location is `docs/work/work`, with completion in `docs/work/finished`; PI_WORK_ROOT/OPEN_DIR/FINISHED_DIR are unset in this planning environment and local work-folder guidance confirms these defaults.
- `D7` Use one serial writer. No delegation or parallel work is needed. Implementation may adjust reversible helper/module placement while keeping these behavior and boundary decisions.
- `D8` Preserving actionable explanations instead of generic tool_failed is completed consumer work. This package only preserves existing diagnostic behavior while correcting remaining package-level classification/advice and adding codes where new behavior needs them.

## Files

Verified existing paths below are relative to the pi-packages repository. Any new pure rendering helper belongs under the existing crawl directory; its exact filename is an implementation detail, not an already-existing path.

- `packages/pi-crawl4ai/src/features/crawl/{crawlCore,crawlToolDefinition,crawlTool,types,http}.ts` — contract, descriptors, processing and corrective errors.
- `packages/pi-crawl4ai/src/features/crawl/{presentation,saveOutput,sessions}.ts` — source views, additive provenance and usable-content reporting.
- `packages/pi-crawl4ai/src/features/crawl/{crawlReadCore,crawlReadToolDefinition,outline}.ts` — bounded match-centered recovery/continuation.
- `packages/pi-crawl4ai/src/config/{types,loader,runtime}.ts` — retain centralized configuration; no speculative JavaScript toggle or capability registry.
- `src/research.ts` — export shared descriptor construction/types needed by consumers without Coding Agent imports.
- `packages/pi-crawl4ai/src/features/crawl/{crawlTool,crawlReadTool,outline,presentation,saveOutput,trafilatura}.test.ts`, `packages/pi-crawl4ai/src/config.test.ts` and `packages/pi-crawl4ai/src/config/loader.test.ts` — update existing risk owners as required.
- `packages/pi-crawl4ai/{README.md,AGENTS.md,CONTEXT.md,.env.example,package.json}`, `package-lock.json` — behavior/config/migration docs and any declared parser dependency. Update policy/context together where this package intentionally supersedes old rules.
- `packages/pi-crawl4ai/agents/{scrape,crawl,extract}.md` — keep guidance consistent with the public defaults and optional article view; do not broaden tool permissions.

## Acceptance Criteria

- [x] `AC1` Ordinary HTML text with `save:false` works without Python; ordinary includeLinks works without an extractor. Complete saved default page content retains a generic nine-card roster. Preview caps do not truncate saved bodies.
- [x] `AC2` Explicit extraction and filtering preserve independent original artifacts and provenance. Legacy manifests/read modes still work; the requested-output file contract remains intact.
- [x] `AC3` Default crawl descriptors omit unsupported jsCode. Legacy direct calls receive an actionable explanation, not a false claim that a local allow flag enables it. A js_code rejection never receives deep-crawl advice; existing bounded deep traversal remains supported.
- [x] `AC4` Changed input/capability/HTTP paths preserve existing bounded credential-redacted explanations and expose stable codes for the new classifications. This is regression protection, not reimplementation of the completed consumer message-retention fix. No new transport retry or egress path is introduced.
- [x] `AC5` A query for a late roster name in an approximately 87k-character minified document returns that match within the current delivery cap; continuation reaches other matches without falsely complete structured data.
- [x] `AC6` HTTP status/content type, cache facts where supplied, usability reasons and view provenance survive save/read; unknown stays unknown. Schema-backed structured output and human previews agree on source identity, ranges, omitted content and exact next calls. An unconfigured document path reports its missing capability, not a Python requirement.
- [x] `AC7` Coding Agent registration and the harness-neutral research bundle share the updated behavior and descriptors. Build/typecheck/package tests pass, and guidance documents all intentional compatibility changes and consumer adoption requirements.

## Linked Delivery and Follow-ups

1. This baseline completes first, freezing additive structured output, original/view references, revision-bound read continuation and per-page errors.
2. [Server/client capabilities](2026-10-21-feature-crawl-interaction-and-documents.md) extends that contract with selector waits/selection, structured extraction, explicit interaction and PDF parsing. Its server source is in discovery-services; its primary owner is this shared client package. No duplicate server work package is needed.
3. [Melon Labs agent adoption](/Users/patrick/Development/melon-labs/docs/features/agents/work/2026-10-21-feature-agency-research-evidence-and-codemode.md) adopts an exact released bundle, registers stable original evidence and adds native Durable Code Mode.

Preserve these dependencies even if helper locations change. Local implementation completion is separate from registry publication, server rollout and production agent activation; each external action requires its own concrete review/authorization.

## Validation

Use the companion test plan. Implementation must record regression RED/GREEN evidence where practical, package checks, a production-build research-export smoke and honest skipped live checks. Implementation checks and remaining independent-review gates are recorded in the companion test plan. Production deployment is separate from local verification.

## Independent Planning Review

Fresh-context Astra medium review on 2026-10-21 accepted the three-package sequence and native Durable approach. Adopted: ephemeral interaction contexts with cross-transaction isolation proof; distinct revisions for separate acquisitions; actual-image selector/extractor acceptance; consistent baseline migration wording; and the known PDF proxy/deadline adaptation. The reviewer proposed postponing arbitrary JavaScript to prevent fabricated DOM evidence. User steering explicitly retains JavaScript in the initial capability; the revised mitigation instead preserves pre-script originals, labels all post-script DOM/results as caller-script-influenced and requires independent corroboration for canonical facts. Typed convenience actions remain available. The follow-up Astra medium review accepted this approach, including server-owned non-forgeable influence markers, admission-time enforcement and exclusion of script navigation from redirect aliases. Planning is ready in dependency order; implementation and local acceptance are verified; production rollout remains separate.

## Open Questions

None

---
status: done
owner: engineering
last_reviewed: 2026-10-22
canonical_ref: none
---

# Focused acquisition, interactive access and PDF documents

## Type

feature

## Problem

Useful capabilities exist in the owned Crawl4AI instance/upstream but the shared client either omits them or sends them to the wrong endpoint. Disabling unsupported options is not the desired final functionality: the operator owns the service and wants interaction, focused/structured reads and documents to work. Deep crawling already works through the operator's bounded server construction and is not a missing capability.

## Outcome

After the baseline package, both Coding Agent and harness-neutral callers can wait for content, select a page region, extract repeated cards, perform one bounded browser interaction transaction and read a text PDF through the configured remote service. The tools return the same preserved-source/structured-result contract, without weakening ordinary deserialization or bypassing server egress.

## Scope

Included: shared client/descriptor exports and optional `crawl_interact` tool; owned discovery-services image integration and isolated verification; PDF text/metadata/page provenance; CSS waits/cropping and a minimal schema-based text/attribute extractor; fresh/cache facts and manual smoke measurements. Ordinary and deep crawling remain available.

Excluded: generic browser session service, authenticated/personal browser profiles, forms/messages/payments, arbitrary server-side Python, trusted deserialization of caller config, LLM extraction inside the crawler, OCR/Office parsing, dynamic package installation, ranked-link/near-duplicate infrastructure, automatic fallback providers, and production rollout in this planning request.

## Evidence and Dependencies

- Required baseline: [crawl contracts and preservation](2026-10-21-bug-crawl-content-preservation-and-contract.md). Its result schema, source/view references, revision-bound reads and per-page error contract are frozen before this package changes the shared core.
- Newly read owned server source: `/Users/patrick/Development/discovery-services/deploy/crawl4ai/{Dockerfile,entrypoint.sh,operator_deep_crawl.py,bounded_deep_crawl.py,source_integration.py,container_integration_test.py}`. The pinned image is 0.9.5; ordinary config still loads UNTRUSTED, while reviewed bounded constructors implement deep traversal. No global gate relaxation is needed.
- Reused authenticated server inspection from this chat: `/execute_js` is a separate disabled route; `/crawl` rejects js_code. Its implementation calls a pooled crawler and returns js_execution_result. The owned config pools contexts retaining cookies/localStorage/service workers until recycle, so a missing public session ID does not establish isolation. Upstream PDF acquisition uses requests.Session().get with a 600-second read timeout; its URL/peer validators do not prove traversal through the owned pinning/operator proxy. Isolated contexts and proxy-bound, deadline-limited PDF acquisition are known required adaptations. No live interaction/PDF success was established. These are required implementation proofs, not claimed working features.
- Reused research: [landscape](../work/2026-10-21-research-crawl-package-landscape.md) and [extraction comparison](../work/2026-10-21-research-trafilatura-and-extraction-comparison.md). Upstream allowlists CSS/XPath extraction classes and scalar wait/selection fields: remote structured extraction is not categorically prohibited. Actual deployed payloads must be proven, not inferred from allowlist names.

## Implementation Notes

One serial cross-repository unit, server first then client using one versioned wire contract. Do not concurrently edit the same client files as the baseline. Reuse owned image patch/integration mechanisms; do not edit a running container as the source of truth.

### Selection and waits

Add a named `waitForSelector` option distinct from existing millisecond `waitFor`; serialize only CSS conditions with an explicit bounded timeout under the shared call deadline. Add optional region selection and exclusions using supported server fields. Preserve the uncropped source separately; label a selected result as a view. Prefer uncropped capture and selection from the same navigation/snapshot, adjusting the owned response if required. If another acquisition is necessary, retain distinct acquisition/revision IDs, hashes and timestamps; link it as a related source and disclose that snapshot equivalence is unproven. Never label an independently fetched page as the exact original of a selected result or cropped HTML as a complete source. Do not implicitly enable article pruning/fit generation. Structured extraction accepts one bounded base selector and text/attribute fields with original-page provenance; no arbitrary constructors, Python expressions, regex engine or hidden model calls. The wire schema is closed to name/baseSelector/text-or-attribute fields; reject unknown keys including upstream baseFields/regex. Compile bounded selectors before network work. Run HTML parsing/Markdown/schema derivation in a killable worker under the shared deadline with cumulative match/field/output byte accounting before materialization; keep the API event loop responsive. A derivation failure retains acquired originals with explicit partial/unusable requested-view diagnostics, never silently substitutes uncropped content for a requested selection.

### Interactive transaction

Expose a separate `crawl_interact` descriptor/core, exported through research and registered by Coding Agent only when operator-configured. Input: public URL, typed convenience actions (click, scroll, waitForSelector and optional region read) and caller-authored browser JavaScript, optional CSS readiness selector and existing save/preview options. The server compiles convenience actions into browser operations and also supports explicit JavaScript/evaluate, including DOM access/mutation and page-initiated fetches within the existing egress boundary. Expose useful execution rather than a purported read-only JavaScript sandbox; bound action/script bytes and execution time for service reliability, not an artificial action vocabulary. It performs navigation, interaction, bounded readiness and pre/post-action capture in one transaction. Allocate a fresh ephemeral browser context per transaction, with no inherited cookies/localStorage/service workers, and destroy it on completion or timeout; browser-process pooling may remain. No reusable session ID is exposed. Preserve ordered server-owned script hashes and action provenance, and distinguish DOM-captured evidence from structured operation results. Capture immutable pre-script source; mark every post-arbitrary-script DOM/result and derived text/link/extraction view as caller-script-influenced, even when the script claims to read only. The marker and pre-script snapshot are server-owned and cannot be forged, cleared or overwritten by caller code/results. Keep influenced material fully readable/searchable. These outputs remain available for research/debugging but are not independent website proof; corroboration uses preserved pre-script evidence or a separate ordinary acquisition with its own revision. Page content remains untrusted; successful clicks are not a technical guarantee of no business side effects.

Integrate the dedicated `/execute_js` capability explicitly, extending/wrapping the owned route as needed for the common interaction result contract and typed convenience actions. Enable authenticated caller-script execution in the initial operator configuration; no separate future privilege project or per-call confirmation is required. Extend the owned integration boundary to enforce authentication, private bindings, deadlines, global browser capacity, bounded action count/script/input/response bytes and reliable cleanup. Keep ordinary `/crawl` UNTRUSTED and prevent actions from choosing credentials, browser profiles, proxy settings or server paths. Verify subresource requests, page-initiated fetches, redirects and PDF network activity obey existing DNS pinning/operator proxy controls. Enable the dedicated capability in image/config/Compose examples deliberately; do not merely turn on a flag and assume routing works. A lost response after interaction is an uncertain operation: return an explicit non-retryable/unconfirmed result and do not auto-replay clicks. Document that HTTP disconnect alone does not prove remote work stopped. Agency-research guidance limits actions to reading/navigation/expansion/scrolling; that assignment does not authorize contact or form submission. The generic capability remains available for other explicitly authorized tasks.

### PDF documents

Implement content-type-aware server-owned PDF acquisition and text extraction using upstream parsing strategies only after adapting acquisition to the authenticated pinning/operator proxy and shared deadline. The known direct requests.Session downloader and 600-second timeout cannot be reused unchanged. Use an owned narrow route/adapter only if the current API cannot represent that flow correctly; no client fetch fallback. Keep page numbers, metadata, original-document reference/hash and explicit scanned/no-text limitations. Never pass PDF bytes to Trafilatura. A query-bearing .pdf and an opaque URL returning application/pdf both work; mixed HTML/PDF batches retain per-item outcomes. Enforce document byte/page/deadline limits on the server before unbounded allocation. Binary provenance is returned as a controlled server artifact or copied through an authenticated bounded response into the caller's existing private session, never arbitrary filesystem paths. No OCR requirement.

### Metadata and ergonomics

Use the baseline typed envelopes for action outcome, per-item errors, source/view identity, omissions and continuation. Carry returned cache status/timestamp and redirected URL when present; do not assert freshness from success or cache-mode choice. Keep requested/final URLs and distinguish verified HTTP redirects from action/script navigation; only proven HTTP redirects may establish aliases, never a script-selected final URL alone. Export compact table/image/link metadata rather than adding every image/table into article text. Provide one documented explicit fixture-backed smoke command using the actual service; no startup probe or permanent dashboard. Measure retained fields/candidates, calls, latency and model-visible characters; report tokens only with a named tokenizer/model and distinguish these from model/provider charges.

## Decisions and Assumptions

- `D1` The primary package stays in pi-packages because it owns the cross-host wire/client feature. Discovery-services code is explicitly owned here; no duplicate server plan is created. Its implementation must follow that repository's AGENTS and update durable server documentation. The separate Melon Labs package owns consumer changes.
- `D2` Use the existing server and expose useful capabilities through narrow supported paths; do not replace the crawler, install a local browser or blindly mark all configuration trusted.
- `D3` First interactive version includes typed convenience actions and caller-authored browser JavaScript in a fresh isolated context, with no automatic replay. User steering explicitly rejects postponing useful JavaScript functionality. Source integrity is protected by provenance/corroboration, not by removing execution. A persistent-session browser is a later decision based on observed need.
- `D4` PDF text extraction is included, not permanent unsupported_document. Scanned PDFs report no text; OCR is deferred.
- `D5` Arbitrary block-diff repair, automatic table/image supplementation, new extraction toggles, default pruning, ranked links, near-duplicate indexes, llms.txt resolution and a separate summarizer framework are deferred. Original views and explicit extraction-loss labeling address current evidence risk with less complexity.
- `D6` Operator-controlled capability configuration is explicit and static; no new capability registry or automatic startup negotiation. Manual smoke proves the exact deployed contract. Update obsolete package policy that deferred selector/schema features while implementing this authorized scope.
- `D7` Server image publication/rollout, registry publication and agent upgrades are separate reviewed actions. Implementation includes isolated actual-image acceptance; this plan authorizes no external mutation now.

## Files

Existing client owners: `packages/pi-crawl4ai/src/features/crawl/{crawlCore,crawlToolDefinition,crawlTool,types,http,presentation,saveOutput}.ts`, `src/research.ts`, `packages/pi-crawl4ai/src/{index.ts,index.test.ts}`, `packages/pi-crawl4ai/src/config/{types,loader,runtime}.ts`, `packages/pi-crawl4ai/{AGENTS.md,CONTEXT.md,README.md,.env.example,package.json}`, and `package-lock.json`. Proposed new interact/document helpers and their descriptor live in this same crawl directory; exact filenames are implementation details, not existing files.

Existing server owners (absolute because another repository): `/Users/patrick/Development/discovery-services/deploy/crawl4ai/{Dockerfile,entrypoint.sh,config.yml,source_integration.py,container_integration_test.py,README.md}`, `/Users/patrick/Development/discovery-services/{docker-compose.staging.yml,docker-compose.production.yml,.env.staging.example,AGENTS.md,CONTEXT.md}`. Add only narrowly scoped interaction/document integration helpers alongside the existing operator helpers; leave deep constructors/proxy modules unchanged unless actual boundary tests require a correction.

## Acceptance Criteria

- [x] `AC1` CSS readiness waits for a delayed roster; selected and structured card results retain nine expected candidates and uncropped source from the same snapshot. Any related second acquisition has a distinct revision and is never presented as that exact original.
- [x] `AC2` Actual owned image opens a creator-card modal, expands/loads more entries and returns pre/post-action DOM plus bounded operation results through the real route; JavaScript/evaluate works, including a DOM mutation fixture whose outputs are labeled caller-script-influenced and kept separate from the immutable pre-script source. Disabled/unconfigured capability fails explicitly. No js_code is sent to ordinary /crawl.
- [x] `AC3` Interaction shares authentication, pinning/operator egress, capacity/deadline limits and cleanup; transaction B inherits no cookies/storage/service workers from transaction A. A private target reached by redirect or script/subresource remains blocked. Lost-response handling cannot silently replay effects.
- [x] `AC4` Query-bearing and content-type-detected PDFs yield paged text/metadata and original provenance through the actual document path, with authenticated operator-proxy traversal, zero direct downloader requests and deadline cleanup. Scanned/oversized/encrypted/unavailable PDFs have explicit per-item outcomes; supported batch items survive.
- [x] `AC5` Default/deep crawling still works in the installed image, with existing traversal bounds and no trusted deserialization widening. The client and Coding Agent adapter share schema-backed metadata/read behavior; unknown freshness stays unknown.
- [x] `AC6` Fixture-backed smoke and small comparison record completeness, calls/latency and bounded model-visible output for ordinary page, article, interactive roster and PDF. Required evidence is reproducible and contains no secrets/private transcripts. Package/container checks pass.

## Validation

See companion plan. Actual-image fixture acceptance is required for AC1–AC5; mocked transport alone is insufficient. No public-site or paid-provider run is needed. Document local image verification separately from production deployment. After local readiness, publish/release only with explicit instruction and pass exact artifact versions to the agent adoption package.

## Independent Planning Review

Fresh-context Astra medium review on 2026-10-21 accepted the three-package sequence and native Durable approach. Adopted: ephemeral interaction contexts with cross-transaction isolation proof; distinct revisions for separate acquisitions; actual-image selector/extractor acceptance; consistent baseline migration wording; and the known PDF proxy/deadline adaptation. The reviewer proposed postponing arbitrary JavaScript to prevent fabricated DOM evidence. User steering explicitly retains JavaScript in the initial capability; the revised mitigation instead preserves pre-script originals, labels all post-script DOM/results as caller-script-influenced and requires independent corroboration for canonical facts. Typed convenience actions remain available. The follow-up Astra medium review accepted this approach, including server-owned non-forgeable influence markers, admission-time enforcement and exclusion of script navigation from redirect aliases. Planning is ready in dependency order; implementation and local installed-image acceptance are verified; production rollout remains separate.

## Open Questions

None

## Implementation Acceptance

Independent fresh Astra medium review is READY after correcting schema closure/regex admission, bounded killable derivation, script-hash provenance, exclusion-only views and malformed interaction uncertainty. Server source is committed as fc4823f037db76b6b36d48722832b7be33cc9ce4 on discovery-services/feat/crawl-interaction-and-documents. Final locally tested image sha256:88e75e880cc9e88397908fa097a640b1ad32b63f05b63a029f35fa4823175d7a passed 44 installed unit checks, ten source checks, full ordinary/deep/legacy-PDF/interaction/document/security/resource/cleanup acceptance and the built-client smoke. HTTP operator proxy requests: 52; direct/private target requests: zero. Toolkit @patrick3131/pi-packages@0.1.4 was explicitly authorized and published by successful GitHub Actions run 39683079053 from tag v0.1.4 / source c025d719510f3de4444d2d8786454e918d51234a; production rollout is not performed.

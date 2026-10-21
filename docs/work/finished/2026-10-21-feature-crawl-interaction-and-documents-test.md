---
status: done
owner: engineering
last_reviewed: 2026-10-22
canonical_ref: none
---

# Focused acquisition, interactive access and PDF documents Test Plan

Primary: [work item](2026-10-21-feature-crawl-interaction-and-documents.md). Coverage decision: **Automated coverage required** for network isolation, uncertain interactions and document/extraction contracts. Reuse package mocks and the owned container fixture rather than adding a second browser harness.

## Risk Coverage and Automated Cases

More than three cases are justified here by six distinct cross-system risks; each has one cheapest owner. Extend existing suites wherever possible.

| Case | Risk and proof | Owner |
|---|---|---|
| 1 | Delayed/cropped/structured acquisition silently omits cards or originals: installed-image delayed nine-card fixture proves CSS readiness, text/attribute extraction and same-snapshot uncropped preservation. Client mocks prove serialization and distinct revision IDs for a related second acquisition, without implying snapshot equivalence. | Existing container fixture for actual acquisition; pi-crawl4ai crawl/artifact suites for wire serialization/revision mapping only. |
| 2 | Real interaction route does not perform/render/clean up: installed image fixture opens a modal, expands content and captures pre/post DOM under deadline/capacity; arbitrary JavaScript/evaluate executes, a DOM mutation result is labeled script-influenced while the immutable pre-script capture stays unchanged, timeout destroys the context, and cookies/localStorage/service workers seeded in transaction A are absent in B. | discovery-services container_integration_test.py extension. |
| 3 | Interaction/page subresources or PDF redirect bypass egress/auth: fixture private destinations, disallowed redirects and absent bearer are rejected; PDF fixture proves authenticated operator-proxy traversal, zero direct requests and shared-deadline cleanup. Existing proxy/deep proofs remain. | Same installed-image boundary suite, distinct security case; no duplicate client security simulation. |
| 4 | Unknown interaction effects replay after response loss: client mock refuses automatic retry and exposes explicit uncertain outcome, distinct from pre-dispatch failure. | Existing HTTP client suite/new interaction helper at its transport owner. |
| 5 | PDF data loss/resource exhaustion/one bad batch item: installed image processes fixture text PDF (query and opaque URL), scanned/no-text and oversized/encrypted/error variants with page/original refs and bounded outcomes. | Existing container fixture with a small synthetic PDF; production public BSI URL not a test dependency. |
| 6 | Client drops supported response fields or mutates source: validate actual returned structured values against the exported schema and round-trip final URL/cache unknowns/action-result provenance; requested-view refs remain separate; script-returned metadata cannot clear server-owned influence markers or forge HTTP redirect aliases. | Existing client artifact/contract suite; baseline owns general schema/range behavior. |

Existing deep traversal, proxy, response caps, aborts and legacy manifests stay in their current owner suites. Do not add source-inspection tests, exact-copy assertions, broad parser snapshots or duplicate every selection variant through Docker.

## Browser Or Manual Verification

Use a private local fixture in the owned image integration harness, not a personal browser/session. Inspect the saved pre/post-interaction DOM and original document/page refs. Verify post-action source evidence and operation-result provenance are distinct; arbitrary scripts execute and their DOM/results are labeled script-influenced rather than independent website proof. Verify no state survives across transaction contexts. Record actual pinned-image behavior; a health GET is not traversal/interaction/PDF proof. Close all fixture containers, browsers and listeners started by the run.

One optional authorized deployed smoke checks exact server/client artifacts after release; local fixture success does not claim production activation. Compare page/article/roster/PDF completeness and output size; no arbitrary token reduction target.

## Commands

Verified in repository scripts/Dockerfile; run each from its stated root.

```sh
# /Users/patrick/Development/pi-packages
npm run test --workspace=packages/pi-crawl4ai
npm run typecheck --workspace=packages/pi-crawl4ai
npm run build --workspace=packages/pi-crawl4ai
npm run build:research
npm pack --dry-run
# /Users/patrick/Development/discovery-services
npm run test:crawl4ai-proxy
docker build --platform linux/amd64 -f deploy/crawl4ai/Dockerfile -t discovery-services-crawl4ai:verify deploy/crawl4ai
npm run test:crawl4ai-container
```

The image runs source-integration/unit checks during build; the separate container command proves live installed behavior. Add only justified fixture dependencies through normal manifests/images, not dynamic downloads. Record environment prerequisites and exact output at implementation time.

## Acceptance Evidence

| Check | Result | Evidence |
|---|---|---|
| Source/command/ownership planning | checked | Existing client files, server Dockerfile/operator helpers/container fixture and native upstream docs inspected on 2026-10-21; prior live inspection explicitly reused. |
| Cases 1–6 and package/image checks | passed | Final image sha256:88e75e880cc9e88397908fa097a640b1ad32b63f05b63a029f35fa4823175d7a: 44 installed unit checks + 10 source checks; full boundary/ordinary/deep fixtures and built-client smoke pass. Four client contract tests pass; full toolkit npm test/typecheck and package/research builds pass. Final independent Astra medium review READY. |
| Production rollout and public websites | not run | Source branches only; production activation remains separate. |

## Independent Implementation Review

A fresh Astra medium reviewer exercised the installed image and found four material gaps: extra schema keys admitted upstream regex; synchronous derivation exceeded resource/deadline controls; scripts-only calls omitted script identity; and exclusions without selection were ignored for HTML/text. All were fixed and independently rechecked before completion. Acceptance now also proves private PDF redirects/unavailable documents and observes browser/parser/derivation child cleanup rather than inferring cleanup from elapsed time. Client regression checks retain originals on derivation failure, reject inconsistent PDF hashes and preserve before-source URL/status separately from script navigation.

## Explicitly Not Testing

OCR, Office files, persistent authenticated browser profiles, site-specific selectors as fixed contracts, automatic table/image repairs, unbounded script execution, hidden LLM extraction, performance coverage percentages, and production mutations.

## Open Questions

None

## Final Local Evidence

The final same-image fixture command exited zero with 52 authenticated pinned proxy requests and zero direct/private requests. Observable browser/parser/derivation child cleanup and event-loop responsiveness passed; legacy ordinary/per-URL/stream PDF strategy bypasses are rejected before egress with /acquire guidance. Derivation amplification is bounded and preserves original source with explicit partial failure.

| Client fixture | Candidates | Source views | Latency ms | Model-visible characters |
|---|---:|---:|---:|---:|
| Ordinary page | — | 3 | 4192 | 1638 |
| Article text | — | 3 | 4079 | 1624 |
| Interactive roster | 9 | 6 | 4118 | 2475 |
| PDF | — | 5 | 1780 | 2001 |

One tool call per fixture; these are local observations, not production latency targets. No tokenizer or provider-cost savings are claimed. Server commit fc4823f037db76b6b36d48722832b7be33cc9ce4 is pushed to its feature branch. Containers and task-started Docker Desktop were closed. Toolkit @patrick3131/pi-packages@0.1.4 is published and publicly verified by release CI run 39683079053. The final cache-timestamp correction is released as 0.1.5 by successful CI run 39684718349 (source 277b94b0df0287d32f04bb3c83fd7ee86ba4aabc); agent adoption pins 0.1.5 in its own work package; production rollout is separate.

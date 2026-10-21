---
status: done
owner: engineering
last_reviewed: 2026-10-22
canonical_ref: none
---

# Focused acquisition, interactive access and PDF documents To-Do

Primary: [2026-10-21-feature-crawl-interaction-and-documents](2026-10-21-feature-crawl-interaction-and-documents.md). Tests: [test plan](2026-10-21-feature-crawl-interaction-and-documents-test.md).

## Execution Shape

One serial unit across the server/client interface. Depends on completed baseline `2026-10-21-bug-crawl-content-preservation-and-contract`; do not overlap its writable client paths. Freeze selection/interaction/document response contracts before wiring clients. This is ordered work, not parallel path slices.

## Tasks

- [x] Confirm exact deployed/upstream route shapes and freeze bounded wire/result contracts; record unsupported assumptions explicitly and update package policy for authorized selector/extraction scope.
- [x] Implement owned server integration for typed convenience actions and arbitrary browser JavaScript in an ephemeral isolated context, plus paged PDF extraction through the authenticated proxy/shared deadline; retain pre-script originals, label script-influenced outputs and preserve authentication/egress/resource controls.
- [x] Prove installed-image selector/extractor, interaction isolation and document boundaries with deterministic local target/proxy fixtures before exposing the features to agents.
- [x] Implement selector waits, focused and text/attribute card extraction, shared interaction/document clients and explicit capability registration using baseline source/structured envelopes; distinguish same-snapshot views from related acquisitions with separate revision IDs.
- [x] Add honest cache/final-URL/table/image metadata and one documented smoke workflow; no implicit pruning or repair pipeline.

## Validation

- [x] Distinct risk cases in test plan pass; existing bounded deep traversal remains working.
- [x] Run verified package/typecheck/build/research-export/pack commands and actual owned image checks; record exact image digest and source.
- [x] Compare small fixtures by completeness first, then calls/latency/output size; no claimed token savings without named measurement.

## Docs

- [x] Update client/server contracts, config examples, operational opt-in/uncertain-operation behavior and release handoff.
- [x] Link the exact package release/server image needed by Melon Labs; do not enable production in a planning turn.

## Completion

- [x] AC1–AC6 verified locally; test evidence distinguishes production not performed.
- [x] Set all three documents done, update last_reviewed and move together to docs/work/finished after implementation is actually complete.

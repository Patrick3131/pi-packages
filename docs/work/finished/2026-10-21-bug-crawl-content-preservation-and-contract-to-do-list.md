---
status: done
owner: engineering
last_reviewed: 2026-10-22
canonical_ref: none
---

# Reliable crawl contracts and preserved page evidence To-Do

Primary: [work item](2026-10-21-bug-crawl-content-preservation-and-contract.md). Validation: [test plan](2026-10-21-bug-crawl-content-preservation-and-contract-test.md).

## Execution Shape

One serial unit owns the shared crawl package, affected research exports/dependency lock and these three documents. Contract/config, artifact metadata and reader behavior are coupled; no independent path slices or parallel agent work are proposed. Freeze additive manifest/result fields before adapting their readers. Existing completed work is reused, not reimplemented.

## Tasks

- [x] Establish the shared contract (`AC1`, `AC3`, `AC4`): independent ordinary text/includeLinks; honest legacy-JavaScript rejection and separation from the supported interaction path; accurate refusal classification. Extend existing preflight/config/transport cases before fixes where practical.
- [x] Preserve broad evidence (`AC1`, `AC2`): parser-backed ordinary text, raw page defaults, independent original HTML/Markdown and optional extraction/filter views, complete file-first persistence and readable legacy manifests.
- [x] Repair targeted reads (`AC5`): bounded excerpts around late matches, useful character continuation for minified inputs and preserved Markdown/code/table behavior.
- [x] Report resource/usability limits (`AC6`): status/content-type provenance, known HTTP/empty diagnostics, transitional unconfigured-document errors and honest textual-resource representations, preserving partial batches and server-owned acquisition.
- [x] Complete shared-host integration and schema-backed range/quality/cache output (`AC6`, `AC7`): research exports and Coding Agent registration use the same descriptors/core; optional article extraction remains explicit; no new host runtime imports or permissions.

## Validation

- [x] Record proportional regression evidence in the companion plan, including the synthetic roster/minified-input reproductions; never copy private session transcripts or credentials into fixtures.
- [x] Run package tests/typecheck/build and the root research-bundle build; smoke the built export with injected mocked acquisition, not a direct public-site fetch fallback.
- [x] Inspect package dry-run output and the final scoped diff; distinguish local verification from live/provider/consumer acceptance.
- [x] Confirm all `AC1`–`AC7` on the combined implementation and document remaining release/adoption steps. Do not publish or replay production assignments as part of this package.

## Docs

- [x] Update package AGENTS/CONTEXT/README/config examples and existing crawl-agent guidance alongside intentional behavior changes.
- [x] Document ordinary text/extractor migration, removal/rejection of legacy JavaScript on /crawl, explicit interaction handoff, additive originals/status metadata, transitional unconfigured-PDF behavior and Melon Labs consumer follow-up.

## Dependencies

Complete the baseline before the linked capability package modifies the same crawl modules. Agent adoption follows both. Do not treat transitional unsupported-document handling as the final initiative outcome.

## Completion

- [x] Every acceptance criterion is verified, with actual results in the test plan.
- [x] Test additions protect named risks and do not duplicate existing coverage.
- [x] All three documents are marked done and last_reviewed is updated only after implementation and verification.
- [x] Move the complete package together to `docs/work/finished/`; do not move incomplete work.

Independent Astra medium approval and final local gates are complete. This finished baseline does not claim production deployment; exact toolkit publication and consumer adoption belong to the linked packages.

---
status: backlog
owner: engineering
last_reviewed: 2026-10-18
canonical_ref: none
---

# Predictable tools preferences and session state To-Do

## Tasks

One coupled serial unit; no independent slices or delegation requirement.

- [ ] Replace automatic reconciliation writes with explicit-only merge/save;
  distinguish invalid and absent input, retain unavailable keys (including
  restricted and still-connecting catalogs), and atomically replace valid JSON
  (AC1–AC3, AC8).
- [ ] Preserve restored/session state across lifecycle events; apply defaults only
  to fresh sessions and use current-branch preset evidence in both features
  (AC4, AC6).
- [ ] Make picker/print status exposure-aware, display saved-only unavailable
  entries separately, prevent hidden activation, and read back accepted toggles
  (AC5).
- [ ] Adapt existing regression tests to the new contract; remove contradictory
  obsolete assertions rather than keeping both behaviors (AC1–AC6, AC8).

## Validation

- [ ] Demonstrate each practical regression test fails for the intended reason
  against the old implementation before fixing it, including the restricted-catalog
  and late-MCP-connection flips (AC8).
- [ ] Run toolkit tests and typecheck; record actual outputs in the test plan.
- [ ] Complete the bounded real-Pi manual checks in the test plan (AC4, AC5, AC7).

## Docs

- [ ] Update tools local AGENTS policy, CONTEXT, and README plus toolkit README;
  clarify branch-local preset restoration in its CONTEXT (AC7).

## Completion

- [ ] Every acceptance criterion is verified; record limitations honestly.
- [ ] Test plan records coverage decisions and evidence.
- [ ] Set all three documents to done, update last_reviewed, and move the complete
  package together to docs/work/finished only after implementation is verified.

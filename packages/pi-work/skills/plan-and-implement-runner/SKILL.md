---
name: plan-and-implement-runner
description: Create an implementation-ready work package, optionally commit plan docs, then implement it to completion. Use only when explicitly asked to plan and implement in one guided flow. User-facing outcomes are COMPLETE or BLOCKED.
disable-model-invocation: true
---

# Plan And Implement

Own the complete two-phase flow until `COMPLETE` or `BLOCKED`; do not stop after creating docs or launching implementation.

## Required sibling skills

Read and follow these files completely, resolving paths relative to this skill directory:

1. `../task-and-plan-routing/SKILL.md`
2. `../implement-tdd-review-runner/SKILL.md`

Stop with `BLOCKED` if either file is unavailable.

## Phase A — Plan

1. Follow the planning skill to create or finalize the primary, to-do, and test documents.
2. Run its clarification and readiness gates.
3. If clarification is needed, the package is intake/not-ready, or any artifact is missing, stop. Do not implement or commit a provisional plan.

After a ready package exists, prefer a narrow docs-only checkpoint commit when Git permits it and the plan files changed in this run. Skip and report the reason when the repository is unavailable, the files are unchanged/ignored/outside the repository, the user declined, or a narrow commit is unsafe. Verify that only the intended plan paths are staged.

## Phase B — Implement

1. Pass the three absolute paths as canonical scope to the implementation skill.
2. Follow it through `COMPLETE` or `BLOCKED`.
3. Preserve its readiness, risk-based testing, scope, documentation, and finished-move rules.

## Output

### COMPLETE

Report the final artifact paths, any docs commit hash or `commit skipped: <reason>`, validations run, and a concise completion summary.

### BLOCKED

Report the failed stage (`planning`, `clarification gate`, `validation`, `docs commit`, or `implementation`), the concrete blocker, and the exact next path or clarification.

## References

- Planning: `../task-and-plan-routing/SKILL.md`
- Implementation: `../implement-tdd-review-runner/SKILL.md`
- Optional chain: `.pi/agents/implement-tdd-review.chain.md`

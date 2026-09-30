---
name: plan-and-implement-runner
description: Create an implementation-ready work package, optionally commit authorized plan docs, then implement it to completion. Use only when explicitly asked to plan and implement in one guided flow. User-facing outcomes are COMPLETE or BLOCKED.
disable-model-invocation: true
---

# Plan And Implement

Own planning and execution until COMPLETE or BLOCKED. Work directly by default; this composition adds no workflow engine, chain, or required agents. A small or low-risk request normally takes one direct pass through both phases: no extra delegation, review panel or coordination documents by default. Honour explicit operator delegation requests without adding unrelated stages.

Read both sibling skills completely, resolving paths relative to this skill directory:

- `../task-and-plan-routing/SKILL.md`
- `../implement-tdd-review-runner/SKILL.md`

Report BLOCKED if either is unavailable.

1. Follow the planning skill to create or finalize the primary, to-do, and test documents in the repository's actual work location.
2. Inspect the returned readiness verdict (`ready`, `intake`, or `not_ready`) against the three documents, not the verdict alone. Do not implement an intake, provisional, incomplete, or blocked package; resolve it in the planning phase first.
3. If a plan checkpoint commit is authorized, make it narrowly docs-only and verify only the intended paths are staged. Otherwise skip it; a commit is not a readiness prerequisite. Never infer push/publication authority.
4. Pass the three absolute paths to the implementation skill and follow it through completion, including risk-based testing, local policy, review, actual-state recovery, evidence, and the three-file finished move. Do not stop merely because planning or a child run ended.

Delegation, parallel slices, integration, validation lanes, review lenses, recovery, and optional native workflows are owned by the implementation skill and its references under `../_shared/procedures/`; read them there rather than restating them here. Neither phase requires a workflow engine.

Report the final artifact paths, validations, and any authorized docs commit hash (or concise skip reason). On BLOCKED, identify the concrete blocker and remaining work, retaining incomplete documents in their open location.

## Host notes

Both siblings are operator-only. Their host notes govern authorized delegation and controls; use the current host's tools, not guessed Pi mechanics in another host.

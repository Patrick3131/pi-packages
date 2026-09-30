---
name: implement-tdd-review-runner
description: Execute an existing implementation-ready work package with risk-justified TDD. Use only when explicitly asked to implement from a work-item doc, companion to-do list, or existing plan. User-facing outcomes are COMPLETE or BLOCKED.
disable-model-invocation: true
---

# Execute Work Package

Own an existing **three-file work package** until COMPLETE or BLOCKED. Execute directly by default; no chain, script, phase agents, or delegation is required.

## Preflight

1. Resolve the primary, `-to-do-list.md`, and `-test.md` from the supplied path, keeping their shared basename and actual folder. Never guess across unrelated folders.
2. Read all three, repository `AGENTS.md` / `CONTEXT.md`, and applicable work-folder and feature guidance. Respect local scope, permissions, commands, and feature-owned work locations; shared skills define the method, not project policy.
3. Inspect the repository and confirm readiness: concrete outcome, scope, acceptance criteria, justified test plan, and no blocking `Open Questions` or `idea` intake. A `triage` package must be classified, complete, and `backlog` or `in_progress`.
4. Treat these documents as canonical scope. Escalate unapproved product, architecture, or scope decisions instead of inventing them.

If readiness fails, report BLOCKED with the exact missing artifact, path, or decision.

## Implement and verify

Set all three artifacts to `status: in_progress` and update `last_reviewed` when implementation starts.

- Read `../_shared/testing-policy.md` and the test companion. Inspect existing coverage first; add tests only for named material risks at the cheapest stable layer. Default to zero to three new cases; honor `No automated test needed` and avoid duplicate proof.
- For regressions, establish a failing test for the intended reason before fixing when practical. Implement the smallest in-scope change in one ownership loop.
- Keep the to-do list accurate. Run verified local validation commands and required manual checks; record acceptance evidence and failed or unavailable checks honestly.
- Review the actual final diff for correctness and scope. For substantial work, obtain fresh read-only review when delegation is authorized and useful; otherwise review directly. Apply accepted findings and revalidate affected behavior, not completed unrelated checks.

## Optional authorized delegation

Delegate only when the current request or applicable user/project instructions authorize it. Tool availability, task size, or risk alone is not authority.

Use one bounded worker slice when it improves execution or isolation, and a fresh read-only reviewer when it adds independent evidence. Extra review lenses or parallel writers must earn their overhead through named risks and exclusive paths; keep one writer per worktree and one owner for package documents. The parent retains decisions, integration, verification, final acceptance, and publication authority. Children do not delegate unless explicitly authorized.

Give fresh children concise, cold-start-complete handoffs: goal; repo/cwd/ref; exact owned paths and prohibited actions; relevant guidance and package paths; acceptance criteria; validation; expected evidence; stop/escalation conditions. Ask for changed paths, commands and outcomes, findings, remaining work, and artifact pointers, not copied transcripts. Fork only for a documented dependency on inherited state.

## Recovery

After interruption or failure, inspect the actual worktree/diff, validation state, and existing run/handoff before continuing. Preserve completed work and resume only the remaining slice; do not restart phases or infer success from a child ending. Distinguish infrastructure interruption from an external task blocker. Capture partial changes and failed checks; do not silently switch a governed execution mode or retry an active writer. Seek approval when recovery requires new authority.

## Completion

**COMPLETE** requires every in-scope acceptance criterion verified, passing required validations or successful documented manual proof, and evidence in the primary, to-do, and test documents. Mark all three `status: done`, update `last_reviewed`, and move them together to the locally configured finished location. Resolve `PI_WORK_*` overrides and local lifecycle guidance; preserve feature-owned placement. Report final paths and validations. Never claim complete while required evidence or work is missing.

**BLOCKED** reports the concrete blocker, exact remaining work, and needed path or decision. Keep incomplete documents in their actual open location with an accurate handoff. An infrastructure failure is not proof that the task itself is impossible.

## Host notes

- Pi: use existing builtin `worker` / `reviewer` from pi-subagents; inspect installed role resolution and controls before launching. Direct `{ agent, task }` is sufficient for one child; prefer async and `context: "fresh"`. No project workflow files are needed.
- On launches or resumes, explicitly set supported per-run elapsed deadline/checkpoint controls with finishing margin; consult the installed tool reference. Current Pi single-agent async launches support `timeoutMs` (alias `maxRuntimeMs`) and `checkpointBeforeDeadlineMs`; other run shapes or resumes may require an explicit steer after active tools return. Checkpoints report changed files, test state, remaining work, and publication state. Avoid hard tool-call caps for mutation work. Checkpoint delivery is best-effort; a timeout is not a mutation-safe boundary.
- Non-Pi: execute directly or use the host's authorized worker/reviewer equivalents and supported controls. Do not claim unsupported Pi mechanics or successful delegation.

## References

- Testing policy: `../_shared/testing-policy.md`
- Planning: `../task-and-plan-routing/SKILL.md`
- Composition: `../plan-and-implement-runner/SKILL.md`

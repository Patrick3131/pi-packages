---
name: implement-tdd-review-runner
description: Execute an existing implementation-ready work package with risk-justified TDD. Use only when explicitly asked to implement from a work-item doc, companion to-do list, or existing plan. User-facing outcomes are COMPLETE or BLOCKED.
disable-model-invocation: true
---

# Execute Work Package

Implement an existing **three-file work package** and stay responsible until `COMPLETE` or `BLOCKED`. A chain or subagent ending is not success by itself.

## Preflight

1. Resolve the primary, `-to-do-list.md`, and `-test.md` paths from any supplied artifact path.
2. Verify all three exist; never guess across unrelated folders.
3. Read all three documents and the applicable project `<root>/AGENTS.md` / `<root>/CONTEXT.md`.
4. Inspect the repository before inventing file paths or validation commands.
5. Confirm readiness: concrete outcome/scope/acceptance criteria, no blocking `Open Questions`, and no `idea` intake. A `triage` package must be classified, complete, and have status `backlog` or `in_progress`.
6. Treat the three documents as the canonical scope. Do not silently expand it.

If preflight fails, stop with `BLOCKED` and state the exact missing artifact, decision, or path.

## Execute

When implementation begins, set all three artifacts to `status: in_progress` and update `last_reviewed`.

1. Read `../_shared/testing-policy.md` and the companion test plan.
2. Inspect existing coverage before adding tests.
3. Add automated coverage only for named material risks, using the cheapest stable layer. Default to zero to three new cases; exceed that only for distinct risks.
4. For a regression test, verify the new test fails for the intended reason before applying the fix when practical.
5. Honor `No automated test needed`; do not invent tests for compiler guarantees, framework behavior, mocks, test helpers, source structure, exact copy, CSS classes, trivial prop forwarding, or duplicate layers.
6. Implement the smallest change that satisfies the acceptance criteria.
7. Keep the to-do list current and map acceptance criteria to validation evidence.
8. Review the final diff for scope drift, run the documented commands, and perform required manual checks.

Prefer the project chain `.pi/agents/implement-tdd-review.chain.md` when available. Otherwise perform the same phases with subagents or in-process. Continue internally while required in-scope work remains and there is no concrete blocker.

## Completion

### COMPLETE

- Required in-scope work is done;
- validations pass or documented manual checks succeed;
- acceptance criteria, to-do list, and test plan contain evidence;
- all three artifacts are `status: done` with updated `last_reviewed`;
- the complete package is moved to the finished directory;
- the response reports the new finished paths and validations run.

### BLOCKED

Report the concrete blocker, exact remaining work, and the path or clarification needed. Keep incomplete artifacts in the open directory.

## References

- Testing policy: `../_shared/testing-policy.md`
- Optional chain: `.pi/agents/implement-tdd-review.chain.md`
- Planning skill: `../task-and-plan-routing/SKILL.md`
- Composite skill: `../plan-and-implement-runner/SKILL.md`

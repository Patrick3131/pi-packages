---
name: task-and-plan-routing
description: Create structured work-item packages from discussion context. Use when the user asks to create a task, plan, implementation plan, or work item. Keep open work in one flat directory (default `docs/work/work/`), use the bundled document templates, and distinguish implementation-ready packages from idea or triage intake.
disable-model-invocation: true
---

# Create Work Package

Create durable work documents as an executable contract between planning and implementation. Keep this skill project-agnostic: resolve the project’s configured work root and read its local guidance before writing files.

## Choose the mode

Use **implementation-bound mode** when the request is clear enough to execute. It requires:

- a primary work-item document;
- companion `-to-do-list.md` and `-test.md` documents;
- concrete outcome, scope, and observable acceptance criteria;
- no unresolved blocking questions.

Use **intake mode** for intentional capture of an idea or early triage. Keep it in the same open folder, label it `idea` or `triage`, and do not claim it is implementation-ready or hand it to an implementation runner.

## Resolve placement

Use one flat pair of lifecycle directories:

- `<root>/<openDir>/` — open, planned, or in-progress work;
- `<root>/<finishedDir>/` — completed packages.

Resolve `PI_WORK_ROOT`, `PI_WORK_OPEN_DIR`, and `PI_WORK_FINISHED_DIR` before writing; defaults are `docs/work`, `work`, and `finished`. Read `<root>/AGENTS.md` and `<root>/CONTEXT.md` when present. Do not create type-based folders. Topic subfolders require explicit project guidance.

## Clarification gate

Inspect the repository first. Ask concise questions only when a missing, non-discoverable decision changes the scope, outcome, or implementation readiness. Record ordinary assumptions in the primary document instead of blocking on them. Stop without creating implementation-bound files when the request is exploratory and the user did not ask for capture.

## Type metadata

Choose the narrowest label that describes the work; it affects filenames and UI grouping, not directory placement:

- `bug` — broken behavior or regression;
- `technical` — architecture, infrastructure, build, type, test, or deployment work;
- `view` — focused page, component, copy, hierarchy, or interaction polish;
- `feature` — end-to-end behavior across states or modules;
- `epic` — a larger initiative with multiple work streams;
- `triage` — raw or unclear report awaiting classification;
- `idea` — intentionally not implementation-ready.

## Create or update the documents

1. Use the bundled templates relative to this skill directory:
   - `../_shared/templates/work-item.md`
   - `../_shared/templates/to-do-list.md`
   - `../_shared/templates/test-plan.md`
2. Inspect the repository before filling `Files` or `Commands`; include verified paths and commands only.
3. Keep tasks meaningful and tied to acceptance criteria; do not turn every edit into a checkbox.
4. Read `../_shared/testing-policy.md` while writing the test plan.
5. Remove unused placeholders and keep `## Open Questions` as `None` when the package is ready.
6. Name the files with one dated, lowercase, kebab-case base:

   ```text
   <open>/YYYY-MM-DD-<type>-<slug>.md
   <open>/YYYY-MM-DD-<type>-<slug>-to-do-list.md
   <open>/YYYY-MM-DD-<type>-<slug>-test.md
   ```

For intake, companions may be minimal stubs, but report `intake` explicitly. For implementation-bound work, all three files must be complete before handoff.

## Readiness and output

Before reporting success, verify that the three files exist, share a basename, and are internally consistent. An implementation-ready package has no blocking `Open Questions`, real acceptance criteria, and a test plan with a justified coverage decision. Use `status: backlog` for planned work and `status: in_progress` only when implementation starts immediately.

Return:

- the type and placement rationale when non-obvious;
- absolute paths created or updated;
- `ready`, `intake`, or `not_ready` with reasons;
- whether an implementation runner may proceed.

## Completion handoff

Implementation is responsible for setting all three files to `done`, updating `last_reviewed`, and moving the complete package to the configured finished directory. Do not move incomplete work.

## References

- Project `<root>/AGENTS.md` and `<root>/CONTEXT.md` when present
- Templates: `../_shared/templates/`
- Testing policy: `../_shared/testing-policy.md`
- Optional chain: `.pi/agents/work-item-creation.chain.md`
- Related skills: `../implement-tdd-review-runner/SKILL.md`, `../plan-and-implement-runner/SKILL.md`

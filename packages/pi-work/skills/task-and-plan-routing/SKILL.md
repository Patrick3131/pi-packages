---
name: task-and-plan-routing
description: Create structured work-item packages from discussion context. Use when the user asks to create a task, plan, implementation plan, or work item. Keep open work in one flat directory (default `docs/work/work/`), use the bundled document templates, and distinguish implementation-ready packages from idea or triage intake.
disable-model-invocation: true
---

# Create Work Package

Create durable work documents as an executable contract between planning and implementation. Execute directly by default; no scripted workflow, chain, or project agents are required. Shared skills own the method; repositories own scope, architecture, commands, permissions, and work placement.

## Choose the mode

Use **implementation-bound mode** when the request is clear enough to execute. It requires:

- a primary work-item document;
- companion `-to-do-list.md` and `-test.md` documents;
- concrete outcome, scope, and observable acceptance criteria;
- no unresolved blocking questions.

Use **intake mode** for intentional capture of an idea or early triage. Keep it in the same open folder, label it `idea` or `triage`, and do not claim it is implementation-ready or hand it to an implementation runner.

## Resolve placement

Start with supplied work-package paths and applicable repository/work-folder/feature guidance. Preserve feature-owned locations; do not relocate a supplied package to defaults.

For new packages, resolve `PI_WORK_ROOT`, `PI_WORK_OPEN_DIR`, and `PI_WORK_FINISHED_DIR` and local placement rules before writing; defaults are `docs/work`, `work`, and `finished`. Read repository `AGENTS.md` / `CONTEXT.md` and applicable guidance at the chosen work root. Keep open and finished packages in their configured lifecycle folders. Do not introduce type-based folders by default; retain existing repository-mandated type routing and use topic or feature placement only with project guidance.

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
3. Keep tasks meaningful and tied to acceptance criteria; do not turn every edit into a checkbox. Use the optional `## Slices` table only when independent path ownership helps: one owner per path, dependencies only for actual code/behavior needs. A slice table describes safe ownership, not permission to delegate or a requirement to parallelize.
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

- any useful slice ownership or dependencies;
- the type and placement rationale when non-obvious;
- absolute paths created or updated;
- `ready`, `intake`, or `not_ready` with reasons;
- whether an implementation runner may proceed.

## Completion handoff

Implementation is responsible for setting all three files to `done`, updating `last_reviewed`, and moving the complete package to the configured finished directory. Do not move incomplete work.

## Host notes

Use the current host's tools. Delegation requires authorization in the request or applicable user/project instructions, not merely available tools. If authorized research or review materially improves the plan, use a bounded fresh-context child with exact paths, relevant local guidance, acceptance questions, and concise evidence. Keep decisions and document ownership with the parent; Pi may use existing builtin roles, never required project agents. Implementation host notes cover execution controls and recovery.

## References

- Repository and applicable work-folder/feature `AGENTS.md` / `CONTEXT.md`
- Templates: `../_shared/templates/`
- Testing policy: `../_shared/testing-policy.md`
- Related skills: `../implement-tdd-review-runner/SKILL.md`, `../plan-and-implement-runner/SKILL.md`

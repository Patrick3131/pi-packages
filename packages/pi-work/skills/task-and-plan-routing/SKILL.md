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

## Investigate and clarify

Read before asking. Inspect the repository first: applicable `AGENTS.md` /
`CONTEXT.md` at the chosen work root, existing work documents for the same topic,
and the relevant code and tests. Answer everything the checkout can answer
yourself; ask only when a missing, non-discoverable decision changes scope,
outcome, safety, or acceptance. Stop without creating implementation-bound files
when the request is exploratory and the user did not ask for capture.

Keep its evidence honest while planning: mark verified repository findings with
their source path, keep assumptions visibly unverified, and distinguish reused
prior work from newly checked work. Reuse an existing intake, research, or plan
artifact for the topic and validate only what changed instead of re-deriving it.

Give decisions and questions stable ids so a later run can resume against one
item:

- `D1`, `D2`, … for decisions and nonblocking assumptions;
- `Q1`, `Q2`, … for blocking questions.

Record a decision in the primary document whenever a defensible default exists,
including reversible details; name the default chosen so a reader can correct it.
A question is blocking only when no defensible default exists and the answer
changes scope, behavior, safety, or acceptance. Blocking questions go under
`## Open Questions`, which stays `None` when the package is ready.

Resumable memory is optional, not a fourth mandatory file. Keep a concise
topic/decision/evidence record in the primary document, or in an existing
artifact for the topic. Create a separate intake note only when clarification
must survive a session or handoff and the user wants that resumable context;
label it non-canonical and never hand it to implementation as a ready package.

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
3. Keep tasks meaningful and tied to acceptance criteria; do not turn every edit into a checkbox. Use the optional `## Slices` table only when the work splits into parts with independently observable outcomes (see below).
4. Read `../_shared/testing-policy.md` while writing the test plan.
5. Remove unused placeholders and keep `## Open Questions` as `None` when the package is ready.
6. Name the files with one dated, lowercase, kebab-case base:

   ```text
   <open>/YYYY-MM-DD-<type>-<slug>.md
   <open>/YYYY-MM-DD-<type>-<slug>-to-do-list.md
   <open>/YYYY-MM-DD-<type>-<slug>-test.md
   ```

For intake, companions may be minimal stubs, but report `intake` explicitly. For implementation-bound work, all three files must be complete before handoff.

### Slices

Name a slice when it delivers an independently observable outcome and owns
exact, exclusive writable paths. Each slice records:

- the outcome that passing it proves on its own;
- the paths it owns, with no path in two slices;
- strong dependencies only — a real compile or behavior edge, plus the artifact
  or interface that unblocks the dependent slice;
- the local check it must pass before handoff.

Dependencies are build or behavior edges, not planning order. Slices with no
dependency edge can each run in their own worktree at the same time. Tightly
coupled dependency chains usually remain one writer's ordered work; a separate
dependent slice may start once its named prerequisite is integrated and verified,
without waiting for unrelated slices. Any shared interface — module
boundary, type, schema, route, or command contract — is frozen before parallel
work and owned by exactly one slice that others consume without editing.

Local checks prove a slice; integrated acceptance proves the combined result
after integration. When interfaces are still moving or the change is one coupled
area, keep it a single serial unit and say so rather than splitting on file count.
A slice table describes safe ownership, not permission to delegate or a
requirement to parallelize.

## Readiness and output

Before reporting success, verify that the three files exist, share a basename, and are internally consistent. An implementation-ready package has no blocking `Open Questions`, real acceptance criteria, and a test plan with a justified coverage decision. Use `status: backlog` for planned work and `status: in_progress` only when implementation starts immediately.

A planning consistency review is optional and risk-proportionate. Do it directly
for ordinary packages. When the change is high-risk, ambiguous, or far-reaching
and delegation is authorized, a bounded fresh-context reviewer may check placement,
type, scope, acceptance criteria, slice ownership, and test proportionality
against the exact three paths. Apply accepted findings and record a rejected
finding with its reason. Only the inspected documents and their evidence
establish readiness: a child run ending, a workflow returning, or a review
verdict alone does not.

Creating a package does not authorize implementation; the request or applicable
instructions do.

Return:

- any useful slice ownership or dependencies;
- the type and placement rationale when non-obvious;
- absolute paths created or updated;
- `ready`, `intake`, or `not_ready` with reasons;
- whether an implementation runner may proceed.

## Completion handoff

Implementation is responsible for setting all three files to `done`, updating `last_reviewed`, and moving the complete package to the configured finished directory. Do not move incomplete work.

## Host notes

Use the current host's tools. Delegation requires authorization in the request or applicable user/project instructions, not merely available tools. If authorized research or review materially improves the plan, use a bounded fresh-context child with exact paths, relevant local guidance, acceptance questions, and concise evidence. Keep decisions and document ownership with the parent; Pi may use existing builtin roles, never required project agents. Verify any package returned by a workflow or child against the repository before reporting readiness; its status line is not readiness evidence. Implementation host notes cover execution controls and recovery.

## References

- Repository and applicable work-folder/feature `AGENTS.md` / `CONTEXT.md`
- Templates: `../_shared/templates/`
- Testing policy: `../_shared/testing-policy.md`
- Related skills: `../implement-tdd-review-runner/SKILL.md`, `../plan-and-implement-runner/SKILL.md`

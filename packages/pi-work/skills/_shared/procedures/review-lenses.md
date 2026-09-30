# Optional review lenses

Review is optional and earned by named risk. One fresh read-only reviewer is
usually enough; add lenses only when the work justifies the overhead. A small or
low-risk change needs no separate review stage at all.

## Lenses

- **Readiness** — the delivered package is implementation-ready: three files
  present and consistent, concrete outcome, observable acceptance criteria,
  justified coverage decision, no blocking Open Questions, lifecycle status
  matching reality.
- **Test quality** — each automated case protects a material production risk at
  the cheapest stable layer; no copy, styling, structural, or duplicated proof;
  weak and masking assertions, flakiness, and coverage gaps in touched scope.
  Ask whether the case would fail if the behaviour regressed; inspect assertions
  of observable output, failure/negative cases and mocks that bypass the actual
  boundary. Prefer existing proof over duplicate tests, and deterministic input
  over timing/randomness. Do not propose cases for compiler/framework guarantees.
- **Conventions and reuse** — touched files reuse canonical types and nearby
  abstractions, respect module and ownership boundaries and naming, and carry the
  applicable owning-layer `AGENTS.md` / `CONTEXT.md` updates when policy or
  durable architecture changed. Read nearest guidance and canonical helpers
  before recommending a new abstraction; point to the concrete existing pattern.
- **Correctness** — the diff does what the package says, without scope drift,
  regressions, or missing required work. Check relevant input/output contracts,
  authorization, state transitions, compatibility and failure paths against the
  named acceptance risks; don't inflate an optional lens into whole-repo review.

## Rules

- Fresh and read-only: a lens receives the artifacts and the actual diff, not the
  parent conversation, and returns current findings only.
- Every finding needs concrete evidence — a path with line, a command, or a
  contract contradiction. Drop findings that cannot be pointed at evidence.
  "No findings" is a valid result, but still name what was checked.
- Review only the reviewed scope and do not re-report another lens's domain.
- Use the actual diff as the review target, not a summary of it.

## Bounded reviewer brief

Supply repository/cwd, actual integrated diff and content identity, the exact
package paths, relevant owning guidance, selected lens questions and prohibited
actions. Return each concrete finding with priority, path/line, observable risk
and suggested scoped disposition; list what was inspected and any unavailable
proof. End with a verdict (BLOCK, OK, or OK with notes), not a success inferred
from the run ending. The parent records accepted/fixed/deferred/rejected findings
and reasons, handles scope decisions, and verifies readiness/acceptance itself.

## Scheduling

Prefer one barrier that starts several independent read-only lenses together over
sequential launches. Do not run a lens while a writer or a mutation-capable check
is still changing the same tree; sequence them or review the validated revision.
A must-fix finding triggers a scoped fix and revalidation of the affected
behavior, not a full re-run of completed work.

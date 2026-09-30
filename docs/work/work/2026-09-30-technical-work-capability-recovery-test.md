---
status: in_progress
owner: engineering
last_reviewed: 2026-09-30
canonical_ref: none
---

# Capability recovery Test Plan

## Coverage Decision
Existing coverage plus structural resource checks and manual procedural fixtures. No prose snapshot tests.

## Risk Coverage
| Risk | Cheapest proof |
|---|---|
| Missing distributed procedures/auxiliary operator metadata | extend existing skills resource test to check exact files/relative links/metadata |
| Parallel slices hide integration failures or overwrite unrelated state | independent disposable writers, parent integration and combined validation plus dirty sentinel |
| Partial work falsely complete/replayed | incomplete fixture/checkpoint and resume only outstanding scope |
| Clarification lost or premature deletion | fixture with unresolved decision, unique research, canonical triplet and approved stale artifact |
| Overhead becomes mandatory | source review confirms direct mode/no default extra roles or full-suite duplication |

## Automated Cases
Extend existing distribution test only; no source-text/phrasing assertions for procedural content. Existing 43 pi-work tests and typecheck remain required.

## Manual Verification
Direct small fixture: no unnecessary worker fleet, accurate completion.
Parallel fixture: two exclusive outputs prepared concurrently; parent validates the integrated result, not child exit alone.
Partial fixture: preserve successful output and checkpoint; resume only missing work; no false COMPLETE.
Clarification fixture: keep stable topic/owner decision/evidence, report readiness blocker without rewriting guesses.
Cleanup fixture: dry-run first; keep unresolved/canonical/unique notes; delete only explicitly approved stale noncanonical path, retain uncertainty.
Functional observations are not comparative benchmark proof. Record model, elapsed/bounds and limitations; do not claim faster/better than baseline.

## Commands
```sh
npm test --workspace=packages/pi-work
npm run typecheck --workspace=packages/pi-work
npm pack --workspace=packages/pi-work --dry-run
git diff --check -- packages/pi-work
```

## Distribution Evidence

Producer-source Pi SDK `loadSkillsFromDir` discovers exactly the three core names plus `work-note-cleanup`; all are operator-only, `formatSkillsForPrompt` excludes them, and discovery diagnostics are empty. This proves producer resource discovery, not deployment to existing installed Git checkouts. `npm pack --workspace=packages/pi-work --dry-run` contains every referenced procedure, matrix and cleanup policy/YAML. 45/45 integrated package tests and typecheck passed; logs at `/tmp/capability-recovery/`.

Three writers' actual native session headers (not just launch arguments) confirm `opencode-go/deepseek-v4.1-flash`, `thinkingLevel: high` and distinct snapshot cwd; evidence `actual-model-headers.json`. All started within 0.23 seconds, demonstrating real concurrent dispatch. Fixture outcomes: all six scenarios PASS; evidence `/tmp/capability-recovery/exercise.md` and `fixtures/evidence/` includes real red/green, runtime readiness verdicts, preserved successful digest, retained canonical/unresolved/unique notes, exact approved deletion, deliberate failing check without autofixes, and actual git conflict with unchanged dirty/index sentinels. Partial failures are explicitly simulated. Parent rechecked direct green/runtime ready and exact cleanup paths.

Fresh reviewer reported OK with notes, one P1 corrected for the pi-subagents 0.74.0 workflow-input change and one P2 completion-record update. Corrected source was revalidated: 45/45 tests, typecheck, package dry-run. Full root publication gates also passed: 458 tests plus 3 skipped, all-workspace typecheck and build. This remains functional proof, not a same-budget comparative benchmark.

## Explicitly Not Testing
No live network research, paid website crawls, provider transport changes, blanket prose snapshots, unrelated crawl work or automatic commit/push.

## Open Questions
None

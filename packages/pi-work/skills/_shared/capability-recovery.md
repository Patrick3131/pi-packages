# Work capability recovery: source-backed disposition

This is a capability comparison, not proof that custom roles outperform builtins. Recovery keeps detailed policies in canonical shared skills; repositories still own placement, commands and permissions. No required phase fleet, scripts or maintained consumer copies.

## Evidence basis

- Original Melon Labs planning, implementation and composite skills inspected at `bc30974b6` (`.shared-agents/skills/*/SKILL.md` plus planning `references/resume-invocation.md`). Repository-local policies in those originals are not portable defaults.
- Original canonical simplified producer skills inspected at Pi Packages `0a558df` (`packages/pi-work/skills/`).
- Historical inventory is reproducible from the repositories rather than from a retained report; the matrix below identifies the specific source seams. In `melon-labs`, `bc30974b6` is the last commit holding the complete pre-retirement set — `.pi/agents/*.md`, `.pi/workflows/*.js`, and `.shared-agents/skills/{task-and-plan-routing,implement-tdd-review-runner,plan-and-implement-runner}` — and `720633492` retires it. Distinct blob versions over that history are 76 `.pi/agents/*.md` across 20 filenames and 11 `.pi/workflows/*.js` across 3 filenames. Regenerate with:

  ```bash
  for p in .pi/agents .pi/workflows; do git log --format=%H -- "$p" | while read c; do git ls-tree -r "$c" -- "$p"; done | awk '{print $3}' | sort -u | wc -l; done
  ```

- Actual installed builtin worker/reviewer definitions: execution roles are sufficient when given explicit contracts; they do not automatically inherit parent skills. Tool availability and successful execution do not prove authority, readiness or acceptance.

## Old → simplified → recovered / retired

| Capability and original seam | Simplified state | Recovery location / disposition |
|---|---|---|
| Repository-first investigation, nearest owning guidance, verified entry points, feature ownership (original planning skill) | Placement and basic repo inspection retained; implementation context thinner | Detailed planning skill preserves local routing, verified contracts/patterns, scope and observable readiness; no product path defaults |
| Clarification/resume identity, confirmed vs assumed facts, owner decisions, prior/new evidence, delta continuation (`resume-invocation.md`; creation workflow `7bdde55b9007:46–96,232–284`) | Basic ask-only-if-blocking gate; richer memory absent | Planning decision/question IDs and optional resumable record in existing primary; preserve evidence and changed assumptions, no required fourth document |
| Path slices, actual dependencies and concurrent isolated writers (original planning/implementation skills, parallel workflow) | Optional three-column slice table and one-writer rule retained | Planning/templates and execution procedures add outcome, writable paths, shared contract owner, predecessor artifact/gate, per-slice and integrated proof; concurrency is optional and authorised |
| Cheap direct work, batched reads, avoid repeated green checks, one doc owner (original implementation cost-per-step guidance) | Direct default and risk-based tests retained; operational detail reduced | Execution skills make proportionality explicit; no extra roles/stages by default; revalidate only affected evidence |
| Scoped validation with real results (validator `4e0d1e54649d:4–7,26`; implementation workflow `26cbfb7a2726:324–362`) | General checks and review guidance | Optional builtin-worker validation brief; exact commands and allowed artifact effects, no autofixes/expectation changes, stable tree before reviewer. Retire contradictory read-only labels and concurrent editing |
| Test-quality lens (`47d71d5001a2/implement-tdd-review-test-reviewer.md`) | Generic review | Optional builtin reviewer lens: observable behaviour, assertion strength, masking mocks, nondeterminism and duplicate proof; no automatic panel |
| Conventions/reuse/nearest owning layer (historical conventions reviewers), correctness (`b2b1d5097b8d`), readiness (`eccda992e9d3`) | Basic final diff review/readiness | Optional evidence-driven reviewer prompts for relevant risks, parent resolves findings and readiness verdict. Retire full duplicated reviewer agents |
| Dirty-state integration (`2f62b4e6d7b3/implement-tdd-review-integrator.md:20–42`) | Parent responsibility and preserve unrelated state retained, detailed safeguards reduced | Parent-owned baseline/index protection, exclusive patch accounting, conflict stop, combined checks and no implicit reset/stash/commit/push |
| Retain-first cleanup (`0aefca4f2448/work-item-cleanup-manager.md:19–29`; protection variant `279195b441d4:17–26`) | Specialist removed, no replacement | Auxiliary operator-only work-note-cleanup skill: inventory/dry-run, preserve unresolved/canonical/unique data, exact deletion approval and drift recheck; no wizard/automatic destruction |
| Truthful readiness and failure outcome (creation workflow `7bdde55b9007:537–545,601–627`) | Basic gates and actual-state recovery retained | Explicit artifact/verdict inspection, inspect partial changes before claims, resumable evidence and no phase replay; retire child-exit=READY and false no-writes assertions |
| Parent synthesis, bounded checkpoints, cold-start handoffs (historical workflows) | Concise child handoff and best-effort controls retained | Optional native compositions preserve useful boundaries, stable keys and artifact references; no new engine, registry, hardcoded clocks or unconditional forks |
| SearXNG/crawl/git evidence research | Global custom web-researcher already restored; specialist awareness subsequently implemented | Retained distinct tool stack and parent handoffs; no new researcher clone/nested launch authority |
| Router/writer/test-writer/implementation/finalizer phase identities | Removed | Retire duplicated fleets; bounded builtin worker/scout/reviewer tasks carry recovered policies instead |
| Fixed three-review panel, mandatory phase registry/scripts, product paths/model pins | Removed | Remain retired; choose only useful authorised concurrency and risk-appropriate independent review |

## Verification and performance claims

Distribution checks protect referenced files and operator metadata; functional source fixtures cover direct work, real isolated parallel implementation plus integration, partial-state continuation, clarification retention and approved retain-first cleanup. Simulated interruptions must be labelled as simulated. A green slice does not establish a green integrated result, and an installed package is not updated merely by editing its producer.

Before claiming an advantage, compare builtin+concise-task versus recovered guidance using the same model, budget and fixture inputs. Include a small direct task and a meaningful parallel task; measure end-to-end elapsed time, model/tool calls or tokens, acceptance failures, missed risks and false positives. For validation inject a real failing check and verify source/expectations stay unchanged; for integration include dirty staged work and an overlapping/semantic conflict. Record scope, model, revisions and limitations. No comparative superiority is claimed by this recovery.

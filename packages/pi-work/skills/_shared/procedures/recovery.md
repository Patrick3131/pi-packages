# Partial-state recovery

A run that ended is not a run that succeeded, and a failed lane is not proof that
nothing was written.

## Inspect actual state

- Inspect the working tree against the recorded base: diff, untracked paths,
  validation state, open package documents, and any child artifact or run record.
- Assume a mutation-capable lane may have written before it failed or timed out.
  Never report or infer "no writes" from a failure or timeout message; only a
  verified unchanged tracked diff, index and untracked inventory/content against
  the recorded baseline supports that claim. A clean tracked diff alone misses
  newly written untracked files.
- Distinguish an infrastructure interruption (deadline, checkpoint, host error)
  from an external task blocker. Neither proves the task impossible by itself: try safe same-protocol recovery
  for infrastructure failures and identify the exact required external action
  when a genuine task blocker remains.

## Resume without replay

- Preserve completed work and resume only the remaining slice. Do not restart
  tests-first, implementation, or review because a later lane failed.
- Reuse still-applicable evidence: a check that passed against an unchanged
  revision stays valid; a check against a revision that has changed must be run
  again.
- Continue from the recorded state, not from checkboxes alone or from a summary
  of a child that may have ended early.
- Do not report success from a child ending, and do not strand a resumable
  package: keep it in its open location with exact remaining work and the missing
  input or failed check.

## Authority

Recovery grants no new authority. Seek approval before recovery needs a different
mode, a wider scope, or a change to protected state. Do not silently switch a
governed execution mode, retry an active writer, or relaunch a lane whose output
is still being integrated.

## Checkpoints

Deadline and checkpoint controls are best-effort. When the host supports them,
set a per-run elapsed deadline with finishing margin, and treat a checkpoint as a
report (changed files, test state, remaining work, publication state) rather than
a mutation-safe boundary. Avoid hard tool-call caps for mutation work.

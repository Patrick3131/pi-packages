# Scoped validation lane

A validation lane executes checks; it does not repair the change. A `reviewer`
examines adequacy of evidence; a validation lane produces evidence.

## Brief requirements

- Exact allowed commands and the owning package or workspace scope.
- The protected set: sources under test, test files and expectations, snapshots,
  fixtures, lockfiles, and the package documents.
- Whether the lane may write at all. Default: read and run only.
- The base revision and the diff the checks must run against.

## Rules

- Run the narrowest relevant test, lint, and typecheck surface for the touched
  paths. Prefer commands documented in the nearest `AGENTS.md`, then
  workspace-local commands, then a filtered root command.
- Execute only the allowed checks. Do not add, delete, skip, or weaken a test,
  change or relax an expectation, refresh a snapshot, or reformat protected
  sources to make a check pass.
- Evidence lanes do not repair. A lane that edits what it is validating can no
  longer prove an independent result, so a validation-only task makes no source
  fix, however trivial. That separation is a deliberate, accepted tradeoff: a
  trivial failure costs one round-trip instead of a silently self-certified run.
  Keep the round-trip cheap by reporting the exact failing command, the failing
  assertion or error, the smallest candidate fix with its path, and the single
  command to rerun afterwards. The parent then authorises a separate bounded
  writer and reruns only the affected checks. Never alter expected behaviour,
  weaken an assertion, or refresh a snapshot to turn red evidence green.
- Read/run commands can write caches, generated files, databases or snapshots.
  Identify allowed artifact paths and side effects before execution; use a
  disposable copy for unsafe checks or stop if their effects are unknown. Compare
  protected source hashes/diff and index before/after; a read-only label is not
  filesystem enforcement.
- Never report a check as passing when it did not run. Record the command, the
  result, and any check skipped as unavailable or too expensive.

## Reporting

Scope (paths, workspace, commands), outcome (pass, fail, or unavailable), source
fixes applied (must be none for validation-only), allowed generated artifacts,
failing checks with the exact failure, protected-state comparison and remaining
blockers. Record the base revision plus actual diff/content identity the commands
ran against; HEAD alone does not identify an uncommitted integrated tree.

## Scheduling

A mutation-capable check lane has no stable snapshot while it runs. Do not review
the same tree concurrently; either finish validation first, or hand the reviewer
the validated revision and artifact. This also applies to a writer still
editing.

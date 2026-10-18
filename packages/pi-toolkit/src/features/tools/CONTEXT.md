---
owner: repo-maintainers
last_verified: 2026-10-18
applies_to: packages/pi-toolkit/**
inherits_from: ../../../../CONTEXT.md
canonical_for: pi-tools architecture
---

# pi-tools — Context

`<cwd>/.pi/tools.json` is a map of project tool decisions, and it is **input
only**. A session reads it; nothing in a session lifecycle writes it. The only
writer is an explicit `s` / `/tools save`.

## Why writes were removed

Preferences used to be reconciled against each session's live catalog, which
made the file a mirror of whatever process happened to run. Catalogs are not
authoritative: they are filtered by `--tools` / `--exclude-tools`, they grow as
MCP servers finish connecting, they shrink when an extension fails to load, and
a delegated child session (an async subagent sharing the project cwd) sees only
its own agent's allowlist while still loading this extension. Reconciling wrote
those small catalogs back, deleting or flipping preferences the user had set,
and the next full session re-added the missing names as `false`.

Removing the automatic writes removes the whole class: no lifecycle event writes,
no appending of new names as `false`, no pruning of names this catalog lacks.

## Reading

- Applying the file is additive over the session's current selection: names set
  to `true` are enabled, names set to `false` are disabled, and names the file
  does not mention keep Pi's native choice. Absence is never a disable
  instruction, so a sparse file cannot silently strand a newly installed tool,
  and a filtered catalog cannot strip a session.
- Defaults apply only to a fresh session: not when a preset owns the tool set
  (`preset-state` on the current branch), not when the transcript already
  declares a loadout (resume, fork, reload), and not in a delegated child
  session (`sessionManager.getHeader()?.parentSession`), which receives its tools
  from its parent.
- Late registrations (MCP servers connecting after `session_start`) follow Pi's
  native behavior; nothing re-reads or re-applies the file per turn.

## Writing

`/tools save` merges: it starts from the file on disk, rewrites only the
non-hidden tools this session registers (to that session's active state), and
preserves every other key. Saving from a smaller catalog therefore cannot drop
preferences it had no evidence to judge. The write is atomic (same-directory
temp file plus rename) and last-writer-wins; this is not a cross-process merge
guarantee and locking is out of scope.

A malformed file is reported and refused rather than replaced. A missing file
stays missing until an explicit save.

## Reporting

`/tools` and `/tools print` label status from Pi's metadata: `exposure`
separates declared tools from indirectly reachable ones (`codemode`, `deferred`)
and from `hidden` tools that cannot be activated at all, and toggles are read
back from `getActiveTools()`. Names saved in the file but not registered in this
session are listed separately as unavailable.

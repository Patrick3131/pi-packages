---
name: work-note-cleanup
description: Retain-first audit and narrowly authorized deletion of noncanonical work notes. Use only when the operator explicitly asks to clean up, prune, consolidate, or archive work notes; inspect read-only, offer promotion or linking first, and delete only an explicitly approved path set.
disable-model-invocation: true
---

# Clean Work Notes

Operator-only procedure for the noncanonical notes that accumulate around work packages: intake, research, and agent notes that are neither the canonical package nor durable guidance. Retain by default. Deletion is a separate, narrowly authorized action, never an inference from a filename, glob, age, or a finished package.

## Bounds

- Inspection is read-only. Nothing is removed until the operator approves an exact path set (Step 4).
- No new cleanup runtime, wizard, script, engine, scheduled job, or project agent; no fixed model pins. Use the host's existing read and shell tools.
- No implicit `git commit`, `push`, `reset`, `stash`, `checkout`, or `git clean`. Leave unrelated dirty, staged, and index state untouched and report it.
- Backups only within an explicitly approved policy for the run; otherwise report what would be lost before touching anything.
- Preserve public names and placement: canonical triplets, folder `AGENTS.md` / `CONTEXT.md` / `README.md`, and bundled templates keep their exact names.

## Candidate families

Resolve the actual work root from supplied paths, local `AGENTS.md` / `CONTEXT.md`, and `PI_WORK_*` (`PI_WORK_ROOT`, `PI_WORK_OPEN_DIR`, `PI_WORK_FINISHED_DIR`; defaults `docs/work`, `work`, `finished`). Do not migrate or invent folders.

Noncanonical candidates sit beside packages, for example:

- `*-intake.md` (clarification ledger), `*-research.md`, `*-agent-notes.md`, `*-notes.md`;
- superseded duplicates of those notes inside the open or finished folder;
- legacy scratch folders only where local guidance still names them (older repositories used `docs/temporary/...`); an obsolete path is not a reason to create or keep one.

Never candidates unless the operator names them in an explicit exception approving the complete package together (not one companion): the primary document, `-to-do-list.md`, `-test.md`, work-folder `AGENTS.md` / `CONTEXT.md` / `README.md`, templates, and readiness or guidance files.

## Step 1 — Retain-first inventory

List candidates by explicit path, not by pattern match. For each, record:

- exact repo-relative path, file type (regular file or symlink), resolved target for links, and current content hash;
- frontmatter `status` and `last_reviewed`, plus mtime age;
- the canonical package with the same basename, if any, and whether that package is complete or finished;
- who references or links it: canonical docs, other notes, handoff or commit text;
- unique content not present in the canonical package, guidance, or another retained note: decisions, owner answers, external sources, measurements, unresolved questions.

A stale timestamp, an `obsolete` status, or a finished package whose final document exists is a prompt to inspect, not deletion authority.

## Step 2 — Default to retain

Retain when any of these holds:

- it is part of a canonical triplet; a package may never lose one companion, and companions are deleted only under an explicit operator exception;
- intake status is `clarification_needed`, or it holds unresolved questions, open owner decisions, or resume pointers;
- it is referenced from canonical docs or other retained notes (source references), or it documents the evidence behind a decision;
- it contains unique research, measurements, or external links not captured elsewhere;
- it conflicts with the canonical document, or its relationship is ambiguous;
- it is a symlink, lives outside the resolved work folders, or resolves to a target outside them: uncertainty is protected;
- it contains secrets, credentials, tokens, customer data, or copied `.env` values. Do not delete and do not copy it; report the path for separate handling.

## Step 3 — Prefer promotion or linking over deletion

Before proposing any deletion, look for a less destructive disposition and offer it first:

- promote a durable decision into the nearest `CONTEXT.md` / `AGENTS.md` or into the canonical package, then mark the note superseded;
- link a still-useful note from the canonical document instead of removing it;
- consolidate duplicate notes into one retained note, and propose the others only after the consolidated copy is verified to contain the unique content;
- archive only when the operator asked for archival; archival is a move, still approved path by path.

If the canonical target already contains those facts, deletion may be defensible; if not, propose promotion or linking instead.

## Step 4 — Dry-run manifest and approval gate

Present one table, then stop. Make no changes.

| Path (exact) | Action | Reason | Referenced from / links to | Status & age | Unique content |
| --- | --- | --- | --- | --- | --- |
| `docs/work/work/2026-04-15-feature-x-research.md` | retain | canonical doc cites it as evidence | primary `2026-04-15-feature-x.md` | `in_progress`, 12d | external benchmark numbers |
| `docs/work/work/2026-04-15-feature-x-intake.md` | retain | unresolved clarification status; owner resolution still required | none | `clarification_needed`, 30d | none after merge |
| `docs/work/work/2026-04-02-view-header-notes.md` | consolidate | duplicate summary | to-do list of same base | `done`, 60d | one unresolved question |

Then list explicitly:

- the exact proposed deletion set with hashes, as a copy-ready list;
- promotion, link, consolidation, or archive steps proposed instead of deletion;
- unresolved items and blockers: missing or broken references, unreadable files, secrets found, unrelated dirty/staged/index state;
- refused or protected candidates with the rule that retains them.

Deletion proceeds only after the operator approves that exact set. "do it", "run cleanup", "clean up the stale stuff", approval of a count, or approval of a pattern is not approval of a path set; ask once for the concrete list. A wider reply requires a new inventory and a new approval for the added paths. Partial approval deletes only the named subset.

## Step 5 — Apply the approved set

Immediately before each deletion, re-check and stop on drift:

- the file is still a regular file with the approved hash and mtime, not a symlink whose target moved;
- incoming references from canonical docs and other notes are unchanged;
- dirty, staged, and index state matches what was reported, and no approved path carries uncommitted changes that were not part of the decision.

Delete by explicit path only:

- no recursive or glob deletion (`rm -rf dir/*`, `find … -delete`, `git clean`) and no directory removal that could carry files outside the approved set;
- never delete through a symlink or follow a link out of the work area; report links whose targets lie outside;
- handle companions together: one package cannot lose a companion to an unrelated cleanup;
- if a check fails, report the drift and the remaining unapplied paths instead of continuing.

## Report

Record what actually happened, not what was proposed:

- deleted paths with the hash that was removed;
- retained and protected paths with the retaining rule;
- promotions, links, consolidations, and moves actually performed;
- unresolved items, blockers, drift, failed or skipped paths;
- unique content that had to be preserved elsewhere first;
- dirty, staged, or index state observed and left untouched;
- an explicit statement that no commit or push was performed.

## Host notes

Inspect with read-only tools first. Deletion is a separately authorized action: the parent can apply the approved manifest directly. If delegation is separately authorized, Pi may use a bounded worker given exact paths and the approved manifest; on other hosts, use the authorized equivalent. Actual tool availability is not authorization, and unsupported host mechanics must not be claimed.

## References

- Canonical trio and placement: `../task-and-plan-routing/SKILL.md`
- Execution, lifecycle, and finished-package semantics: `../implement-tdd-review-runner/SKILL.md`
- Repository and work-folder `AGENTS.md` / `CONTEXT.md`, plus `PI_WORK_*` configuration

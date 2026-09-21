---
owner: engineering
last_verified: 2026-04-15
applies_to: docs/work/**
inherits_from: CONTEXT.md
canonical_for: Structure and lifecycle for active work documentation
---

# Work Docs - Context

`docs/work` is non-canonical working memory for planning and implementation notes.

Treat each implementation-bound package as an executable contract: the primary document defines the outcome and acceptance criteria, the to-do companion tracks meaningful deliverables, and the test companion records risk and evidence. Keep the documents structured enough to guide an agent without turning them into a diary.

## Lifecycle

1. Create a dated spec or note when a task needs durable working context.
2. Keep the note updated while work is active.
3. Mark the note `done` when the work is implemented and verified.
4. Move stable information into root or app-level `CONTEXT.md`.

## Current Structure

`docs/work` intentionally uses a two-folder lifecycle:

- `docs/work/work` — open, planned, active, and in-progress work items
- `docs/work/finished` — completed work items and handoff notes

Keep dated work docs in one of those folders. Do not add backlog, active, archive, temporary, resource, framework, or type-specific subfolders unless the repo working agreements are intentionally updated.

## Work Package Shape

Each implementation-ready item is a three-file package sharing one dated base name:

- `YYYY-MM-DD-<type>-<slug>.md`
- `YYYY-MM-DD-<type>-<slug>-to-do-list.md`
- `YYYY-MM-DD-<type>-<slug>-test.md`

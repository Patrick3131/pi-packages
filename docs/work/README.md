# Work Docs

`docs/work` is short-lived project memory for specs, task notes, and implementation handoffs.

Use this area for dated work that helps execute a change. Move stable product or architecture context into the nearest `CONTEXT.md`.

## Folders

- `work/` — open, planned, active, and in-progress work items
- `finished/` — completed work items and handoff notes

## File Shape

New work docs should include frontmatter:

```md
---
status: idea|backlog|in_progress|done|obsolete
owner: engineering
last_reviewed: YYYY-MM-DD
canonical_ref: none
---
```

Implementation-bound work uses three files with the same dated base name:

- primary: problem, outcome, scope, verified implementation notes, acceptance criteria, and validation;
- `-to-do-list.md`: meaningful implementation, validation, and documentation tasks;
- `-test.md`: coverage decision, material risks, cheapest proof layer, commands, manual checks, and explicit exclusions.

Use `No automated test needed` when the change has no material runtime risk. Do not add tests merely because code changed, and do not duplicate a failure mode across test layers.

## Current Work


## Completed

- [Global Pi Crawl4AI configuration](finished/2026-10-22-technical-global-crawl-config.md) — shared local/melon-remote settings, private credentials and verified global acquisition.
- [Melon Labs agent adoption](/Users/patrick/Development/melon-labs/docs/features/agents/work/finished/2026-10-21-feature-agency-research-evidence-and-codemode.md) — source evidence, creator discovery and native Code Mode.
- [Crawl interaction and documents](finished/2026-10-21-feature-crawl-interaction-and-documents.md) — @patrick3131/pi-packages@0.1.5 released; source/server/browser/PDF acceptance and independent review passed.
- [Crawl content preservation and contract](finished/2026-10-21-bug-crawl-content-preservation-and-contract.md) — shared representation/read/error baseline; local checks and independent review passed.

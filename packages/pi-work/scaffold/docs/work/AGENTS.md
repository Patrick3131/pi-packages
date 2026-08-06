---
owner: engineering
last_verified: 2026-04-15
applies_to: docs/work/**
inherits_from: AGENTS.md
canonical_for: Working agreements for planning and implementation notes
---

# Work Docs - AGENTS.md

## Scope

This directory contains dated planning specs, active implementation notes, and handoff records.

## Working Agreements

- Keep work docs concise and dated.
- Keep open/planned work in `docs/work/work`.
- Keep completed work in `docs/work/finished`.
- Keep implementation-ready work items as three files with the same dated base name: the primary spec, `-to-do-list.md`, and `-test.md`.
- Type (`feature`, `bug`, `idea`, `triage`, …) is metadata only — do not create type-based subfolders; `/work` may group by type in the UI.
- A package is implementation-ready only when companions exist, Open Questions are non-blocking, and type is not pure `idea` intake.
- Do not add backlog, active, archive, temporary, resource, framework, or type-specific subfolders without updating this guidance.
- Create a work spec before substantial implementation.
- Keep each spec clear about scope, skipped work, acceptance criteria, and open questions.
- Test plans must name the material production risk protected by each proposed automated test and use the cheapest stable layer that proves it.
- Default to zero to three new automated cases; exceed that only for distinct named risks.
- Test plans should record what is explicitly not being tested, including duplicate or low-value coverage.
- `No automated test needed` is a valid explicit test-plan outcome for documentation, deletion, mechanical organization, ordinary copy/styling, or compiler-enforced changes that introduce no material runtime risk.
- Do not require tests merely because code is changing, and do not duplicate a failure mode already covered at another layer.
- Update the spec when implementation changes direction.
- Promote durable architecture or product decisions into the nearest `CONTEXT.md`.
- Do not store secrets, credentials, private customer data, or copied `.env` values here.

## Tooling

When the `pi-work` package is installed:

- `/work` browses open packages
- `/work finished` browses completed packages
- `/work new` creates a package via `task-and-plan-routing`
- `/work plan-implement` plans then implements
- `/work init` recreates this scaffold if missing

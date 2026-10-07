---
owner: repo-maintainers
last_verified: 2026-10-05
applies_to: packages/pi-toolkit/src/features/tools/**
inherits_from: ../../../AGENTS.md
canonical_for: pi-tools package conventions
---

# pi-tools — AGENTS.md

## Purpose

`/tools` picker plus project `.pi/tools.json` defaults.

## Rules

- Session toggles must not write `.pi/tools.json`.
- Only `s` / `/tools save` change the on/off defaults of existing registered tools.
- New tools are appended as `false`.
- Reconciliation and saving prune names absent from the full registered catalog.
- Disabled registered tools must retain their saved values; active tools alone are not the catalog.
- Do not call `getActiveTools` / `setActiveTools` during module load.
- Print dumps go through `appendEntry("tools-print")`.
- Job lists stay in `presets.json`.

## Commands

```bash
npm test --workspace=packages/pi-toolkit
npm run typecheck --workspace=packages/pi-toolkit
```

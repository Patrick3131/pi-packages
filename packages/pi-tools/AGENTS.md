---
owner: repo-maintainers
last_verified: 2026-08-17
applies_to: packages/pi-tools/**
inherits_from: ../../AGENTS.md
canonical_for: pi-tools package conventions
---

# pi-tools — AGENTS.md

## Purpose

`/tools` picker plus project `.pi/tools.json` defaults.

## Rules

- Session toggles must not write `.pi/tools.json`.
- Only `s` / `/tools save` overwrite project defaults.
- New tools are appended as `false`.
- Do not call `getActiveTools` / `setActiveTools` during module load.
- Print dumps go through `appendEntry("tools-print")`.
- Job lists stay in `presets.json`.

## Commands

```bash
npm test --workspace=packages/pi-tools
npm run typecheck --workspace=packages/pi-tools
```

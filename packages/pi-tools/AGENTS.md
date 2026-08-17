---
owner: repo-maintainers
last_verified: 2026-08-13
applies_to: packages/pi-tools/**
inherits_from: ../../AGENTS.md
canonical_for: pi-tools package conventions
---

# pi-tools — AGENTS.md

## Purpose

Packaged official `/tools` command with a details toggle and `/tools print`.
Do not also drop `tools.ts` into `~/.pi/agent/extensions/`.

## Rules

- Keep enable/disable persistence aligned with the Pi example.
- Do not call `getActiveTools` / `setActiveTools` during module load.
- Print dumps go through `appendEntry("tools-print")`, never `sendMessage`.
- Job tool lists stay in `presets.json`, not in this package.

## Commands

```bash
npm test --workspace=packages/pi-tools
npm run typecheck --workspace=packages/pi-tools
```

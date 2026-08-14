---
owner: repo-maintainers
last_verified: 2026-08-13
applies_to: packages/pi-presets/**
inherits_from: ../../AGENTS.md
canonical_for: pi-presets package conventions
---

# pi-presets — AGENTS.md

## Purpose

Global `/preset` engine. Named job tool sets stay in JSON files, not in this package.

## Scope

- `src/config.ts` — parse/merge/load
- `src/preset.ts` — Pi extension UI and apply/restore
- `test/` — merge and parse tests

## Rules

- Keep the package project-agnostic. No Melon Labs names, no Grok/GPT tool lists.
- Project preset names replace the whole global object; do not field-merge.
- `tools` replaces the active set. Unknown names warn and are skipped.
- Do not add a recipe registry or install tools from a preset.

## Commands

```bash
npm test --workspace=packages/pi-presets
npm run typecheck --workspace=packages/pi-presets
```

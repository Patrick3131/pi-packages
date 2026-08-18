---
owner: repo-maintainers
last_verified: 2026-08-17
applies_to: packages/pi-xai-defaults/**
inherits_from: ../../AGENTS.md
canonical_for: pi-xai-defaults package conventions
---

# pi-xai-defaults — AGENTS.md

## Purpose

Default-on hook for billed `pi-xai-oauth` extras on Grok models.

## Rules

- Do not register tools. Only drive `/xai-tools` through the official bridge.
- Do not enable extras on non-xAI providers.
- Honor `~/.pi/agent/xai-defaults.json` and `<cwd>/.pi/xai-defaults.json`.
- Tool flags must be JSON booleans (`true` / `false`), never `0` / `1`.
- Local Grok adapters stay owned by `pi-xai-oauth`.

## Commands

```bash
npm test --workspace=packages/pi-xai-defaults
npm run typecheck --workspace=packages/pi-xai-defaults
```

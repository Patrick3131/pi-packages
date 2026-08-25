---
owner: repo-maintainers
last_verified: 2026-08-19
applies_to: packages/pi-keepalive/**
inherits_from: ../../AGENTS.md
canonical_for: pi-keepalive package conventions
---

# pi-keepalive — AGENTS.md

## Purpose

Generic delayed retry/keepalive extension. It sends a configurable user message
without inspecting or depending on any provider or model.

## Rules

- Default behavior is `on-error`: do not generate periodic traffic during an ordinary idle session.
- Only send when Pi reports the agent is idle; never interrupt an active turn.
- Stop timers on `session_shutdown`.
- Keep provider-specific routing and credentials out of this package.

## Commands

```bash
npm test --workspace=packages/pi-keepalive
npm run typecheck --workspace=packages/pi-keepalive
```

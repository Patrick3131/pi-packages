---
owner: repo-maintainers
last_verified: 2026-08-17
applies_to: packages/pi-xai-defaults/**
inherits_from: ../../CONTEXT.md
canonical_for: pi-xai-defaults architecture
---

# pi-xai-defaults — Context

`pi-xai-oauth` clears network extras on `session_start`. This package
reads `xai-defaults.json` (global, then project) and re-enables tools
set to `true` through `pi.events` channel `pi-clickable-menu:xai-tools`.

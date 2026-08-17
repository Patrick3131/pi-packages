---
owner: repo-maintainers
last_verified: 2026-08-13
applies_to: packages/pi-tools/**
inherits_from: ../../CONTEXT.md
canonical_for: pi-tools architecture
---

# pi-tools — Context

Wraps Pi's example `/tools` UI as an installable package so restore and
day-to-day setup use `pi install`, same as `pi-presets` and `pi-searxng`.

The picker shows each tool's description and can expand source / parameters
with `i`. `/tools print [name]` writes a session-only dump via `tools-print`.
Saved `tools-config` snapshots keep explicit disables, but tools that appear
later stay enabled so late registrations are not shown as off.

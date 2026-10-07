---
owner: repo-maintainers
last_verified: 2026-10-05
applies_to: packages/pi-toolkit/**
inherits_from: ../../../../CONTEXT.md
canonical_for: pi-tools architecture
---

# pi-tools — Context

`<cwd>/.pi/tools.json` is the project default tool map. Session start applies
an existing file. A missing file is created on first `/tools` open, `/tools
save`, or `before_agent_start`. `/tools` toggles stay in memory. `s` writes
the current session set.

Reconciliation removes defaults for names absent from the full registered catalog
and adds newly registered names as `false`, preserving current tools' saved values.
Session start, agent turns and the TUI picker persist additions and removals;
saving writes only the current catalog. Disabled tools remain registered and keep
their defaults. A temporarily unregistered tool loses its preference and defaults
to `false` if it returns.

---
owner: repo-maintainers
last_verified: 2026-08-17
applies_to: packages/pi-tools/**
inherits_from: ../../CONTEXT.md
canonical_for: pi-tools architecture
---

# pi-tools — Context

`<cwd>/.pi/tools.json` is the project default tool map. Session start applies
an existing file. A missing file is created on first `/tools` open, `/tools
save`, or `before_agent_start`. `/tools` toggles stay in memory. `s` writes
the current session set.

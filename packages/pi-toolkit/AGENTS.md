---
owner: repo-maintainers
last_verified: 2026-10-07
applies_to: packages/pi-toolkit/**
inherits_from: ../../AGENTS.md
canonical_for: Toolkit working agreements
---

# Pi Toolkit

Four independently filterable extension entry points; no aggregate entry point
that registers all features twice. Preserve relative preset/tools/mentions hook
order and existing commands, shortcuts, flags, config paths, and preset-state.
Keep detailed feature rules in src/features/*/AGENTS.md.

Overview is read-only except private report output and optional browser opening.
Collect metadata by allowlisted projection: no auth.json, credential methods,
raw config dumps, parameter defaults, network probes, extension imports, session
entries, or writes to settings. Render all dynamic content as inert text.
Optional API gaps must be unknown; configuration is not runtime proof.
Use the active branch for overview's recorded preset evidence, not abandoned
branches. Keep consumer migration in configs/global, not the overview command.

Tests/typecheck: npm run test/typecheck --workspace=packages/pi-toolkit.
Migrated tests retain coverage; don't recreate copy/structure-only assertions.

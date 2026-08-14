---
owner: repo-maintainers
last_verified: 2026-08-13
applies_to: packages/pi-presets/**
inherits_from: ../../CONTEXT.md
canonical_for: pi-presets architecture
---

# pi-presets — Context

The official Pi example extension is packaged here so it can be installed globally.

```
pi-presets
├── src/config.ts     parse, merge, path helpers
├── src/preset.ts     /preset, --preset, cycle, restore
└── JSON elsewhere    ~/.pi/agent/presets.json and <repo>/.pi/presets.json
```

Apply path:

1. `session_start` loads global then project JSON
2. `--preset` or `/preset` snapshots current model/thinking/tools once
3. `setModel` / `setThinkingLevel` / `setActiveTools` as specified
4. `before_agent_start` appends `instructions`
5. `(none)` restores the snapshot

This is session workflow control, not capability installation.

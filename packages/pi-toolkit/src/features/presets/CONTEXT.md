---
owner: repo-maintainers
last_verified: 2026-08-13
applies_to: packages/pi-toolkit/**
inherits_from: ../../../../CONTEXT.md
canonical_for: pi-presets architecture
---

# pi-presets — Context

The official Pi example extension is packaged here so it can be installed globally.

```
pi-presets
├── src/config.ts     parse, merge, path helpers
├── index.ts     /preset, --preset, cycle, restore
└── JSON elsewhere    ~/.pi/agent/presets.json and <repo>/.pi/presets.json
```

Apply path:

1. `session_start` loads global then project JSON
2. `--preset` or `/preset` snapshots current model/thinking/tools once
3. `setModel` / `setThinkingLevel` / `setActiveTools` as specified
4. `before_agent_start` appends `instructions`
5. `(none)` restores the snapshot

The active preset is recorded as a `preset-state` custom entry on every change.
`pi-tools` reads that entry to know a preset owns the tool set and to leave
`.pi/tools.json` alone. Both features read it from the **current branch**
(`sessionManager.getBranch()`): an entry left on an abandoned branch is not
evidence about this session, and restoring from it would apply a preset the
current branch never chose.

## Runtime handshake

`applyPreset` lives in this module's closure, so another feature cannot import
it. The extension publishes `{ names, apply }` through `src/registry.ts` when the
factory runs and clears it on `session_shutdown`. The only consumer is `$preset:`
in inline actions, which reports "the presets feature is not loaded" when the
lookup returns undefined. That keeps the feature entry points independently
filterable without duplicating config loading or `preset-state` bookkeeping.

This is session workflow control, not capability installation.

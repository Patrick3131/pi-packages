# pi-presets

Pi package that adds named **job** presets. The package is only the engine. Preset contents live in JSON files.

## What it does

Loads and merges:

- `~/.pi/agent/presets.json` (global / personal)
- `<cwd>/.pi/presets.json` (project; same name replaces the whole global preset)

Then applies a named preset:

- optional `provider` + `model`
- optional `thinkingLevel`
- optional `tools` (replaces the active set; unknown names are skipped)
- optional `instructions` appended to the system prompt

Commands:

- `pi --preset plan`
- `/preset`
- `/preset implement`
- `Ctrl+Shift+U` to cycle
- `(none)` restores the snapshot taken before the first preset

This package does not install tools. A preset can only enable tools already loaded in the current Pi process.

Do not put vendor-specific Grok adapters (`xai_*`) in presets. Leave those to `pi-xai-oauth` when switching models.

## Install

Global (recommended for the engine):

```bash
pi install /absolute/path/to/pi-packages/packages/pi-presets
```

After a machine restore, install the same local path again. Do not install this package project-locally unless you intentionally want only one repo to have `/preset`.

## Config

Example global `~/.pi/agent/presets.json`:

```json
{
  "plan": {
    "thinkingLevel": "high",
    "tools": ["read", "grep", "find", "ls"],
    "instructions": "Planning only. Do not edit."
  },
  "implement": {
    "thinkingLevel": "medium",
    "tools": ["read", "bash", "edit", "write", "grep", "find", "ls", "subagent", "subagent_wait"]
  }
}
```

Project files override by name, not by field. If Melon replaces `plan`, it must include every field it wants.

## Resume

`/resume` restores the preset name and instructions. It does not re-apply model or tools. Start with `pi --preset implement` when the tool set must be guaranteed.

---
owner: repo-maintainers
last_verified: 2026-10-18
applies_to: packages/pi-toolkit/src/features/tools/**
inherits_from: ../../../AGENTS.md
canonical_for: pi-tools package conventions
---

# pi-tools — AGENTS.md

## Purpose

`/tools` picker plus project `.pi/tools.json` defaults.

## Rules

- `.pi/tools.json` is input only. No lifecycle event (`session_start`,
  `before_agent_start`, picker open, print) may write or create it.
- Only `s` / `/tools save` writes, and that write is a merge: rewrite the tools
  this session registers, preserve every other key byte-for-byte.
- Never append freshly registered names as `false`, and never prune names the
  current catalog lacks. Absence means unknown, never "removed".
- A name the file does not mention keeps Pi's native choice. Applying the file
  only turns mentioned tools on or off; it is never a whole-catalog denylist.
- A delegated child session (`ctx.sessionManager.getHeader()?.parentSession`)
  neither applies nor saves project preferences; it receives its tools from the
  agent that launched it.
- A malformed file is reported and refused, not replaced.
- Apply defaults only to a fresh session: skip when a preset owns the tool set
  (`preset-state` on the current branch via `getBranch`) or the transcript
  already declares a loadout.
- Status shown in the picker and print comes from Pi: `exposure` separates
  declared, indirectly reachable, and hidden tools, and toggles are read back
  from `getActiveTools()` rather than assumed.
- Do not call `getActiveTools` / `setActiveTools` during module load.
- Print dumps go through `appendEntry("tools-print")`.
- Job lists stay in `presets.json`.

## Commands

```bash
npm test --workspace=packages/pi-toolkit
npm run typecheck --workspace=packages/pi-toolkit
```

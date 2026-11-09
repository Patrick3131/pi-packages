---
owner: repo-maintainers
last_verified: 2026-11-09
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
- Only `Ctrl+S` / `/tools save` writes, and that write is a merge: rewrite the
  declared-switch tools this session registers (`direct`, `model-only`), preserve
  every other key byte-for-byte.
- The picker is `shared/searchable-picker.ts` in toggle mode. Typing always
  filters; no printable letter is an action. `?` expands details, `Ctrl+S` saves,
  Enter/Space activate selectable rows without closing; section headings and
  read-only rows are ignored. `Tab`/`Shift+Tab` cycle all/active/inactive;
  active/inactive contain only declared-switch rows. Esc closes.
- Never append freshly registered names as `false`, and never prune names the
  current catalog lacks. Absence means unknown, never "removed". A `codemode`,
  `deferred`, or `hidden` tool gets no entry at all: its reachability is exposure,
  not this file.
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
  declared, indirectly reachable, and hidden tools. Only declared tools are
  toggleable; indirect tools appear in a read-only section with their exposure as
  a badge, and hidden tools are omitted and counted. Toggles are read
  back from `getActiveTools()` rather than assumed.
- Filter state is session-local and never saved. It is derived from the read-back
  active set, so a toggle that changes membership immediately re-applies the view.
- A section heading or `selectable: false` row is overview only: never save it,
  never treat activation as a decision, and keep it out of the non-TUI selector.
- Do not call `getActiveTools` / `setActiveTools` during module load.
- Print dumps go through `appendEntry("tools-print")`.
- Job lists stay in `presets.json`.

## Commands

```bash
npm test --workspace=packages/pi-toolkit
npm run typecheck --workspace=packages/pi-toolkit
```

Explicit CLI --tools/--exclude-tools/--no-tools selection owns startup ahead of
project defaults. Discovery uses native defaultActive; no lifecycle filter.

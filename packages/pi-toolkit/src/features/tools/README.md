> Feature of [pi-toolkit](../../../README.md); no separate installation needed.

# pi-tools

Pi package that registers `/tools` and project tool defaults.

## Project defaults

`<cwd>/.pi/tools.json` is a map of **decisions you made**, e.g.:

```json
{
  "read": true,
  "bash": true,
  "web_search_searxng": false,
  "agent_browser": false
}
```

- Names are the full `/tools` registry names; values must be `true` or `false`.
- The file is read, never reconciled. Nothing about starting, resuming, or
  using a session rewrites it; only an explicit save does.
- A name the file does not mention keeps Pi's normal behavior for that session.
  Names set to `true` are enabled and names set to `false` are disabled when the
  file is applied.
- If a tool is not registered in the current session — a restricted tool list, an
  MCP server that has not connected yet, an extension that failed to load, or a
  delegated subagent session — the file is left alone. Nothing is deleted or
  flipped, and `/tools print` lists saved names it cannot see here as
  unavailable.
- A missing file is not created until you save. A malformed file is reported and
  refused rather than replaced.

## Session vs defaults

| Action | Effect |
| --- | --- |
| Enter/Space in `/tools` | This session only |
| `s` in `/tools` | Merge the current session set into `.pi/tools.json` |
| `/tools save` | Same as `s` |
| New session / `/preset` → `(none)` | Read `.pi/tools.json` |

Saving updates only the tools that session registers and preserves every other
key, so saving from a smaller catalog cannot drop preferences it cannot see.
Other sessions are unaffected until they read the file.

Defaults are applied to a fresh session only. A session that already has a tool
set — resumed, forked, reloaded, or owned by a preset — keeps it, and a
delegated subagent session never reads or writes project preferences.

## Status reporting

`/tools` and `/tools print` show how Pi says each tool can be reached rather than
a plain on/off:

- `enabled` / `disabled` — declared to the model, or not.
- `inactive (indirect via codemode|deferred)` — not declared, but still callable
  from `codemode` scripts or `tool_search`.
- `unavailable (hidden)` — registered but unreachable; it cannot be toggled on.

Toggles are read back from Pi after a change, so a tool that cannot be activated
is never reported as enabled.

## Commands

- `/tools` — picker. `i` expands details. `s` merges project defaults.
- `/tools print` / `/tools print crawl` — transcript dump, not sent to the model
- Bare `/tools` opens the interactive picker in the TUI and automatically
  prints the catalog in non-TUI clients such as Pi Web.
- `/tools save` — merge the current session set into `.pi/tools.json`

## Install

```bash
pi install git:github.com/Patrick3131/pi-packages
```

Do **not** also keep `~/.pi/agent/extensions/tools.ts`.

# pi-tools

Pi package that registers `/tools` and project tool defaults.

## Project defaults

`<cwd>/.pi/tools.json` is the restart default for this repo. Example:

```json
{
  "read": true,
  "bash": true,
  "web_search_searxng": false,
  "xai_generate_image": true,
  "xai_image_to_video": false
}
```

- Names are the `/tools` registry names (`xai_grok_read_file`, not `read_file`).
- Values must be `true` or `false`.
- A missing file is created on first `/tools` open, `/tools save`, or the first agent turn. Live-active tools seed as `true`; everything else is `false`.
- Tools that appear later are appended as `false`. Existing keys are never rewritten automatically.

## Session vs defaults

| Action | Effect |
| --- | --- |
| Enter/Space in `/tools` | This session only |
| `s` in `/tools` | Write current session set to `.pi/tools.json` |
| `/tools save` | Same as `s` |
| New session / `/preset` → `(none)` | Reload `.pi/tools.json` |

Other sessions are unchanged until you save.

## Commands

- `/tools` — picker. `i` expands details. `s` saves project defaults.
- `/tools print` / `/tools print crawl` — transcript dump, not sent to the model
- Bare `/tools` opens the interactive picker in the TUI and automatically
  prints the catalog in non-TUI clients such as Pi Web.
- `/tools save` — write `.pi/tools.json`

## Install

```bash
pi install /absolute/path/to/pi-packages/packages/pi-tools
```

Do **not** also keep `~/.pi/agent/extensions/tools.ts`.

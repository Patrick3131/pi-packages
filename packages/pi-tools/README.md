# pi-tools

Pi package that registers the official `/tools` command.

This is the Pi example extension (`examples/extensions/tools.ts`), packaged so
it can be installed the same way as `pi-presets` instead of copying a loose
file into `~/.pi/agent/extensions/`.

## What it does

- `/tools` lists every registered tool in this session
- the selected row shows a one-line description; press `i` for source, parameters, and guidelines
- enable/disable updates `pi.setActiveTools`
- the selection is stored on the current session branch as `tools-config`
- tools that appear after that snapshot (for example Grok adapter tools) stay enabled if they are already active
- `/tools print` dumps every tool into the session transcript
- `/tools print crawl` dumps matching tools (prefix or loose name match)
- print output uses `appendEntry` (`tools-print`), so it is **not** sent to the model
- `/tools print` arguments autocomplete: `print`, then tool names

It does not add tools. Packages such as `pi-searxng` still have to be installed.

## Install

```bash
pi install /absolute/path/to/pi-packages/packages/pi-tools
```

Do **not** also keep `~/.pi/agent/extensions/tools.ts`. Two copies will both
try to register `/tools`.

## Restore

`configs/global/restore.sh` installs this package. It no longer copies a
standalone `tools.ts`.

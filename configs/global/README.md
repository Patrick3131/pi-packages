# Global Pi restore snapshot

Sanitized copy of the personal Pi coding-agent setup. This is **not** a published package.

## What is here

| File | Restores to |
| --- | --- |
| `settings.json` | `~/.pi/agent/settings.json` |
| `presets.json` | `~/.pi/agent/presets.json` |
| `xai-defaults.json` | `~/.pi/agent/xai-defaults.json` |

`settings.json` includes default model/theme/thinking, plus the npm packages
`pi-subagents`, `pi-xai-oauth`, and `pi-goal`. It does **not** include secrets.

Local checkout packages are installed by `restore.sh`, not listed in the snapshot
JSON (Pi rewrites those as machine-relative paths):

- `packages/pi-presets` — `/preset` engine
- `packages/pi-tools` — `/tools` command
- `packages/pi-searxng` — `web_search_searxng` (off by default)
- `packages/pi-xai-defaults` — default-on xAI extras for Grok (install after `pi-xai-oauth`)

Restore removes a leftover `~/.pi/agent/extensions/tools.ts` so `/tools` is
not registered twice.

## Restore

```bash
./configs/global/restore.sh
# replace differing files after a backup:
./configs/global/restore.sh --force
```

The script never copies `auth.json`, sessions, `trust.json`, or npm/git caches. Log in again with `/login` on a new machine.

Orca-only extensions (`orca-*.ts`, `minimal-mode.ts`) are not part of this snapshot.

## After restore

1. Restart Pi or `/reload`
2. `/login xai-auth` if credentials are missing
3. `/preset` and `/tools` should exist

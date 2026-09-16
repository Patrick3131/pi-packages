# Global Pi restore snapshot

Sanitized copy of the personal Pi coding-agent setup. This is **not** a published package.

## What is here

| File | Restores to |
| --- | --- |
| `settings.json` | `~/.pi/agent/settings.json` |
| `presets.json` | `~/.pi/agent/presets.json` |

`settings.json` includes the default provider/model (`opencode-go` /
`deepseek-v4.1-flash`), theme, and thinking level, plus the npm packages
`pi-subagents`, `pi-goal`, and `pi-compact`. It does **not** include secrets.

Melon packages are installed as one Git-backed package. The global package
entry excludes `packages/pi-work/skills/**`: Melon repositories already carry
their canonical workflow skills under `.agents/skills`, and loading both
locations would produce skill-name collisions. The package still provides:

- `packages/pi-presets` — `/preset` engine
- `packages/pi-tools` — `/tools` command
- `packages/pi-searxng` — `web_search_searxng` (off by default)
- `packages/pi-keepalive` — delayed provider-error retries
- `packages/pi-crawl4ai` — `crawl` / `crawl_read`
- `pi-compact` — proactive context compaction at completed turn boundaries

Restore removes a leftover `~/.pi/agent/extensions/tools.ts` so `/tools` is
not registered twice. On managed remote hosts, `pi-init` uses `--force` so the
sanitized package policy remains authoritative without touching auth or
session state.

## Retired packages

Restore strips these from `~/.pi/agent/settings.json` if an older snapshot
installed them, and deletes `~/.pi/agent/xai-defaults.json`:

- `npm:pi-xai-oauth` — xAI/Grok provider credentials and `xai_*` tools
- `packages/pi-xai-defaults` — the removed default-on xAI extras extension

The machine's default provider is now `opencode-go`. Nothing in this snapshot
references xAI, Grok, or OpenRouter.

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
2. `/login opencode-go` if credentials are missing
3. `/preset` and `/tools` should exist

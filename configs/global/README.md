# Global Pi restore snapshot

Sanitized copy of the personal Pi coding-agent setup. This is **not** a published package.

## What is here

| File | Restores to |
| --- | --- |
| `settings.json` | `~/.pi/agent/settings.json` |
| `presets.json` | `~/.pi/agent/presets.json` |

`settings.json` includes the default provider/model (`opencode-go` /
`deepseek-v4.1-flash`), theme, and thinking level, plus the npm packages
`pi-subagents`, `pi-goal`, `pi-compact`, and `pi-open-tui`. It does **not**
include secrets.

`pi-open-tui` is a third-party TUI-only extension: branded startup header,
Starship-style footer (git working-tree state, runtime, context bar, tokens,
cost), framed editor, turn telemetry (TPS/TTFT/stalls), and the thinking peek
ticker that replaces Pi's hidden `Thinking...` label. It only activates in
interactive TUI sessions and leaves print/RPC modes untouched.

Its own settings live in `~/.pi/agent/open-tui.json`, which this snapshot does
not restore, so a fresh machine starts from the extension's defaults (all
footer segments on, telemetry on, thinking peek at one line). Tune with
`/open-tui`; disable the extension entirely for a session by setting
`enabled: false` there instead of removing the package.

Melon packages are installed as one Git-backed package. The global package
entry excludes `packages/pi-work/skills/**`: Melon repositories already carry
their canonical workflow skills under `.agents/skills`, and loading both
locations would produce skill-name collisions. The package still provides:

- `packages/pi-presets` — `/preset` engine
- `packages/pi-tools` — `/tools` command
- `packages/pi-searxng` — `web_search_searxng` (off by default)
- `packages/pi-keepalive` — delayed provider-error retries
- `packages/pi-crawl4ai` — `crawl` / `crawl_read`
- `packages/pi-skill-mentions` — `$<name>` mentions with `$` autocomplete, so one message can load several skills
- `packages/pi-delegation` — standing delegation policy, appended to the
  system prompt only when the `subagent` tool is active in the session
- `pi-compact` — proactive context compaction at completed turn boundaries

Restore removes a leftover `~/.pi/agent/extensions/tools.ts` so `/tools` is
not registered twice. On managed remote hosts, `pi-init` uses `--force` so the
sanitized package policy remains authoritative without touching auth or
session state.

## Delegation policy

`packages/pi-delegation` carries the standing delegation policy (route plans,
work items, document review, and wide read-only reconnaissance to the appropriate
agents; keep small sequential edits, credentialed work, and anything whose review
costs as much as the work with the parent).

It is a package extension rather than an `APPEND_SYSTEM.md` entry on purpose:

- it appends **only** when the `subagent` tool is active, so a preset without
  subagents is untouched and nothing is injected where delegation is impossible;
- it never runs outside Pi, so no Pi-specific instruction leaks into a
  repository's `AGENTS.md`, which Codex and Claude Code also read;
- it is idempotent, so keeping a personal `APPEND_SYSTEM.md` copy of the same
  policy would not duplicate it;
- it updates with `pi update --extensions` instead of needing a restore step.

Tune the text in `packages/pi-delegation/src/guidance.ts`. The heading is also the
duplication marker, so change the text and the heading together.

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

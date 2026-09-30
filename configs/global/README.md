# Global Pi restore snapshot

Sanitized copy of the personal Pi coding-agent setup. This is **not** a published package.

## What is here

| File | Restores to |
| --- | --- |
| `settings.json` | `~/.pi/agent/settings.json` |
| `presets.json` | `~/.pi/agent/presets.json` |
| `APPEND_SYSTEM.md` | `~/.pi/agent/APPEND_SYSTEM.md` |
| `mcp.json` | `~/.pi/agent/mcp.json` |
| `mcp-policy.ts` | `~/.pi/agent/extensions/mcp-policy.ts` |
| `subagent.json` | `~/.pi/agent/extensions/subagent/config.json` |
| `worktree-setup.mjs` | `~/.pi/agent/extensions/subagent/worktree-setup.mjs` |

`settings.json` includes the default provider/model (`opencode-go` /
`deepseek-v4.1-flash`), theme, and thinking level, plus the npm packages
`pi-subagents`, `pi-goal`, and `pi-open-tui`. It
does **not** include secrets.

`mcp.json` configures native MCP with no global servers and disables automatic
codemode activation. Server endpoints belong in the trusted project's `.pi/mcp.json`.
`mcp-policy.ts` is copied to `~/.pi/agent/extensions/mcp-policy.ts`; it gates
all native MCP calls, including codemode's nested calls, by the active branch's
preset. A project opts in with `.pi/mcp-policy.json`:

```json
{ "presets": { "implement": "write", "ops": "write", "agency-research": "read" } }
```

Missing/malformed policy and unlisted presets block MCP. Unknown tool annotations
are treated as writes. Writes require interactive approval; headless sessions
fail closed. MCP resource calls are read-only. Native OAuth credentials remain
in `mcp-auth.json` and are never part of the snapshot.

`subagent.json` holds the `pi-subagents` extension config that is not secret:
the worktree setup hook path and its timeout. `pi-subagents` reads this file
from `~/.pi/agent/extensions/subagent/config.json`, so it is machine state
rather than package state and cannot live in a Pi package. A hook path that
starts with `~/` is expanded against the home directory, which is why the
restored copy works from any repository.

`worktree-setup.mjs` is that hook: it mirrors a repository's dependency tree
into a newly created managed worktree so `worktree: true` subagent lanes can
run tests in isolation. It re-points npm workspace links at the worktree copy
instead of the main checkout, because following the main checkout's link would
let a lane test code it is not editing. Repositories without a root
`package.json`, or without `node_modules`, are a no-op. Test it with
`npm run test:configs`.

Optional keys for `subagent.json`, unset by default: `worktreeBaseDir` moves the
managed worktree root (`~/.pi/worktrees` keeps them out of the code parent
directory), and `worktreeProvider` forces `native` or `worktrunk` instead of the
`auto` default. Anything else Pi-specific about child models belongs in
`settings.json` under `subagents`, not here.

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
- `packages/pi-crawl4ai` — `crawl` / `crawl_read`
- `packages/pi-skill-mentions` — `$<name>` mentions with `$` autocomplete, so one message can load several skills
- `packages/pi-delegation` — standing delegation policy, appended to the
  system prompt only when the `subagent` tool is active in the session
- Native Pi — MCP, codemode, deferred tool search, and between-turn compaction

Restore removes a leftover `~/.pi/agent/extensions/tools.ts` so `/tools` is
not registered twice. On managed remote hosts, `paseo-init` uses `--force` so the
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
- `npm:pi-mcp-adapter` — superseded by native MCP
- `git:github.com/StanleyOneG/pi-compact` — superseded by native between-turn compaction
- `npm:@jmfederico/pi-web` — superseded by Paseo
- `packages/pi-keepalive` and `packages/pi-mcp-gate` — removed retry/adapter layers
- `packages/pi-xai-defaults` — the removed default-on xAI extras extension

The machine's default provider is now `opencode-go`. No active package or tool configuration enables xAI, Grok, or OpenRouter.

## Restore

Requires Pi 0.99.0 or newer (`pi update` upgrades Pi itself).

```bash
./configs/global/restore.sh
# replace differing files after a backup:
./configs/global/restore.sh --force
```

The script never copies `auth.json`, sessions, `trust.json`, or npm/git caches. Log in again with `/login` on a new machine.

Orca-only extensions (`orca-*.ts`) are not part of this snapshot. Restore removes
the obsolete `minimal-mode.ts` tool overrides.

## After restore

1. Restart Pi or `/reload`
2. `/login opencode-go` if credentials are missing
3. `/preset` and `/tools` should exist

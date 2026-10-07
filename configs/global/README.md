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
| `agents/*.md` | `~/.pi/agent/agents/*.md` |
| `worktree-setup.mjs` | `~/.pi/agent/extensions/subagent/worktree-setup.mjs` |

`settings.json` includes the default provider/model (`opencode-go` /
`deepseek-v4.1-flash`), theme, and thinking level, plus the npm packages
`pi-subagents`, `pi-goal`, `pi-open-tui`, and the search/edit stack
`@ff-labs/pi-fff` + `pi-tool-discipline` + `pi-better-edit`. It
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

The search/edit stack is three independent third-party extensions with
non-overlapping tool names, verified to load together:

- `@ff-labs/pi-fff` registers `ffgrep` and `fffind` — Rust/SIMD search that is
  pre-indexed at session start, frecency-ranked, and git-aware, with no `rg`/`fd`
  subprocess per call. It stays in its default `tools-and-ui` mode. Its fourth
  tool, `fff-multi-grep`, is gated behind `PI_FFF_MULTIGREP=1` upstream and is
  deliberately left off; the author ships it disabled because their tests found
  it harmful.
- `pi-tool-discipline` registers no tools. It activates the built-in
  `grep`/`find`/`ls` definitions so Pi stops emitting "Use bash for file
  operations like ls, rg, find" (that guideline is only suppressed when a tool
  with one of those exact names is active), and injects ffgrep/fffind-first
  guidance into the system prompt.
- `pi-better-edit` replaces `read` and `edit` with hash-anchored
  `HASH│content` line anchors (`read`, `read_skill`, `edit`,
  `undo_last_edit`) and guards `write` against reproduced anchor rows. Its
  `edit` needs an anchor served by its own `read`; an edit without one fails
  closed with `[E_UNKNOWN_ANCHOR]` and writes nothing.

A `--fff-mode=override` run renames the FFF tools to
`grep`/`find`/`multi_grep` instead. The snapshot keeps the default mode, where
`pi-tool-discipline` is what suppresses the bash file-operation guideline.

Shared packages are installed as one Git-backed package. Its three operator-only
work skills load from canonical `packages/pi-work/skills/`; `/work` embeds the
same source. Repositories own local scope, commands, permissions, architecture,
and feature-specific work paths, not copied generic workflow bodies.

Before activating this snapshot on any existing local or remote setup, inventory
same-name skills in all discovery roots and verify duplicate-free Pi and existing
non-Pi discovery before deleting consumer copies. See
`packages/pi-work/README.md` for user-level Codex links to the installed package's
three directories plus sibling `_shared`; no tracked absolute links, copies, or
new syncing are needed. The package provides:

- `packages/pi-work` — three shared operator skills and `/work`

- `packages/pi-toolkit` — `/preset`, `/tools`, `$` skill mentions, and My Pi HTML `/overview`; independently filterable feature entry points
- `packages/pi-searxng` — `web_search_searxng` (off by default)
- `packages/pi-crawl4ai` — `crawl` / `crawl_read`
- Toolkit feature paths are `packages/pi-toolkit/src/features/{presets,tools,skill-mentions,overview}/index.ts`.
- `packages/pi-delegation` — standing delegation policy, appended to the
  system prompt only when the `subagent` tool is active in the session
- Native Pi — MCP, codemode, deferred tool search, and between-turn compaction

Restore removes a leftover `~/.pi/agent/extensions/tools.ts` so `/tools` is
not registered twice. On managed remote hosts, `paseo-init` uses `--force` only for fresh settings;
persisted settings use narrow migration. Neither path copies auth or session
state. Agents-only restore is available independently for persisted hosts.


## Toolkit cutover

Preview global settings reference changes (no project scanning or credential reads):

```bash
python3 configs/global/migrate-toolkit.py
python3 configs/global/migrate-toolkit.py --apply
# Remote filesystem, when invoked under the existing Paseo user/lock boundary:
python3 configs/global/migrate-toolkit.py --agent-dir /data/pi-agent
```

For a published package update plus migration on both configured consumers, use `./scripts/pi-sync --toolkit-only --check`, then `--toolkit-only --apply`. This path preserves presets, models, MCP config, credentials, sessions, and all other consumer settings. Do not use full restore `--force` or `--accept-config` just for toolkit migration. Fresh/full restore applies the narrow mapper before legacy normalization; standalone custom-policy conflicts fail for explicit review.

Backups are private `settings.json.toolkit-backup-<timestamp>` files, created only when settings actually change. Repeat apply is a no-op. To preview a targeted rollback, pass `--rollback <backup>`; add `--apply` to restore only migrated fields. Later edits to those fields cause refusal; other personal settings are retained. Pair rollback with the previously recorded shared-package revision to avoid old paths against new source. No cache deletion, project edits, or restart is automated.

## Custom agent definitions

`agents/` is the canonical backup for reusable custom Pi subagents, currently
`web-researcher`. Install these in user scope so every repository can use them.
Keep business/project-specific specialists in the owning repository’s `.pi/agents/`.
Do not copy bundled worker/reviewer/researcher agents or revive retired work-phase
agents; use builtin settings overrides for simple builtin customizations.

Update only these definitions, without touching personal settings, credentials,
subagent configuration or package installations:

```bash
./configs/global/restore.sh --agents-only
# Replace a differing installed definition only after review; backup is automatic:
./configs/global/restore.sh --agents-only --force
```

Fresh/full restore includes the same definitions. Existing differing files are
retained unless `--force` is explicit; unrelated custom agents are never deleted.
`pi update --extensions` updates this source checkout, **not** the installed agent
files: run the agents-only restore from that checkout, then `/reload` or start a
fresh Pi session. On remote hosts, set `PI_CODING_AGENT_DIR=/data/pi-agent`.
Verify user-scope discovery before deleting an identical project copy; retain
intentional project-specific variants rather than replacing them by name alone.
The researcher uses the host’s enabled search/crawl extensions; its `tools` list
is an allowlist, not a provider installer. It also names the package’s bounded
`crawl4ai.scrape`, `crawl4ai.crawl`, and `crawl4ai.extract` specialists so it can
recommend one to its caller, but it has no subagent tool and cannot run them:
the parent verifies provider availability and authorization, passes exact saved
paths to reuse existing evidence, and treats the recommendation as a bounded
handoff, not delegated work. Routine reads stay direct; CLI-based nested agent
launches are not an alternative.
This is a Pi subagent definition, not a Codex skill or a cross-host agent
registration.

## Delegation policy

`packages/pi-delegation` carries the standing delegation policy: work directly
by default; only request/instruction-authorized delegation uses bounded existing
builtin roles and fresh concise evidence. Available tools alone do not authorize
it. Keep small sequential edits, credentialed work, decisions, verification,
acceptance, and publication with the parent. No project phase agents or required
scripted workflows are introduced.

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

Without `--force`, differing existing settings are retained, then the existing
package normalization removes only the exact obsolete
`!packages/pi-work/skills/**` skill filter from the canonical Git source object.
Other skill filters and settings survive; a consumed old filter list loses its
`skills` key (omitting it enables package skills), while a pre-existing `skills: []`
continues to mean deliberately disabled. New or string-form Git entries no longer
receive the old filter. Existing retired-package/keepalive normalization remains
unchanged. Repeat restore is stable for settings.

For an authorized persisted-settings cutover without snapshot replacement:

```bash
PI_CODING_AGENT_DIR=/data/pi-agent ./configs/global/restore.sh --migrate-work-skills
# Locally, omit PI_CODING_AGENT_DIR to use ~/.pi/agent.
```

`--migrate-work-skills` runs alone, requires only Python 3, backs up settings
before changing them, removes only the exact old filter from canonical Git
source objects, and exits. It does not install/update packages, edit other
settings values, copy snapshot files, alter subagent config, or touch installed
checkout/lockfiles. Missing settings and already-migrated settings are no-ops;
repeat runs neither rewrite settings nor add backups. Malformed JSON fails
before changing anything. It cannot be combined with `--force`.

`--force` still replaces differing snapshot files after backups; do not use it
over personal settings just for this cutover. Remote `paseo-init` consumes
restore, but updating extensions alone does not migrate persisted skill filters.
The update/init caller can invoke migration-only mode after the authorized package
update; then reload/start fresh and verify actual discovery on every affected
installation.
Publication, live local/remote activation, consumer removal, and runtime smoke
checks are separate gates; this source snapshot does not prove they happened.
On failure retain consumer resources and restore only the targeted setting from
its backup to avoid dual discovery or unrelated preference rollback.

Orca-only extensions (`orca-*.ts`) are not part of this snapshot. Restore removes
the obsolete `minimal-mode.ts` tool overrides.

## After restore

1. Restart Pi or `/reload`
2. `/login opencode-go` if credentials are missing
3. `/preset` and `/tools` should exist

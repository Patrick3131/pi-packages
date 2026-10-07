# pi-packages

A monorepo of [Pi](https://github.com/earendil-works/pi) extensions distributed as a Git package.

## Packages

| Package | Description | Distribution |
|---------|-------------|--------------|
| [pi-crawl4ai](./packages/pi-crawl4ai) | Remote browser crawling, file-first reads, BM25 and optional Trafilatura/agents; server-managed egress | Git package |
| [pi-work](./packages/pi-work) | Detailed planning, optional parallel sliced implementation/integration, safe work-note cleanup, scaffold, and `/work` wizard | Git package |
| [pi-delegation](./packages/pi-delegation) | Standing delegation policy, injected only in sessions that can delegate | Git package |
| [pi-toolkit](./packages/pi-toolkit) | Everyday utilities: `/tools`, `/preset`, `$skill-name` mentions, and My Pi HTML `/overview` | Git package |
| [pi-recap](./packages/pi-recap) | Session recap as user questions with short, expandable answers (`/recap`, `/user-messages`) | Git package |
| [pi-searxng](./packages/pi-searxng) | Self-hosted SearXNG as `web_search_searxng` | Git package |
| [paseo-melon](./paseo-melon) | Paseo workspace panel driving `melon-worktree` and `melon-preview` for Melon task worktrees | Paseo plugin |

## Installation

### Install the complete Melon package repository

Pi can manage this monorepo as one unpinned Git package. This installs the Melon extensions and the `pi-work` skills declared
by the root manifest. With pi-subagents installed, `pi.subagents.agents` also exposes
`crawl4ai.scrape`, `crawl4ai.crawl` and `crawl4ai.extract`: inherited model,
strict `crawl`/`crawl_read` tools, no bash or nested delegation. Discovery does not
automatically load a foreground child's tool provider; see the
[child setup guide](./packages/pi-crawl4ai/README.md#optional-agents).
The Paseo plugin is installed separately with
`paseo plugin add Patrick3131/pi-packages:paseo-melon`:

```bash
pi install git:github.com/Patrick3131/pi-packages
```

Update it together with third-party Pi packages, then hot-reload the active
session:

```bash
pi update --extensions
# In Pi: /reload
```

This is the deployment and normal workstation setup. Local paths are reserved
for development of an extension before it is pushed.


### Toolkit migration

`pi-toolkit` replaces the former tools/presets/skill-mentions workspaces inside the same Git package. Commands, preset files, tools.json, and skill syntax are unchanged; its four feature entry points remain independently filterable.

After publishing the verified commit, preview then apply only the toolkit cutover (local global Pi and the configured remote runtime):

```bash
./scripts/pi-sync --toolkit-only --check
./scripts/pi-sync --toolkit-only --apply
# Local global target only:
./scripts/pi-sync --toolkit-only --local-only --check
```

This does not copy shared presets or replace unrelated config. It maps verified old feature references with private timestamped backups, preserves custom feature filters, and refuses ambiguous patterns. Reload/start fresh and check `/tools`, `/preset`, `$` mentions, and `/overview` once per target. The remote report is a file on the remote host; no web server is started. See [toolkit migration and rollback](./packages/pi-toolkit/README.md#migration).
### Native MCP and compaction

Requires Pi 0.99.0 or newer. Pi owns MCP connections, codemode, tool discovery,
and between-turn compaction.

`configs/global/mcp-policy.ts` is restored as a personal extension. Project
`.pi/mcp-policy.json` explicitly grants MCP access by preset; nested codemode
calls use the same permission checks. Reads are free, writes require an
interactive confirmation, and unlisted presets cannot call MCP.

### Crawling and runtime limits

Crawls save complete bodies by default, including small pages, and return
exact paths for `crawl_read`. Explicit inline previews are bounded; `save: false`
is the no-write opt-out and forfeits omitted-content recovery. BM25 retains
pre-filter source, including valid empty selections. Optional Trafilatura uses
configured local Python (`CRAWL4AI_TRAFILATURA_PYTHON`, trafilatura>=2,<3) on
remote-rendered HTML and preserves raw HTML; native structure may be lost.

`/tools`, presets and explicit CLI/child allowlists own activation. `/crawl-status` checks health on demand,
not at startup. HTTP abort may not stop remote browser work. Stock Crawl4AI 0.9.4 rejects untrusted deep strategies. The operator-managed
`discovery-services` deployment supports a narrow bounded subset server-side
without relaxing SSRF/DNS pinning or operator-managed egress. Deep traversal is
non-streaming; other deployments may return actionable unsupported errors. See the
[package guide](./packages/pi-crawl4ai/README.md) for fixed caps, setup,
unsupported-error guidance and source recovery.

### UI extension

The global setup also installs [`pi-open-tui`](https://github.com/OldSuns/pi-open-tui),
a third-party TUI extension that replaces Pi's header, footer, and editor in
interactive sessions: startup banner, git/runtime/context footer, turn
telemetry (TPS, TTFT, stalls), and a thinking peek ticker in place of the hidden
`Thinking...` label.

It is UI-only and cosmetic; print and RPC sessions are unaffected. If a Pi
upgrade breaks it, set `enabled: false` in `~/.pi/agent/open-tui.json` or remove
`npm:pi-open-tui` from the package list — it never changes agent behavior.

### For Local Development

```bash
git clone https://github.com/Patrick3131/pi-packages.git
cd pi-packages
npm install
```

Keep the GitHub package in global settings for normal use. In this checkout only,
use project-local `.pi/settings.json` to disable that package's resources and load
the working tree instead:

```json
{
  "packages": [
    {
      "source": "git:github.com/Patrick3131/pi-packages",
      "extensions": [],
      "skills": [],
      "prompts": [],
      "themes": []
    },
    ".."
  ],
  "extensions": []
}
```

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Build single package
npm run build --workspace=packages/pi-crawl4ai

# Test every workspace and the restore snapshot
npm test

# Type check all
npm run typecheck
npm run typecheck:configs
```

## Restore a machine

```bash
./configs/global/restore.sh
```

That copies sanitized global settings, personal job presets, `/tools`, and the
`pi-subagents` worktree config plus its setup hook. It does not copy `auth.json`
or sessions. The hook is what lets subagent lanes run tests inside an isolated
worktree; see [configs/global/README.md](./configs/global/README.md) and test it
with `npm run test:configs`.

## Adding a New Package

1. Create directory: `packages/pi-<name>/`
2. Copy structure from `packages/pi-crawl4ai/`
3. Update `package.json` with new name and description
4. Add to the Packages table above

## Updating the Git package

Push changes to the repository, then update installed copies with:

```bash
pi update --extensions
# In Pi: /reload
```

For a pinned release, install a Git tag or commit:

```bash
pi install git:github.com/Patrick3131/pi-packages@<tag-or-commit>
```

## Sync local Pi and melon-remote

After testing and pushing shared changes, run from this checkout:

```bash
# Uses your existing authenticated Dokploy CLI configuration; no SSH exports.

./scripts/pi-sync --check
./scripts/pi-sync --apply
# Only after reviewing config differences:
./scripts/pi-sync --apply --accept-config
# Explicitly operate on the local global installation only:
./scripts/pi-sync --local-only --check
```

Requires Python 3, Git and Pi locally and in the Pi container, plus `gosu` and
`flock` in that container. Reads existing Dokploy CLI authentication (locates
`dokploy` on PATH), or `DOKPLOY_URL` + `DOKPLOY_API_KEY`/`DOKPLOY_AUTH_TOKEN`.
The URL must use HTTPS. No token is copied into tasks or logs. The CLI stores
its auth inside its npm installation: back it up securely before upgrading the
CLI, or use environment variables to avoid losing auth on npm upgrades.

The one configured remote target is Dokploy compose `_aUWwRNm5fjVkxzUFO4_J`
(`tools-remotecoding-wmvl3i`), service **`paseo`**, not `codex-paseo` or the SSH
workbench. The script verifies compose identity before use. If that deployment
is recreated, review/update the constants in `scripts/pi-sync-dokploy.py`.
Remote paths are `/data/pi-agent` and `/data/pi-runtime/bin`; local scope honors
`PI_CODING_AGENT_DIR`.

This command reads the **published** GitHub revision, not your unpushed working
copy. It checks both targets before applying, updates only the shared Git
package, verifies the installed commit, and reports reload requirements. It
never scans repositories, updates project-local packages, upgrades Pi or
third-party packages, pushes commits, deletes worktrees, or restarts sessions.
Remote operations use the same lock as Paseo startup/update and run as `paseo`.
Each remote check/apply creates a temporary **disabled** Dokploy task, manually
runs it via the corrected tRPC API envelope (bypassing the CLI query bug), and
requires both terminal `done` status and an exact per-run/revision completion
marker in the logs. The worker source is transmitted from this checkout, but
package/config content always comes from the selected published commit.
Verified tasks are deleted; failed/unverified tasks remain disabled for
inspection and their IDs are printed. No recurring schedule, sudo password,
SSH connection, container restart or deployment/redeploy is used.

Shared config is an explicit allowlist: package declarations in `settings.json`,
`presets.json`, `APPEND_SYSTEM.md`, MCP policy extension, worktree setup hook,
and custom agent definitions. Shared package declarations replace matching
entries; target-only packages and other settings keys are preserved. Shared
file differences require `--accept-config`; existing files get timestamped
backups. MCP endpoints, subagent configuration, model preferences, auth,
sessions, trust, caches and unrelated custom agents are not copied or deleted.
Bootstrap new machines with restore separately.

Sync is sequential, not transactional across machines. A failure may leave one
target updated; the command exits nonzero and reports failure. Inspect any
retained task before rerunning: a timed-out API call may still be executing,
and mutation requests are never automatically retried. Check mode creates
Dokploy task/audit/log metadata and clones into temporary storage, but changes
no installed config/packages. Successful task cleanup removes its task logs.


## Structure

```
pi-packages/
├── packages/
│   ├── pi-crawl4ai/
│   │   ├── src/
│   │   ├── package.json
│   │   └── README.md
│   ├── pi-work/
│   │   ├── src/
│   │   ├── skills/
│   │   ├── package.json
│   │   └── README.md
│   └── pi-presets/
│       ├── src/
│       ├── package.json
│       └── README.md
├── configs/global/       # Restore snapshot for ~/.pi/agent
├── package.json          # Workspace root
├── AGENTS.md             # Working agreements
├── CONTEXT.md            # Architecture
└── README.md             # This file
```

## License

MIT

# pi-packages

A monorepo of [Pi](https://github.com/earendil-works/pi) extensions distributed as a Git package.

## Packages

| Package | Description | Distribution |
|---------|-------------|--------------|
| [pi-crawl4ai](./packages/pi-crawl4ai) | Remote browser crawling, file-first reads, BM25 and optional Trafilatura/agents; server-managed egress | Git package |
| [pi-work](./packages/pi-work) | Docs-as-work skills, `docs/work` scaffold, and `/work` browse-and-act wizard | Git package |
| [pi-delegation](./packages/pi-delegation) | Standing delegation policy, injected only in sessions that can delegate | Git package |
| [pi-presets](./packages/pi-presets) | Named job presets (`/preset`, `--preset`) | Git package |
| [pi-tools](./packages/pi-tools) | Official `/tools` command | Git package |
| [pi-skill-mentions](./packages/pi-skill-mentions) | Reference several skills from anywhere in one message (`$<name>`) | Git package |
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
[child setup and migration guide](./packages/pi-crawl4ai/README.md#optional-agents).
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

### Native MCP and compaction

Requires Pi 0.99.0 or newer. Pi owns MCP connections, codemode, tool discovery,
and between-turn compaction. The old MCP adapter, compaction workaround,
keepalive retries, and Pi Web workspace plugin have been removed.

`configs/global/mcp-policy.ts` is restored as a personal extension. Project
`.pi/mcp-policy.json` explicitly grants MCP access by preset; nested codemode
calls use the same permission checks. Reads are free, writes require an
interactive confirmation, and unlisted presets cannot call MCP.

### Crawling migration and runtime limits

Crawls now save complete bodies by default, including small pages, and return
exact paths for `crawl_read`. Explicit inline previews are bounded; `save: false`
is the no-write opt-out and forfeits omitted-content recovery. BM25 retains
pre-filter source, including valid empty selections. Optional Trafilatura uses
configured local Python (`CRAWL4AI_TRAFILATURA_PYTHON`, trafilatura>=2,<3) on
remote-rendered HTML and preserves raw HTML; native structure may be lost.

`/crawl-on` and `/crawl-off` were removed: `/tools`, presets and explicit
CLI/child allowlists own activation. `/crawl-status` checks health on demand,
not at startup. HTTP abort may not stop remote browser work. Stock Crawl4AI 0.9.4 rejects untrusted deep strategies. The operator-managed
`discovery-services` deployment now constructs a narrow bounded subset server-side;
non-streaming depth/page/filter behavior passed the real Pi live suite. Other
unmodified deployments can still return actionable unsupported errors. See the
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

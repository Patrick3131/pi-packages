# pi-packages

A monorepo of [Pi](https://github.com/badlogic/pi-mono) extensions distributed as a Git package.

## Packages

| Package | Description | Distribution |
|---------|-------------|--------------|
| [pi-crawl4ai](./packages/pi-crawl4ai) | Web crawling with crawl4ai and proxy support | Git package |
| [pi-work](./packages/pi-work) | Docs-as-work skills, `docs/work` scaffold, and `/work` browse-and-act wizard | Git package |
| [pi-presets](./packages/pi-presets) | Named job presets (`/preset`, `--preset`) | Git package |
| [pi-tools](./packages/pi-tools) | Official `/tools` command | Git package |
| [pi-searxng](./packages/pi-searxng) | Self-hosted SearXNG as `web_search_searxng` | Git package |
| [pi-xai-defaults](./packages/pi-xai-defaults) | Default-on xAI extras for Grok models | Git package |
| [pi-workspaces](./packages/pi-workspaces) | Pi Web workflow panel for Melon task worktrees and Codex | Git package |

## Installation

### Install the complete Melon package repository

Pi can manage this monorepo as one unpinned Git package. This installs every
Melon extension, the Pi Web workspace plugin, and the `pi-work` skills declared
by the root manifest:

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

### Temporary compaction workaround

The global setup also installs [`pi-compact`](https://github.com/StanleyOneG/pi-compact)
as a workaround for Pi's current auto-compaction gap during long assistant/tool
loops. It compacts at completed turn boundaries and coordinates continuation
ownership with `pi-goal`.

This is not a replacement for native Pi behavior. The guard should eventually
be handled by Pi core before the next provider request; remove `pi-compact` from
the global package configuration once that native fix is available.

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

# Type check all
npm run typecheck
```

## Restore a machine

```bash
./configs/global/restore.sh
```

That copies sanitized global settings, personal job presets, and `/tools`. It does not copy `auth.json` or sessions.

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

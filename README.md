# pi-packages

A monorepo of [Pi](https://github.com/badlogic/pi-mono) extensions published as npm packages.

## Packages

| Package | Description | Version |
|---------|-------------|---------|
| [pi-crawl4ai](./packages/pi-crawl4ai) | Web crawling with crawl4ai and proxy support | [![npm](https://img.shields.io/npm/v/pi-crawl4ai.svg)](https://www.npmjs.com/package/pi-crawl4ai) |
| [pi-work](./packages/pi-work) | Docs-as-work skills, `docs/work` scaffold, and `/work` browse-and-act wizard | unpublished |
| [pi-presets](./packages/pi-presets) | Named job presets (`/preset`, `--preset`) | unpublished |
| [pi-searxng](./packages/pi-searxng) | Self-hosted SearXNG as `web_search_searxng` | unpublished |

## Installation

### From npm (recommended)

```bash
npm install pi-crawl4ai
# or
npm install pi-work
# or
npm install pi-presets
```

Add to your Pi `settings.json`:

```json
{
  "packages": ["pi-crawl4ai", "pi-work", "pi-presets"]
}
```

### From GitHub

Add to your Pi `settings.json`:

```json
{
  "extensions": ["github:Patrick3131/pi-packages/packages/pi-crawl4ai"]
}
```

### For Local Development

```bash
git clone https://github.com/Patrick3131/pi-packages.git
cd pi-packages
npm install
npm run build
```

Add to your Pi `settings.json`:

```json
{
  "extensions": ["/path/to/pi-packages/packages/pi-crawl4ai/dist/index.mjs"]
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

## Publishing

```bash
cd packages/pi-crawl4ai
npm version patch  # or minor, major
npm publish
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

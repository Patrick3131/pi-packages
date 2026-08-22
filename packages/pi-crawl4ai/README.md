# pi-crawl4ai

A [Pi](https://github.com/badlogic/pi-mono) extension for web crawling using [crawl4ai](https://github.com/unclecode/crawl4ai). Egress/proxy is server-managed.

## Features

- 🕷️ **Browser-rendered crawling** - Handles JavaScript, SPAs, and dynamic content
- 🌳 **Deep crawling** - Follow links and crawl entire sites with configurable depth
- 📝 **Multiple output formats** - Markdown, HTML, or extracted links
- 💾 **Save to disk** - Optionally persist crawl results organized by domain and timestamp
- ⏱️ **Configurable request pacing** - Global crawl pacing
- ⚡ **Pi integration** - Native tool for the Pi coding agent
- 🎛️ **Lazy activation** - Tool disabled by default, enable with `/crawl-on` when needed
- 🤖 **Subagent-friendly** - Explicit tool selection like `--tools crawl` is honored even when lazy activation is enabled

## Prerequisites

- [crawl4ai Docker](https://github.com/unclecode/crawl4ai) running locally or accessible via URL
- Pi coding agent installed

## Installation

Install the monorepo Git package (the same source used by the other Pi
extensions):

```bash
pi install git:github.com/Patrick3131/pi-packages
```

The repository manifest loads `pi-crawl4ai` and the other extensions. To load
only this extension, use a package filter in `settings.json`:

```json
{
  "packages": [
    {
      "source": "git:github.com/Patrick3131/pi-packages",
      "extensions": ["packages/pi-crawl4ai/src/index.ts"]
    }
  ]
}
```

### Local development

```bash
git clone https://github.com/Patrick3131/pi-packages.git
cd pi-packages
npm install
npm run build --workspace=packages/pi-crawl4ai
```

Add to your Pi `settings.json`:

```json
{
  "extensions": ["/path/to/pi-packages/packages/pi-crawl4ai/dist/index.js"]
}
```

## Configuration

> **Egress / proxy:** Configure proxy credentials on the **crawl4ai server** (operator pinning proxy).
> This package does not accept client-side proxy settings and does not send `proxy_config` in crawl requests.


### Option 1: JSON Config (Recommended)

Create a config file in one of these locations (searched in order):

1. `.pi/crawl4ai.json` - Project-level config
2. `~/.pi/agent/extensions/crawl4ai.json` - Global config

> **💡 Environment Variable Substitution:** You can use `${ENV_VAR}` syntax in any JSON string value. This is useful for keeping sensitive credentials out of version control. The extension will substitute values from your environment at runtime.

#### Basic Config

```json
{
  "url": "http://localhost:11235",
  "timeoutMs": 60000,
  "minRequestIntervalMs": 5000,
  "outputDir": "./output-crawl4ai",
  "apiToken": "${CRAWL4AI_API_TOKEN}",
  "tokenBudget": {
    "maxCharsPerPage": 12000,
    "maxCharsPerCall": 40000,
    "returnMode": "auto",
    "preferFitMarkdown": true,
    "deepCrawlDefaultMaxPages": 10,
    "excerptChars": 200
  },
  "retention": {
    "enabled": true,
    "maxSessions": 20,
    "maxAgeDays": 7,
    "maxTotalMb": 512
  }
}
```

#### Token budget (model context)

Large crawls can burn a lot of model tokens if full page bodies are always inlined. Defaults keep results compact:

| Setting | Default | Effect |
|---------|---------|--------|
| `returnMode` | `auto` | Inline small results; for deep/multi-page or over-budget crawls return a **page index** and save full bodies to disk |
| `maxCharsPerPage` | `12000` | Cap per-page body size when inlining |
| `maxCharsPerCall` | `40000` | Cap total body size for one tool result |
| `preferFitMarkdown` | `true` | Prefer crawl4ai `fit_markdown` (main content) over raw markdown |
| `deepCrawlDefaultMaxPages` | `10` | Safer deep-crawl default (was effectively 100) |

Per-call overrides on the tool: `returnMode`, `maxCharsPerPage`, `maxCharsPerCall`, `preferFitMarkdown`.

When auto mode chooses files/index, results are auto-saved (unless `save: false`). Files-mode output prints the exact `crawl-manifest.json` path and each exact nested page path; read the manifest first or use one of those paths with `crawl_read`—never invent flattened filenames. `crawl_read` can also resolve a page URL through a manifest/session.

With `save` omitted or `save: false`, inline output is intentionally not persisted. If inline content is truncated, it cannot be recovered by `crawl_read`; re-crawl with `save: true` or a larger budget.

#### Retention (disk cleanup)

Saved crawl sessions live under `outputDir` (default `./output-crawl4ai`). To avoid unbounded disk growth, retention runs **after each save** when enabled:

| Setting | Default | Effect |
|---------|---------|--------|
| `retention.enabled` | `true` | Auto-prune after saves |
| `retention.maxSessions` | `20` | Keep only the newest N sessions |
| `retention.maxAgeDays` | `7` | Delete sessions older than N days (`0` = disable age rule) |
| `retention.maxTotalMb` | `512` | Soft size cap; oldest sessions deleted first (`0` = disable) |

Safety: only directories that contain `crawl-manifest.json` are removed. Non-session files/folders in the output root are left alone.

Manual commands:

```text
/crawl-sessions          # list saved sessions + sizes
/crawl-cleanup           # apply retention now
/crawl-cleanup dry-run   # show what would be deleted
```

#### Enable Crawl Tool at Startup

Startup on/off is owned by `.pi/tools.json` (`/tools`). This package does not
have `enabledByDefault`. Set `"crawl"` / `"crawl_read"` there, or use
`/crawl-on` / `/crawl-off` for the current session only.

#### Save Examples

```
# Save to default directory
Crawl and save https://example.com

# Save to custom directory
Crawl https://example.com and save to ./my-crawls

# Deep crawl and save
Deep crawl https://docs.example.com with depth 3 and save
```

#### Custom Default Directory

Set `CRAWL4AI_OUTPUT_DIR` to change the default save location:

```bash
CRAWL4AI_OUTPUT_DIR=./crawled-content
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Type check
npm run typecheck

# Run tests
npm run test

# Run tests with coverage
npm run test:coverage
```

### Project Structure

```
pi-crawl4ai/
├── src/
│   ├── index.ts              # Extension entry point
│   ├── config.ts             # Configuration loading
│   ├── configLoader.ts       # JSON/env config parsing
│   ├── test-utils.ts         # Testing utilities
│   └── features/
│       └── crawl/
│           ├── crawlTool.ts  # Crawl tool implementation
│           ├── saveOutput.ts # Save to disk functionality
│           └── types.ts      # TypeScript types
├── package.json
├── tsconfig.json
├── AGENTS.md                 # Working agreements
├── CONTEXT.md                # Architecture docs
└── README.md                 # This file
```

## License

MIT

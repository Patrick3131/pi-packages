# pi-crawl4ai

A [Pi](https://github.com/badlogic/pi-mono) extension for web crawling using [crawl4ai](https://github.com/unclecode/crawl4ai) with optional proxy support.

## Features

- 🕷️ **Browser-rendered crawling** - Handles JavaScript, SPAs, and dynamic content
- 🌳 **Deep crawling** - Follow links and crawl entire sites with configurable depth
- 📝 **Multiple output formats** - Markdown, HTML, or extracted links
- 💾 **Save to disk** - Optionally persist crawl results organized by domain and timestamp
- 🌐 **Proxy support** - Generic proxy, Oxylabs ISP rotation, or custom providers
- 🔄 **IP rotation** - Round-robin across multiple proxy endpoints
- 🔐 **Auth profiles** - Named cookie/header profiles for authenticated crawling across multiple sites
- ⏱️ **Configurable request pacing** - Global crawl pacing with per-auth-profile overrides
- 🔒 **Session management** - Sticky sessions with automatic rotation
- ⚡ **Pi integration** - Native tool for the Pi coding agent
- 🎛️ **Lazy activation** - Tool disabled by default, enable with `/crawl-on` when needed
- 🤖 **Subagent-friendly** - Explicit tool selection like `--tools crawl` is honored even when lazy activation is enabled

## Prerequisites

- [crawl4ai Docker](https://github.com/unclecode/crawl4ai) running locally or accessible via URL
- Pi coding agent installed

## Installation

### Option 1: npm (recommended)

```bash
npm install pi-crawl4ai
```

Add to your Pi `settings.json`:

```json
{
  "packages": ["pi-crawl4ai"]
}
```

### Option 2: GitHub

Add to your Pi `settings.json`:

```json
{
  "extensions": ["github:Patrick3131/pi-packages/packages/pi-crawl4ai"]
}
```

### Option 3: Local development

```bash
git clone https://github.com/Patrick3131/pi-packages.git
cd pi-packages/packages/pi-crawl4ai
npm install
npm run build
```

Add to your Pi `settings.json`:

```json
{
  "extensions": ["/path/to/pi-packages/packages/pi-crawl4ai/dist/index.mjs"]
}
```

## Configuration

### Option 1: JSON Config (Recommended)

Create a config file in one of these locations (searched in order):

1. `.pi/crawl4ai.json` - Project-level config
2. `~/.pi/agent/extensions/crawl4ai.json` - Global config

> **💡 Environment Variable Substitution:** You can use `${ENV_VAR}` syntax in any JSON string value. This is useful for keeping sensitive credentials out of version control. The extension will substitute values from your environment at runtime.

#### Basic Config (No Proxy)

```json
{
  "url": "http://localhost:11235",
  "timeoutMs": 60000,
  "enabledByDefault": false,
  "minRequestIntervalMs": 5000
}
```

#### Enable Crawl Tool at Startup

By default, the crawl tool is disabled to avoid polluting the system prompt. Set `enabledByDefault: true` to enable it automatically at startup:

```json
{
  "url": "http://localhost:11235",
  "enabledByDefault": true
}
```

#### With Generic Proxy

```json
{
  "url": "http://localhost:11235",
  "timeoutMs": 60000,
  "proxy": {
    "url": "http://user:pass@proxy.example.com:8080"
  }
}
```

#### With Oxylabs ISP (Single Port)

```json
{
  "url": "http://localhost:11235",
  "proxy": {
    "provider": "oxylabs",
    "username": "your_username",
    "password": "your_password",
    "host": "isp.oxylabs.io",
    "port": 8001
  }
}
```

#### With Oxylabs ISP (Rotation - Multiple Ports)

```json
{
  "url": "http://localhost:11235",
  "timeoutMs": 60000,
  "proxy": {
    "provider": "oxylabs",
    "username": "your_username",
    "password": "your_password",
    "host": "isp.oxylabs.io",
    "ports": [8001, 8002, 8003, 8004, 8005, 8006, 8007, 8008, 8009, 8010]
  }
}
```

#### Auth Profiles (Named Cookies / Headers)

Use `authProfiles` to define reusable authenticated browser contexts. This keeps cookies and headers out of prompts and lets the extension auto-select the right profile by site/domain.

```json
{
  "authProfiles": {
    "x-main": {
      "matchSites": ["x", "twitter"],
      "matchDomains": ["x.com", "twitter.com"],
      "cookies": "${X_COOKIES_JSON}",
      "userAgent": "${X_USER_AGENT}",
      "minRequestIntervalMs": 5000
    },
    "reddit-main": {
      "matchSites": ["reddit"],
      "matchDomains": ["reddit.com"],
      "cookies": "${REDDIT_COOKIES_JSON}",
      "proxy": {
        "provider": "oxylabs",
        "host": "isp.oxylabs.io",
        "ports": [8008],
        "username": "${OXYLABS_USER}",
        "password": "${OXYLABS_PASS}"
      }
    }
  }
}
```

If an auth profile defines `proxy`, it overrides the top-level `proxy` config for crawls using that profile.

`cookies` may be either:
- a JSON string containing an array of cookie objects
- an inline array of cookie objects
- a standard `Cookie` header string like `session=abc; csrf=def`

#### Using Environment Variables (Safe for Version Control)

Use `${ENV_VAR}` substitution to keep credentials out of your config file:

```json
{
  "url": "http://10.8.0.1:11235",
  "proxy": {
    "provider": "oxylabs",
    "host": "isp.oxylabs.io",
    "ports": [8001, 8002, 8003, 8004, 8005, 8006, 8007, 8008, 8009, 8010],
    "username": "${OXYLABS_USER}",
    "password": "${OXYLABS_PASS}"
  }
}
```

Then set the environment variables in your `.env` file:

```bash
OXYLABS_USER=your_username
OXYLABS_PASS=your_password
```
```

Or use comma-separated string:

```json
{
  "proxy": {
    "provider": "oxylabs",
    "username": "your_username",
    "password": "your_password",
    "ports": "8001,8002,8003,8004,8005"
  }
}
```

### Option 2: Environment Variables

Create a `.env` file or set environment variables:

```bash
# Required: crawl4ai Docker API URL
CRAWL4AI_BASE_URL=http://localhost:11235

# Optional: Request timeout
CRAWL4AI_TIMEOUT=60000

# Optional: Default output directory for saved crawls
CRAWL4AI_OUTPUT_DIR=./output-crawl4ai

# Optional: Minimum interval between crawl requests in ms
CRAWL4AI_MIN_REQUEST_INTERVAL_MS=1000

# Proxy Option 1: Generic proxy URL
CRAWL4AI_PROXY_URL=http://user:pass@proxy.example.com:8080

# Proxy Option 2: Oxylabs ISP (single port)
OXYLABS_USER=your_username
OXYLABS_PASS=your_password
OXYLABS_HOST=isp.oxylabs.io
OXYLABS_PORT=8001

# Proxy Option 3: Oxylabs ISP (rotation - multiple ports)
OXYLABS_USER=your_username
OXYLABS_PASS=your_password
OXYLABS_HOST=isp.oxylabs.io
OXYLABS_PORTS=8001,8002,8003,8004,8005,8006,8007,8008,8009,8010
```

### No Proxy

If you don't configure a proxy, the extension will work without one. Just don't set any proxy-related environment variables or JSON config.

### Configuration Priority

1. **JSON config file** - Highest priority
2. **Environment variables** - Fallback
3. **Defaults** - `http://localhost:11235`, no proxy

### crawl4ai Setup

1. Clone and run crawl4ai Docker:

```bash
git clone https://github.com/unclecode/crawl4ai
cd crawl4ai
docker-compose up -d
```

2. Verify it's running:

```bash
curl http://localhost:11235/health
```

## Usage

The `crawl` tool is **disabled by default** to avoid polluting the system prompt. You must enable it when needed.

If Pi is started with an explicit tool selection such as `--tools crawl`, that explicit selection is honored for the session even when `enabledByDefault` is `false`. This is useful for subagents or specialized agents that request `crawl` directly.

### Enabling the Tool

```
/crawl-on
```

This adds the crawl tool to the active tools list and includes it in the system prompt.

### Disabling the Tool

When you're done crawling, disable it to save tokens:

```
/crawl-off
```

The tool state persists across session reloads and branch navigation. If you enable it in a session, it stays enabled until you disable it.

### Using the Tool

Once enabled, ask Pi to crawl:

```
You: Crawl https://example.com and summarize the content

Pi: [uses crawl tool to fetch and process the page]
```

With auth profiles configured, the extension can automatically pick the right profile from the URL domain, or Pi can pass a `site` hint when you say things like "scrape this from X". If `minRequestIntervalMs` is configured, crawls are rate-limited between calls. Per-profile `minRequestIntervalMs` overrides the global value.

Each crawl result includes an execution summary showing the effective config used for that request, including site hint, auth profile, proxy source, and whether cookies, headers, and user agent were applied.

The tool also accepts a few compatibility aliases when the model guesses different argument names: `platform`, `siteName`, or `sourceSite` map to `site`, and `profile`, `auth_profile`, or `auth` map to `authProfile`.

### Tool Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `urls` | `string[]` | URLs to crawl (required). For deep crawling, provide a single start URL. |
| `site` | `string` | Optional site hint for auth profile selection (e.g. `x`, `twitter`, `reddit`) |
| `authProfile` | `string` | Explicit auth profile name from config. Overrides automatic matching |
| `format` | `"markdown"` \| `"html"` \| `"links"` | Output format (default: `markdown`) |
| `waitFor` | `number` | Milliseconds to wait before extraction |
| `jsCode` | `string` | JavaScript to execute before extraction |
| `bypassCache` | `boolean` | Force fresh crawl, bypass cache |
| `deepCrawl` | `object` | Deep crawl configuration (see below) |
| `save` | `boolean` \| `string` | Save results to disk. `true` = default directory, or provide a custom path |

### Deep Crawl Parameters

Enable multi-page crawling by following links from a starting URL:

| Parameter | Type | Description |
|-----------|------|-------------|
| `strategy` | `"bfs"` \| `"dfs"` \| `"best-first"` | Crawl strategy (default: `bfs`) |
| `maxDepth` | `number` | Maximum depth (required). 1 = start page only, 2 = start + linked pages |
| `maxPages` | `number` | Maximum total pages to crawl (default: 100) |
| `includeExternal` | `boolean` | Follow links to external domains (default: false) |
| `includePatterns` | `string[]` | URL glob patterns to include (e.g., `/docs/*`, `*.html`) |
| `excludePatterns` | `string[]` | URL glob patterns to exclude (e.g., `/admin/*`, `*.pdf`) |
| `allowedDomains` | `string[]` | Only follow links to these domains |
| `scoreThreshold` | `number` | Minimum relevance score for best-first strategy (0.0-1.0) |

#### Crawl Strategies

- **`bfs`** (Breadth-First Search) - Crawls level by level. Good for comprehensive site coverage.
- **`dfs`** (Depth-First Search) - Dives deep into each path before backtracking. Good for deep hierarchies.
- **`best-first`** - Prioritizes pages by relevance score. Use with `scoreThreshold` to filter low-relevance pages.

### Examples

```
# Basic crawl
Crawl https://example.com

# Multiple URLs
Crawl these URLs: https://site1.com, https://site2.com

# Wait for dynamic content
Crawl https://spa-example.com, wait 2 seconds for content to load

# Extract links only
Crawl https://example.com and list all the links

# Custom JS execution
Crawl https://example.com, click the "Load More" button first
```

### Deep Crawl Examples

```
# Crawl a documentation site, 2 levels deep
Crawl https://docs.example.com with depth 2

# Crawl with URL filtering
Deep crawl https://example.com, only following /docs/* and /api/* pages, exclude /admin

# Crawl with page limit
Crawl https://blog.example.com with max depth 3 and limit to 50 pages

# Cross-domain crawl
Crawl https://blog.example.com following external links to docs.example.com

# Best-first strategy with scoring
Crawl https://news.example.com using best-first strategy with score threshold 0.5
```

#### Deep Crawl Output

Deep crawl results are grouped by depth level for easy navigation:

```markdown
# Deep Crawl Results (15 pages, max depth: 2)

## Depth 0 (1 page)
### https://example.com
Home page content...

## Depth 1 (5 pages)
### https://example.com/docs
Documentation overview...

## Depth 2 (9 pages)
### https://example.com/docs/api
API reference...
```

### Saving Results to Disk

Use the `save` parameter to persist crawl results to disk. This is useful for:
- Large crawls that exceed response size limits
- Keeping a record of crawled content for later analysis
- Building local documentation archives

#### Save Options

| Value | Behavior |
|-------|----------|
| `undefined` / `false` | Don't save (default) |
| `true` | Save to `./output-crawl4ai` |
| `"./custom/path"` | Save to specified directory |

#### Directory Structure

Saved results are organized by domain and timestamp:

```
output-crawl4ai/
├── example.com-2025-03-25T14-30-00/
│   ├── crawl-manifest.json
│   └── example.com/
│       ├── index.md
│       ├── docs/
│       │   ├── api.md
│       │   └── guide.md
│       └── about.md
└── docs.python.org-2025-03-25T15-00-00/
    └── ...
```

Each session includes a `crawl-manifest.json` with metadata:

```json
{
  "timestamp": "2025-03-25T14:30:00.000Z",
  "totalPages": 15,
  "format": "markdown",
  "urls": ["https://example.com"],
  "proxyUsed": false,
  "deepCrawl": {
    "maxDepth": 2,
    "maxPages": 100
  },
  "files": [
    "example.com/index.md",
    "example.com/docs/api.md"
  ]
}
```

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

## IP Rotation

When multiple proxy endpoints are configured (via `ports` array or `OXYLABS_PORTS`), the extension automatically:

- **Rotates IPs** - Round-robin across available endpoints
- **Manages sessions** - Sticky sessions with configurable TTL
- **Quarantines bad endpoints** - Temporarily skips failing endpoints

### Rotation Behavior

- Each request uses the next available endpoint
- Sessions keep the same endpoint for multiple requests (up to 15 by default)
- Failed endpoints are quarantined for 5 minutes

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
│   ├── proxy/
│   │   ├── index.ts
│   │   ├── types.ts          # Proxy types
│   │   ├── proxyService.ts   # Service management
│   │   ├── rotationService.ts # IP rotation logic
│   │   └── adapters/
│   │       ├── genericAdapter.ts
│   │       ├── oxylabsAdapter.ts
│   │       └── customAdapter.ts
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

### Adding a Custom Proxy Provider

See `src/proxy/README.md` for details on implementing custom proxy adapters.

## License

MIT

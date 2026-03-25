# pi-crawl4ai

A [Pi](https://github.com/badlogic/pi-mono) extension for web crawling using [crawl4ai](https://github.com/unclecode/crawl4ai) with optional proxy support.

## Features

- 🕷️ **Browser-rendered crawling** - Handles JavaScript, SPAs, and dynamic content
- 📝 **Multiple output formats** - Markdown, HTML, or extracted links
- 🌐 **Proxy support** - Generic proxy, Oxylabs ISP rotation, or custom providers
- 🔄 **IP rotation** - Round-robin across multiple proxy endpoints
- 🔒 **Session management** - Sticky sessions with automatic rotation
- ⚡ **Pi integration** - Native tool for the Pi coding agent

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

#### Basic Config (No Proxy)

```json
{
  "url": "http://localhost:11235",
  "timeoutMs": 60000
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

Once installed, the `crawl` tool is available to the Pi agent:

```
You: Crawl https://example.com and summarize the content

Pi: [uses crawl tool to fetch and process the page]
```

### Tool Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `urls` | `string[]` | URLs to crawl (required) |
| `format` | `"markdown"` \| `"html"` \| `"links"` | Output format (default: `markdown`) |
| `waitFor` | `number` | Milliseconds to wait before extraction |
| `jsCode` | `string` | JavaScript to execute before extraction |
| `bypassCache` | `boolean` | Force fresh crawl, bypass cache |

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

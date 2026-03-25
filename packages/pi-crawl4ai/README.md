# pi-crawl4ai

A [Pi](https://github.com/badlogic/pi-mono) extension for web crawling using [crawl4ai](https://github.com/unclecode/crawl4ai) with optional proxy support.

## Features

- 🕷️ **Browser-rendered crawling** - Handles JavaScript, SPAs, and dynamic content
- 📝 **Multiple output formats** - Markdown, HTML, or extracted links
- 🌐 **Proxy support** - Oxylabs ISP rotation or custom proxy configuration
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

Set environment variables (in your project's `.env` or shell):

```bash
# Required: crawl4ai Docker API URL
CRAWL4AI_BASE_URL=http://localhost:11235

# Optional: Request timeout (default: 60000ms)
CRAWL4AI_TIMEOUT=60000

# Proxy Option 1: Full proxy URL with auth
CRAWL4AI_PROXY_URL=http://user:pass@proxy.example.com:8080

# Proxy Option 2: Oxylabs ISP (auto-configured)
OXYLABS_USER=your_username
OXYLABS_PASS=your_password
OXYLABS_HOST=pr.oxylabs.io  # optional
OXYLABS_PORT=7777           # optional
```

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
```

### Project Structure

```
pi-crawl4ai/
├── src/
│   ├── index.ts              # Extension entry point
│   ├── config.ts             # Configuration loading
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

### Adding New Features

1. Create a new folder in `src/features/`
2. Add `types.ts` for type definitions
3. Add `<feature>Tool.ts` for tool implementation
4. Register in `src/index.ts`

## License

MIT

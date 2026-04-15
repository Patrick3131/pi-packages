# pi-brave-search

A [Pi](https://github.com/badlogic/pi-mono) extension that adds a `brave_search` tool backed by the Brave Web Search API.

It is designed to work well with `pi-crawl4ai`: use `brave_search` to discover relevant URLs, then use `crawl` on the returned results when you need full page content.

## Features

- 🔎 Brave-powered web search
- 🧭 Normalized search results with title, URL, and snippet
- 🌍 Optional localization and freshness filters
- 🎛️ Lazy activation with `/brave-search-on` and `/brave-search-off`
- ⏱️ Built-in request pacing for Brave plan limits (default: 1 request/sec)
- 🤝 Pairs naturally with `pi-crawl4ai`

## Installation

### npm

```bash
npm install pi-brave-search
```

Add to `settings.json`:

```json
{
  "packages": ["pi-brave-search"]
}
```

### GitHub

```json
{
  "extensions": ["github:Patrick3131/pi-packages/packages/pi-brave-search"]
}
```

## Configuration

### Option 1: JSON config

Create one of:

1. `.pi/brave-search.json`
2. `~/.pi/agent/extensions/brave-search.json`

Example:

```json
{
  "apiKey": "${BRAVE_SEARCH_API_KEY}",
  "baseUrl": "https://api.search.brave.com/res/v1",
  "timeoutMs": 30000,
  "enabledByDefault": false,
  "minRequestIntervalMs": 1000
}
```

### Option 2: Environment variables

```bash
BRAVE_SEARCH_API_KEY=your_brave_search_api_key
BRAVE_SEARCH_BASE_URL=https://api.search.brave.com/res/v1
BRAVE_SEARCH_TIMEOUT=30000
BRAVE_SEARCH_ENABLED_BY_DEFAULT=false
BRAVE_SEARCH_MIN_INTERVAL_MS=1000
```

## Tool

### `brave_search`

Parameters:

- `query` - required search query
- `count` - optional result count, up to 20
- `offset` - optional pagination offset
- `country` - optional country code like `US` or `DE`
- `searchLang` - optional search language like `en`
- `uiLang` - optional UI locale like `en-US`
- `safesearch` - `off`, `moderate`, or `strict`
- `freshness` - `pd`, `pw`, `pm`, or `py`
- `extraSnippets` - request extra snippets when available

## Usage

Search first:

```text
Use brave_search to find recent docs about crawl4ai.
```

Then crawl specific results:

```text
Use brave_search to find the official crawl4ai docs, then crawl the most relevant result.
```

## Development

```bash
npm install
npm run build --workspace=packages/pi-brave-search
npm run test --workspace=packages/pi-brave-search
```

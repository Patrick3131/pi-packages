# pi-searxng

Pi extension that adds `web_search_searxng`: JSON search against the
discovery-services SearXNG instance (Brave + DuckDuckGo).

Adapted from the MIT `pi-searxng-search` tool. This package does not register
`web_fetch` and does not talk to xAI search.

## Defaults

- Tool name: `web_search_searxng`
- **Off by default.** `session_start` removes it from the active set unless
  `PI_SEARXNG_ENABLED=1` (or `SEARXNG_SEARCH_ENABLED=1`).
- URL: `SEARXNG_URL` or `http://10.8.0.1:18089`
- Engines: `SEARXNG_ENGINES` or `brave,duckduckgo`

Enable it with `/tools`, `/preset research`, or the env flag.

## Install

```bash
pi install /absolute/path/to/pi-packages/packages/pi-searxng
```

Reload Pi, then confirm `/tools` shows `web_search_searxng` disabled.

## Use

```text
/preset research
```

Or keep Grok coding as usual and only turn the tool on when you need live search.
Leave `/xai-tools` web search off unless you want billed xAI search instead.

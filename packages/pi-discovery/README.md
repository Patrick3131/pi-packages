# pi-discovery

Direct SearXNG search (`web_search_searxng`) and server-owned Luna research
(`web_answer`). Both tools default off, using Pi's native defaultActive policy.
Enable with project `.pi/tools.json`, explicit host selection or env defaults:

```json
{"web_search_searxng": true, "web_answer": true}
```

```bash
DISCOVERY_WEB_SEARCH_ENABLED=1 DISCOVERY_WEB_ANSWER_ENABLED=1 pi
```

Project false overrides an env default; explicit CLI, presets, child and saved
loadouts own their selection. Later /tools changes remain authoritative.

| Configuration | Default |
| --- | --- |
| DISCOVERY_BASE_URL | http://10.8.0.1:18080 |
| DISCOVERY_WEB_ANSWER_TIMEOUT_MS | 90000 |
| SEARXNG_URL | http://10.8.0.1:18089 |
| SEARXNG_ENGINES | brave,duckduckgo |

Private/VPN network access is required. No API bearer token or local Codex login.
The discovery server owns account credentials and always selects gpt-6-luna.
There is no model fallback or client retry. The old search enablement env aliases
are removed; update callers to DISCOVERY_WEB_SEARCH_ENABLED.

## Model tool

web_answer accepts query (trimmed 1–8000 chars), instructions (max 4000),
max_sources (integer 1–20, default 10), timeout_ms (5000–120000, default 60000).
The HTTP deadline must be at least 5000 ms longer than the server deadline.
Cancellation/deadline cover fetch and response body. Calls use redirect:error.
The configured discovery URL is an http(s) origin, without credentials/path/query.

The result is final model text plus structured search results, gaps, searches,
optional usage, identity/provenance and timings. Search results are candidates,
not citation annotations or proof that every page supports the answer. No prose
URL extraction or fabricated spans. Empty results and gaps stay visible. Use
search for URL enumeration, answer for synthesis, crawl to verify pages. Avoid
parallel bursts that consume shared account quota.

Failures distinguish invalid request, disabled endpoint, server Codex auth, busy
capacity, account quota, upstream, timeout, transport and malformed response.
Retry-After is advisory; no retry is performed. Pi receives safe isError results;
caller cancellation remains AbortError.

## Harness-neutral export

```ts
import { askWeb, formatWebAnswer, WebAnswerClientError } from '@patrick3131/pi-packages/research';
const started = Date.now();
const answer = await askWeb({ query: 'Find the Python documentation' }, { signal });
const { text, details } = formatWebAnswer(answer, Date.now() - started);
```

askWeb accepts explicit env, fetch, signal and HTTP timeoutMs options. Wire
metadata keeps snake_case. Runtime error class and TypeScript types are exported.
The bundle has no Coding Agent/TUI runtime requirement.

```bash
npm test --workspace=packages/pi-discovery
npm run typecheck --workspace=packages/pi-discovery
DISCOVERY_LIVE=1 npm test --workspace=packages/pi-discovery
```

Default tests never call the network. Explicit live mode fails on unreachable
services. Package replaces pi-searxng directly; no backward compatibility layer.
Search implementation retains MIT attribution to pi-searxng-search.

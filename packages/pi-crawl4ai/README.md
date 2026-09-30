# pi-crawl4ai

A [Pi](https://github.com/earendil-works/pi) extension using the existing remote [Crawl4AI](https://github.com/unclecode/crawl4ai) browser/API service. Egress/proxy credentials stay on the server; this client never sends proxy settings. Basic crawling needs neither Python nor pi-subagents.

## Install

```bash
pi install git:github.com/Patrick3131/pi-packages
```

The root Git manifest loads this extension and the other repository resources. To load only the crawling extension, narrow the normal Pi resources in `settings.json`:

```json
{
  "packages": [{
    "source": "git:github.com/Patrick3131/pi-packages",
    "extensions": ["packages/pi-crawl4ai/src/index.ts"],
    "skills": []
  }]
}
```

Optional agents are discovered separately by pi-subagents through `pi.subagents.agents`, not through a top-level `pi.agents` field or Pi's extension filter. The standalone npm manifest exposes `dist/index.js` and `agents/`; its tarball includes both. For local development, load `packages/pi-crawl4ai/src/index.ts` directly or build and load `dist/index.js`.

## File-first output and activation

- **Omitted `save` saves complete pages.** Omitted/`auto` return mode returns compact file references.
- `save: true` uses the configured root; a string selects a custom directory. Relative paths resolve from the tool context's working directory.
- `returnMode: "inline"` returns a bounded preview **and still saves** unless `save: false` is explicit.
- `save: false` performs no disk writes and returns bounded inline content. Omitted content is not recoverable with `crawl_read`; re-crawl with saving enabled. `save: false` plus `returnMode: "files"` fails before the network request.
- `returnMode` selects file references or bounded inline previews. `maxCharsPerPage` and `maxCharsPerCall` can lower preview limits; larger values cannot lift the fixed cap. `preferFitMarkdown` defaults to true and selects main-content Markdown when available.
- Enable/disable `crawl` and `crawl_read` with `/tools`, `.pi/tools.json`, presets or explicit CLI/child tool allowlists. The extension does not rewrite the active set at load/reload.

## Crawl and read

```json
{"urls":["https://example.com"]}
```

Use `crawl_read` with an **exact printed page path**, or read the printed `crawl-manifest.json` to select a page. Never invent flattened filenames. Outline-first is optional.

```json
{"path":"/exact/session/domain/page.md","mode":"chunks","query":"installation"}
```

Modes: `outline`, `chunks` (optionally ranked by `query`), `window` (1-based `offset`/`limit` lines), `full`. `maxChars` can lower the read cap. URL-only reads select the newest matching completed session in the default output root. Providing a session/manifest context makes lookup strict: a missing/wrong context does not fall back to another session. Custom output sessions work via exact paths. Results report the chosen source/path and time when available.

### Fixed presentation limits

| Output | Limit |
| --- | --- |
| Explicit inline/no-save crawl bodies | 12,000 characters total per call, or smaller caller preview limits |
| `crawl_read` | 6,000 characters by default; caller overrides remain subject to host limits |
| Displayed page index | First 20 entries; complete manifest contains the remaining entries |
| Final model-facing tool text | Pi byte/line limits (currently 50 KiB / 2,000 lines), with omission/recovery notice |

Saved bodies are not shortened to fit presentation limits. Query ranking and truncation are separate: a ranked large section can still become a labelled excerpt with a source line range/path. Use window/full reads for more. Zero remaining space never means unlimited output.

### Browser controls and runtime gate

`format` supports `markdown` (default), `html`, `links`, and `text` with Trafilatura. `waitFor` is a positive delay in milliseconds after rendering, not a CSS-selector wait. `bypassCache: true` requests bypass; omitted/false requests enabled caching. `jsCode` executes in the remote browser: only supply trusted, explicitly authorized code.

Deep crawling requires one seed and supports `bfs`, `dfs`, `best-first`, integer `maxDepth`/`maxPages`, optional `includeExternal`, glob `includePatterns`/`excludePatterns`, and `allowedDomains`. Public `maxDepth: 1` is seed-only (translated to upstream depth zero). Default `maxPages` is 10. `scoreThreshold` requires best-first and a value in [0,1]. These are crawl bounds, distinct from the 20-entry display cap.

The operator-managed `discovery-services` deployment supports narrow server-owned, non-streaming BFS/DFS/best-first construction with bounded glob/domain filters, attempted-page budgets, frontiers and a total deadline. Ordinary configuration remains untrusted; SSRF/DNS pinning and operator-only egress remain intact. Stock upstream **0.9.4** rejects these untrusted strategy objects; unsupported errors remain actionable and must never be bypassed. A health GET alone is not proof of traversal. Server limits cap depth at 5 and attempted pages at 100; raw-regex patterns and deep streaming are not supported by this operator capability.

The configured deadline covers process-local pacing, fetch, response-body reading and optional extraction. HTTP abort/cancellation **does not necessarily cancel server-side browser work**. No automatic crawl POST retries are performed. Multi-process/deep-crawl pacing belongs on the server. Invalid URLs/options, malformed responses and total page failure are errors; mixed results explicitly report partial failure, and empty ordinary page content is a warning.

## Focused filtering: BM25

```json
{"urls":["https://example.com/docs"],"bm25Query":"installation","bm25Threshold":1}
```

Crawl-time BM25 supports **one URL, Markdown/text, no deep crawl**. `bm25Threshold` defaults to 1.0, must be finite and nonnegative, and requires a nonblank query. HTML/links/deep/multi-URL combinations fail preflight. Text also requires Trafilatura.

The shared Okapi scorer (k1=1.5, b=0.75) uses Unicode-aware tokens and heading sections/headingless paragraphs, respects fenced code and intact table/code blocks, and saves matching sections in source order. `crawl_read` reuses this scorer for positive query matches without another public threshold. No heading-ancestry or cross-section link/reference reconstruction is promised.

Filtering saves the pre-filter content as `sourceFile` and the filtered primary file as `pages[].file`. The manifest records query, threshold and matched/total section counts. **Zero matches is a valid empty result/file**, not a crawler failure or proof that the original lacks the requested fact. Read the exact source reference to recover discarded material. `save: false` explicitly forfeits this recovery.

## Optional local Trafilatura

Only the remote server fetches/renders URLs. A configured local Python receives rendered HTML on stdin, without shell interpolation, network fetching, local browser installation or automatic dependency installation.

Install the supported **Trafilatura >=2,<3** in an operator-managed environment, then select its executable:

```bash
python3 -m venv ~/.venvs/pi-crawl4ai
~/.venvs/pi-crawl4ai/bin/python -m pip install 'trafilatura>=2,<3'
export CRAWL4AI_TRAFILATURA_PYTHON="$HOME/.venvs/pi-crawl4ai/bin/python"
```

Or set `trafilatura.pythonPath` in JSON. Restart/reload after changing configuration.

```json
{"urls":["https://example.com/article"],"extractor":"trafilatura","format":"markdown","includeLinks":true}
```

Trafilatura supports Markdown/text; `text` currently requires this extractor. Native tables/formatting are enabled, links default to false (`includeLinks` requires an extractor). It requires saving: `save: false` is rejected. It can precede single-page BM25; in that composition `sourceFile` contains the extracted pre-filter content, and `rawHtmlFile` preserves rendered HTML.

Rendered raw HTML is saved **before** extraction. Missing Python/dependency or extraction failure returns setup guidance and an exact original HTML reference, not a silent fallback. Basic crawling remains unaffected. Input/output are bounded, the same remaining crawl deadline applies, and cancellation terminates the process with a short force-kill grace period.

Native extraction can lose navigation, headings, tables, links, images and formatting; enabling tables/links is not a fidelity guarantee. Inspect preserved HTML or re-crawl ordinary Markdown when structure matters. There is no table/image supplementation or full Markdown parser. Ordinary unfiltered crawls do not create unnecessary source archives.

## Configuration

JSON is searched in the working directory, `.pi/`, then `~/.pi/agent/extensions/`, using `crawl4ai.json` before `.crawl4ai.json` in each directory. Prefer `.pi/crawl4ai.json` for project configuration. JSON values take precedence over environment fallback/defaults. `${ENV_VAR}` substitution works in string values.

```json
{
  "url": "http://localhost:11235",
  "apiToken": "${CRAWL4AI_API_TOKEN}",
  "timeoutMs": 60000,
  "minRequestIntervalMs": 1000,
  "outputDir": "./output-crawl4ai",
  "retention": {"enabled": true, "maxSessions": 20, "maxAgeDays": 7, "maxTotalMb": 512}
}
```

See [.env.example](.env.example) for env equivalents, including `CRAWL4AI_BASE_URL`, `CRAWL4AI_API_TOKEN`, `CRAWL4AI_TIMEOUT`, `CRAWL4AI_MIN_REQUEST_INTERVAL_MS`, `CRAWL4AI_OUTPUT_DIR` and `CRAWL4AI_TRAFILATURA_PYTHON`. Bearer authentication is retained; do not put secrets into committed config or page requests.

### Status and retention

```text
/crawl-status             # bounded on-demand service health; no tool activation
/crawl-status extractor   # also check configured local extraction
/crawl-sessions           # saved default-root sessions: size, host and page count
/crawl-sessions 1         # drill into session #1 (or a name / unique name prefix)
/crawl-cleanup dry-run    # preview retention
/crawl-cleanup            # apply retention now
```

No startup health requests, subprocess probes, persistent status footer or custom renderer. Status is not an end-to-end traversal test.

Rows read `1. <name>  <size> MB  <host> ×<pages>  <timestamp>`, with `unknown-host`/`?` when a manifest lacks usable URL or page metadata. A selector prints the numbered `URL → exact path` lines of that session, capped at 20 entries with an explicit `… and N more` remainder, plus the recorded request summary and the manifest path. The drill-down is sent as a `crawl-sessions` message so the model sees it (a follow-up "summarise 3" resolves); the plain list stays a notification. Unknown selectors error with the searched root, ambiguous prefixes list the matching session names, and neither prints another session's pages; selector errors stay notifications in UI mode and are sent as a message in headless runs.

Saves use unique sessions/hashed URL filenames and publish the manifest last. `pages[]` maps URLs to primary files; optional `sourceFile`, `rawHtmlFile`, `filter` and `extractor` fields describe filtering/extraction artifacts. Generated/manifest artifact paths are checked for session containment, including symlink escape; the reader is **not a filesystem security sandbox**.

New manifests also record provenance: `request` holds the effective values that shaped the crawl (`format`, `bypassCache`, `preferFitMarkdown`, optional `waitFor`, `jsCode: true` — the source is never persisted — `deepCrawl` with resolved `strategy`/`maxDepth`/`maxPages` and any filters, optional `bm25`, optional `extractor`), `service.baseUrl` is the endpoint with credentials removed, and a failed `pages[]` entry keeps a redacted `error` reason. The legacy top-level `deepCrawl` field is unchanged.

Retention runs after saves on completed owned sessions only and protects the just-returned session during that pass. Defaults: 20 sessions, 7 days, soft 512 MiB; zero disables age/size rules. An oversized returned session survives that pass but may expire later; paths are not permanently pinned. Unrelated/incomplete directories are not cleaned.

## Optional agents

With **pi-subagents** installed, the root Git and standalone manifests expose:

| Agent | Role |
| --- | --- |
| `crawl4ai.scrape` | Read a known URL; report sources and limits |
| `crawl4ai.crawl` | Bounded discovery and cross-page source-backed summary |
| `crawl4ai.extract` | Model-reasoned requested facts, missing values and labelled inference |

Each declares `package: crawl4ai`, `model: inherit`, and exactly `tools: crawl, crawl_read`, with no bash or nested subagent permissions. They are optional instructions, not an extraction engine; no deterministic CSS/XPath, schema validation, separate model/provider system, hidden model calls or automatic delegation. Ordinary tool use needs no child provider.

**Agent discovery is not tool-provider loading.** Background children can discover the configured crawling extension normally. Foreground children do not inherit ambient extensions; configure `subagents.agentOverrides` for the selected canonical agent, for example:

```json
{
  "subagents": {
    "agentOverrides": {
      "crawl4ai.scrape": {
        "subagentOnlyExtensions": ["/absolute/installed/pi-packages/packages/pi-crawl4ai/src/index.ts"]
      }
    }
  }
}
```

Use the actual installed Git path, or `/absolute/installed/pi-crawl4ai/dist/index.js` for npm; apply the same override to crawl/extract when needed. No machine-specific path is bundled. Keep the strict tool allowlist and inherited model; operator overrides/per-run model settings can intentionally replace those defaults. Confirm discovery/availability with pi-subagents' list/capabilities before an explicitly authorized launch. Missing tools fail with provider-loading guidance, never a shell scraping fallback. No global symlinks/install hooks are required.

## Development and validation

```bash
npm run test --workspace=packages/pi-crawl4ai -- --runInBand
npm run typecheck --workspace=packages/pi-crawl4ai
npm run build --workspace=packages/pi-crawl4ai
npm pack --workspace=packages/pi-crawl4ai --dry-run
# Strict real API tests (endpoint/auth configured externally; no HTTPS fallback):
CRAWL4AI_LIVE=1 npm run test --workspace=packages/pi-crawl4ai -- --runInBand src/features/crawl/liveCrawl.integration.test.ts
```

Actual deep/filter success, an authorized child launch and interactive smoke remain separate acceptance evidence; packaging/unit tests alone do not prove them. See [CONTEXT.md](CONTEXT.md) for architecture and [AGENTS.md](AGENTS.md) for package conventions.

## License

MIT

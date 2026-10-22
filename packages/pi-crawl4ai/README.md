# pi-crawl4ai

A [Pi](https://github.com/earendil-works/pi) extension using the existing remote [Crawl4AI](https://github.com/unclecode/crawl4ai) browser/API service. Egress/proxy credentials stay on the server; this client never sends proxy settings. Basic crawling needs neither Python nor pi-subagents.

| Tool | Purpose | Registration |
| --- | --- | --- |
| `crawl` | Acquire pages, discover linked pages, select regions/cards or read PDFs | Always registered; richer acquisition needs a compatible service and configuration |
| `crawl_read` | Read saved originals and derived views with exact source references | Always registered |
| `crawl_interact` | Click, scroll, wait and run browser JavaScript in an isolated remote context | Requires `capabilities.interaction: true` |

## Install

```bash
pi install git:github.com/Patrick3131/pi-packages
```

The install uses the **pi-packages root distribution**. Its versioned npm name is `@patrick3131/pi-packages`; `pi-crawl4ai` is the component name. Git installation remains supported and needs no GitHub npm registry credential. See the [root release guidance](../../README.md#versioned-npm-releases) for registry consumers.

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

Optional agents are discovered separately by pi-subagents through `pi.subagents.agents`, not through a top-level `pi.agents` field or Pi's extension filter. The workspace manifest also defines a standalone build/pack layout with `dist/index.js` and `agents/`; this is separate from the root distribution install above. For local development, load `packages/pi-crawl4ai/src/index.ts` directly or build and load `dist/index.js`.

## Configure the service and register tools

JSON is searched in the working directory, `.pi/`, then `~/.pi/agent/extensions/`, using `crawl4ai.json` before `.crawl4ai.json` in each directory. Prefer `.pi/crawl4ai.json` for project configuration. The first matching file wins; JSON files are not merged across directories. Its values take precedence over environment fallback/defaults. `${ENV_VAR}` substitution works in string values.

For the compatible operator service (`/acquire` and `/execute_js`), use:

```json
{
  "url": "http://localhost:11235",
  "apiToken": "${CRAWL4AI_API_TOKEN}",
  "timeoutMs": 60000,
  "minRequestIntervalMs": 1000,
  "outputDir": "./output-crawl4ai",
  "capabilities": {"acquisition": true, "interaction": true},
  "retention": {"enabled": true, "maxSessions": 20, "maxAgeDays": 7, "maxTotalMb": 512}
}
```

See [.env.example](.env.example) for env equivalents, including `CRAWL4AI_BASE_URL`, `CRAWL4AI_API_TOKEN`, `CRAWL4AI_TIMEOUT`, `CRAWL4AI_MIN_REQUEST_INTERVAL_MS`, `CRAWL4AI_OUTPUT_DIR` and `CRAWL4AI_TRAFILATURA_PYTHON`. Bearer authentication is retained; do not put secrets into committed config or page requests.

Both capability flags default to **false**. Ordinary `/crawl` and `crawl_read`
remain available without them. Enable them for a service that supports the
operator contract; leave them off for a legacy service. An omitted capability
block does not auto-detect server support.

| Setting | Where it is configured | Effect |
| --- | --- | --- |
| `capabilities.acquisition` / `CRAWL4AI_ACQUISITION_ENABLED` | Pi client | Routes non-deep `crawl` to `/acquire` for selectors, structured extraction and PDFs |
| `capabilities.interaction` / `CRAWL4AI_INTERACTION_ENABLED` | Pi client | Registers `crawl_interact`, which calls `/execute_js` |
| `CRAWL4AI_EXECUTE_JS_ENABLED` | Crawl4AI server | Allows the operator `/execute_js` endpoint; the compatible server must also implement the route |

### Registration and activation are separate

1. Load the extension through the installed Pi package.
2. Enable the supported capabilities in the config Pi actually selects.
3. Enable the registered tools with `/tools`, project defaults, a preset or an explicit tool allowlist.

For example, `.pi/tools.json` can include:

```json
{
  "crawl": true,
  "crawl_read": true,
  "crawl_interact": true
}
```

A tool decision or preset cannot register a missing tool. With interaction false,
`crawl_interact` never reaches `pi.registerTool()` and will not appear in `/tools`.
Include it in any research preset that should use interaction; presets replace the
active tool set. `/reload` after config changes, then enable the tool in `/tools`
or reselect the updated preset. Existing session tool selections are preserved.
After updating Pi or installed extension code, fully restart Pi to avoid stale
core/dependency exports.

## File-first output and activation

- **Omitted `save` saves complete pages.** Omitted/`auto` return mode returns compact file references.
- `save: true` uses the configured root; a string selects a custom directory. Relative paths resolve from the tool context's working directory.
- `returnMode: "inline"` returns a bounded preview **and still saves** unless `save: false` is explicit.
- `save: false` performs no disk writes and returns bounded inline content. Omitted content is not recoverable with `crawl_read`; re-crawl with saving enabled. `save: false` plus `returnMode: "files"` fails before the network request.
- `returnMode` selects file references or bounded inline previews. `maxCharsPerPage` and `maxCharsPerCall` can lower preview limits; larger values cannot lift the fixed cap. `preferFitMarkdown` defaults to false, preserving raw service Markdown; true explicitly selects a main-content view when available.
- Enable/disable registered `crawl`, `crawl_read` and `crawl_interact` with `/tools`, `.pi/tools.json`, presets or explicit CLI/child tool allowlists. The extension does not rewrite the active set at load/reload.

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

`format` supports `markdown` (default), `html`, `links`, and `text` (broad HTML rendering without Python). `waitFor` is a positive delay in milliseconds after rendering, not a CSS-selector wait. `bypassCache: true` requests bypass; omitted/false requests enabled caching. Legacy `jsCode` on `crawl` is rejected with `unsupported_capability`; browser interaction uses the dedicated `crawl_interact` service path.

Deep crawling requires one seed and supports `bfs`, `dfs`, `best-first`, integer `maxDepth`/`maxPages`, optional `includeExternal`, glob `includePatterns`/`excludePatterns`, and `allowedDomains`. Public `maxDepth: 1` is seed-only (translated to upstream depth zero). Default `maxPages` is 10. `scoreThreshold` requires best-first and a value in [0,1]. These are crawl bounds, distinct from the 20-entry display cap.

For seed plus directly linked pages, call `crawl` with:

```json
{
  "urls": ["https://example.com"],
  "deepCrawl": {"strategy": "bfs", "maxDepth": 2, "maxPages": 10, "allowedDomains": ["example.com"]}
}
```

The operator-managed `discovery-services` deployment supports narrow server-owned, non-streaming BFS/DFS/best-first construction with bounded glob/domain filters, attempted-page budgets, frontiers and a total deadline. Ordinary configuration remains untrusted; SSRF/DNS pinning and operator-only egress remain intact. Deep support is deployment-specific: the operator adapter has been verified on its Crawl4AI **0.9.5** image; do not assume a stock service accepts these strategy objects. Unsupported errors remain actionable. A health GET alone is not proof of traversal. Server limits cap depth at 5 and attempted pages at 100; raw-regex patterns and deep streaming are not supported by this operator capability.

The configured deadline covers process-local pacing, fetch, response-body reading and optional extraction. HTTP abort/cancellation **does not necessarily cancel server-side browser work**. No automatic crawl POST retries are performed. Multi-process/deep-crawl pacing belongs on the server. Invalid URLs/options, malformed responses and total page failure are errors; mixed results explicitly report partial failure, and empty ordinary page content is a warning.

## Select regions, interact and read PDFs

Enable the compatible service flags from [setup](#configure-the-service-and-register-tools).
Non-deep requests use `/acquire`; deep discovery keeps the existing bounded
`/crawl` path. Selection/extraction options cannot be combined with deep crawling.
There is no direct-fetch or local-browser fallback.

`crawl` accepts `waitForSelector`, `selector`, `excludeSelector` and
`extractionSchema: {name, baseSelector, fields:[{name, selector, type, attribute?}]}`.
Selectors are CSS; an empty field selector selects the card itself. Field type is
`text` or `attribute`. Selection/exclusions affect derived views while complete
rendered HTML stays preserved from the same snapshot.

For repeated cards, call `crawl` with:

```json
{
  "urls": ["https://example.com/talent"],
  "waitForSelector": ".creator-card",
  "extractionSchema": {
    "name": "talent",
    "baseSelector": ".creator-card",
    "fields": [
      {"name": "name", "selector": "h2", "type": "text"},
      {"name": "profileUrl", "selector": "a.profile", "type": "attribute", "attribute": "href"}
    ]
  }
}
```

`crawl_interact` is registered when interaction is enabled. For example:

```json
{
  "url": "https://example.com/talent",
  "actions": [
    { "type": "click", "selector": "button.load-more" },
    { "type": "waitForSelector", "selector": ".creator-card:nth-child(9)" }
  ],
  "scripts": ["() => Array.from(document.querySelectorAll('.creator-card')).map(el => el.textContent)"],
  "extractionSchema": {
    "name": "talent",
    "baseSelector": ".creator-card",
    "fields": [{ "name": "name", "selector": "h2", "type": "text" }]
  }
}
```

Each call uses a fresh isolated context. Click, scroll, delay, selector-wait and
JavaScript/evaluate are supported. There is no persistent authenticated profile.
Authentication, pinned operator egress, server capacity and execution deadlines
still apply. A lost response leaves browser effects unconfirmed; automatic retry
is forbidden. Closing the HTTP request does not prove server work has stopped.
The generic tool executes authorized interactions; task guidance controls whether
contact, forms or other business effects are authorized.

Complete pre/post HTML, structured extraction and operation results are saved as
separate views and returned with exact `crawl_read` references. Caller-script
influence propagates to post-script DOM and derived views through server-owned
metadata, regardless of what the script returns. Pre-script content retains its
own URL/snapshot. Influenced material stays readable/searchable; it needs
independent corroboration before a consumer treats it as website proof.

Text PDFs retain original bytes/hash, page-numbered text and document metadata.
Scanned/no-text, encrypted, oversized and inaccessible documents report explicit
per-item outcomes. OCR is not included. Use ordinary `crawl` with `format: "text"` for PDFs; `extractor: "trafilatura"` is an HTML article option. PDF bytes never reach Trafilatura and
network activity stays on the remote operator path. Cache/freshness facts remain
unknown unless the service supplies them.

### Explicit service smoke

After building the research bundle, an explicit fixture/deployment smoke records
completeness, latency, call counts and model-visible characters:

```sh
node scripts/crawl-capability-smoke.mjs PAGE_URL ARTICLE_URL ROSTER_URL PDF_URL
```

Provide `CRAWL4AI_BASE_URL` and `CRAWL4AI_API_TOKEN` through the environment. The
roster fixture uses `.card`; it runs JavaScript scrolling and structured card
reads. The command cleans its artifacts and prints metrics rather than source
content. It does not measure provider charges or assume token savings.

## Focused filtering: BM25

```json
{"urls":["https://example.com/docs"],"bm25Query":"installation","bm25Threshold":1}
```

Crawl-time BM25 supports **one URL, Markdown/text, no deep crawl**. `bm25Threshold` defaults to 1.0, must be finite and nonnegative, and requires a nonblank query. HTML/links/deep/multi-URL combinations fail preflight. Text needs no optional extractor.

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

Trafilatura is an optional, potentially lossy article view for Markdown/text. Native tables/formatting are enabled; `includeLinks` works for both ordinary output and the optional extractor. It requires saving: `save: false` is rejected. It can precede single-page BM25; in that composition `sourceFile` contains the extracted pre-filter content, and `rawHtmlFile` preserves rendered HTML.

Rendered raw HTML is saved **before** extraction. Missing Python/dependency or extraction failure returns setup guidance and an exact original HTML reference, not a silent fallback. Basic crawling remains unaffected. Input/output are bounded, the same remaining crawl deadline applies, and cancellation terminates the process with a short force-kill grace period.

Native extraction can lose navigation, headings, tables, links, images and formatting; enabling tables/links is not a fidelity guarantee. Inspect preserved HTML or re-crawl ordinary Markdown when structure matters. There is no table/image supplementation or full Markdown parser. Ordinary saved crawls retain original HTML and service Markdown; a separate pre-BM25 `sourceFile` is only needed when filtering.

## Saved sessions and retention

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

New manifests also record provenance: `request` holds the effective values that shaped the crawl (`format`, `bypassCache`, `preferFitMarkdown`, optional `waitFor`, `deepCrawl` with resolved `strategy`/`maxDepth`/`maxPages` and any filters, optional `bm25`, optional `extractor`), `service.baseUrl` is the endpoint with credentials removed, and a failed `pages[]` entry keeps a redacted `error` reason. The legacy top-level `deepCrawl` field is unchanged.

Retention runs after saves on completed owned sessions only and protects the just-returned session during that pass. Defaults: 20 sessions, 7 days, soft 512 MiB; zero disables age/size rules. An oversized returned session survives that pass but may expire later; paths are not permanently pinned. Unrelated/incomplete directories are not cleaned.

## Optional agents

With **pi-subagents** installed, the root Git and standalone manifests expose:

| Agent | Role |
| --- | --- |
| `crawl4ai.scrape` | Read a known URL; report sources and limits |
| `crawl4ai.crawl` | Bounded discovery and cross-page source-backed summary |
| `crawl4ai.extract` | Model-reasoned requested facts, missing values and labelled inference |

Each declares `package: crawl4ai`, `model: inherit`, and exactly `tools: crawl, crawl_read`, with no bash or nested subagent permissions. They are optional instructions for source-backed model reasoning. `crawl` can use the configured remote CSS/text/attribute extraction capability; these agent resources add no separate extraction/model engine, hidden model calls or automatic delegation. Their bundled allowlist excludes `crawl_interact`. Ordinary tool use needs no child provider.

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

## Saved source evidence and precise reads

Ordinary Markdown defaults to `raw_markdown`; set `preferFitMarkdown:true` only when a main-content view is intended. Ordinary text uses parse5 to retain card/list text without executing scripts. `includeLinks:true` retains useful targets without Python. Existing `pages[].file` remains the requested view, including filtered/article output.

Saved HTML acquisitions additionally retain `rawHtmlFile` and `originalMarkdownFile` as separate originals; `sourceFile` still denotes the pre-BM25 view. Each page has additive `evidence` with a distinct acquisition identity, timestamp, HTTP status/content type, usability reasons, cache status and optional `cachedAt` (null when unknown), and hashed view references. `cachedAt` is the service-supplied cache time, separate from acquisition time; a hit does not establish freshness. `details.evidence` is version 1 and its exported TypeBox schema is `CrawlEvidenceSchema`; this is shared by Coding Agent and `pi-packages/research`. Acquisition success does not imply useful evidence: known HTTP failures and empty content are diagnosed separately. Compact resource counts are metadata, not automatic article supplementation.

`crawl_read` retains legacy modes and adds exact UTF-16 ranges, omitted-content information and revision-bound `nextCall` objects. On large minified documents, query reads center on actual matches. Pass the returned next call unchanged: the exact file hash and view identity prevent a changed artifact from silently becoming another source. `ReadEvidenceSchema` describes `details.evidence`; an outline alone has no source-text ranges. Legacy manifests remain readable with unknown original provenance rather than fabricated archives.

The baseline PDF refusal (`unsupported_document`) means the configured document capability is required; it is distinct from optional Python article extraction. The capability package supplies remote PDF parsing. There is no local fetch/egress fallback and no automatic interaction retry. Consumer hosts must preserve stable error codes and corrective messages; the historical Melon host message-retention fix is already implemented there.

## Troubleshooting

| Symptom | Check / correction |
| --- | --- |
| `crawl_interact` is absent from `/tools` | Confirm the extension loaded and the selected config enables `capabilities.interaction`. Adding only a tool/preset entry cannot register it. Reload after changing config. |
| Tool is listed but inactive | Enable it in `/tools` or add it to the selected preset and reselect that preset. Existing session selections survive reload. |
| `/execute_js` returns disabled/403 | Enable the server's `CRAWL4AI_EXECUTE_JS_ENABLED`; client flags and server permission are separate. |
| `/acquire` or `/execute_js` returns 404/unsupported | Deploy the compatible operator image, or disable the corresponding client capability for a legacy service. |
| `/crawl` rejects `js_code` | Use `crawl_interact`; enabling `/execute_js` does not make legacy `jsCode` on `crawl` valid. |
| `text format requires extractor=trafilatura` | This is an old client contract. Update the installed package and restart Pi; ordinary HTML text and configured remote PDF text need no Trafilatura. |
| Missing Trafilatura Python/dependency | Only explicit article extraction needs it. Use ordinary text/raw Markdown, or configure the optional local extractor; preserved HTML remains available. |
| Interaction outcome is unconfirmed | Inspect recorded diagnostics/artifacts. Do not automatically repeat a dispatched click or script after response loss. |

## License

MIT

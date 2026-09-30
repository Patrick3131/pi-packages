---
status: done
owner: engineering
last_reviewed: 2026-09-30
canonical_ref: none
---

# Crawl Session Inspection Test Plan

## Coverage Decision

Automated coverage required for three distinct risks: persisted provenance leaking secrets or recording non-effective values, drill-down formatting exceeding its bound or selecting the wrong session, and the drill-down never entering model context. Everything else (row copy, exact command wording, additive optional fields) is proved by those cases or by a real-session check.

## Risk Coverage

| Material failure risk | Existing coverage | Cheapest stable proof | Planned change |
|---|---|---|---|
| Persisted `request` records raw params instead of effective values, or leaks `jsCode` source / a configured token into `crawl-manifest.json` | none | unit (`saveOutput.test.ts`, `crawlTool.test.ts`) | add |
| A failed page still records `success: false` with no actionable reason | none | unit (`saveOutput.test.ts`) | add |
| Drill-down prints an unbounded page list, omits exact paths/manifest, or resolves an ambiguous selector to the wrong session | none | unit (`sessions.test.ts`) | add |
| Drill-down output never reaches model context (notify-only), so "summarise 3" cannot resolve | none | unit (`index.test.ts`) + real JSON-mode session | add |
| `crawl_read` manifest outline output regresses while the renderer gains options | partial (`crawlReadTool.test.ts`) | unit (existing case) | none (defaults unchanged; existing test must stay green) |
| Session rows lose host/page count when a manifest is missing or malformed | partial (`cleanup.test.ts`) | unit (`cleanup.test.ts`) | update existing case |

## Automated Cases

1. **Manifest provenance is effective and secret-free** (implemented in `crawlTool.test.ts`) — save a mixed result set with `{format: "markdown", waitFor, bypassCache, jsCode: "<script>token=supersecret</script>", preferFitMarkdown, deepCrawl without strategy/maxPages, bm25, extractor}` plus a configured `apiToken`; expect `request.deepCrawl.strategy === "bfs"`, `request.deepCrawl.maxPages === 10`, recorded filters/`bm25`/`extractor`, `request.jsCode === true`, `service.baseUrl` without userinfo, the failed page to carry a redacted `error`, and the raw manifest text to contain neither the jsCode source nor the token. (protects: provenance correctness + secret leakage)
2. **Drill-down formatting is bounded and exact** (implemented in `sessions.test.ts`) — build a session with 25 pages, format it, and expect numbered `URL → exact path` lines for 20 entries, one `… and 5 more` remainder, the manifest path, and the request summary; then assert an ambiguous prefix returns the candidate names rather than page lines. (protects: unbounded/wrong-session output)
3. **Drill-down enters context** (implemented in `index.test.ts`, including the headless selector-error fallback) — invoke the registered `crawl-sessions` command handler with a selector under a mocked Pi API and expect exactly one `sendMessage` call carrying `customType: "crawl-sessions"`, `display: true`, `triggerTurn: false`, and no `ui.notify`; plus an unknown selector path that reports the error without a message. (protects: the feature's core promise — the model can resolve "summarise 3")

## Browser Or Manual Verification

| Step | Expected result |
|---|---|
| PTY run of `/crawl-sessions` in this repository | Rows read `1. <name>  <size> MB  <host> ×<n>  <timestamp>`; the existing 14 sessions are distinguishable by host/count |
| PTY run of `/crawl-sessions 1` | Numbered page list with exact absolute paths, the request summary when present, the manifest path, and no more than 20 page lines |
| PTY run of `/crawl-sessions does-not-exist` | Actionable error naming the searched root; no page output |
| `pi --mode json -p "/crawl-sessions 1"` (extension loaded, no model turn required) | Event stream contains the `crawl-sessions` custom message with the same page list — proves context entry |
| `crawl_read` outline of a saved manifest before/after the change | Byte-identical output |
| Baseline capture of the 14 real sessions (script `/tmp/compare-outline.mjs`, pre-change build in `/tmp/pre-crawl-inspect`) | `{"identical":true,"sessionsCompared":14}` |
| Live provenance smoke against the deployed service (`/tmp/crawl-provenance-smoke.mjs`) | `request` = `{"format":"markdown","bypassCache":true,"preferFitMarkdown":true,"waitFor":1000,"deepCrawl":{"strategy":"bfs","maxDepth":1,"maxPages":10}}`, `service={"baseUrl":"http://10.8.0.1:11235"}`, `bm25 {query,threshold}` recorded, zero configured tokens in the raw manifests |
| Headless drill-down with provenance (`pi --mode json -p "/crawl-sessions 1"`) | `Request: format=markdown, bypassCache=true, preferFitMarkdown=true, waitFor=1000ms` + `Details: deepCrawl strategy=bfs maxDepth=1 maxPages=10; service=http://10.8.0.1:11235` and the numbered page line |
| Headless unknown selector (`pi --mode json -p "/crawl-sessions nope-not-real"`) | `crawl-sessions` message: `No crawl session matches "nope-not-real" among 1 session(s) in <root>. Run /crawl-sessions for the list.` |
| PTY `/crawl-sessions` / `/crawl-sessions 1` / unknown selector (`/tmp/crawl-sessions-pty.py`) | `1. pi-dev-…-iD97PB  0.11 MB  pi.dev ×1  2026-09-30T13:07:29.762Z`; numbered `URL → exact path` with manifest path; `Warning: No crawl session matches …` |

## Commands

```sh
npm run test --workspace=packages/pi-crawl4ai -- --runInBand
npm run typecheck --workspace=packages/pi-crawl4ai
npm run build --workspace=packages/pi-crawl4ai
```

## Explicitly Not Testing

- Exact row wording/punctuation and the command description string (copy, not behavior).
- TypeBox schema shape changes (compiler-enforced).
- The 20-line cap arithmetic beyond the one boundary case, and any additional cap values.
- `crawl_read` option plumbing for numbering: the default path is covered by the existing outline case.
- Retention/cleanup interactions with the new metadata fields (no behavior change there).
- The `Pages: <totalPages>` header versus the printable-line remainder on a corrupt manifest: the remainder counts printable entries, which the reviewer confirmed is internally consistent and not worth a case.
- Live `js_code` execution: the deployed service rejects untrusted `js_code`, so the boolean-only persistence of `jsCode` is proved by the focused unit case rather than a live crawl.
- A live page-level failure is timing-dependent (the target's anti-bot behaviour varies); `/tmp/crawl-provenance-smoke.mjs` records it when it occurs, and the deterministic proof is the mixed-result unit case.

## Evidence Artifacts

- `/tmp/parent-crawl-sessions-tests.log`, `/tmp/final-workspaces.log`, `/tmp/final-typecheck.log`, `/tmp/final-build.log`
- `/tmp/crawl-sessions-list-tui.txt`, `/tmp/crawl-sessions-drilldown-tui.txt`, `/tmp/crawl-json-drilldown.out`
- `/tmp/crawl-provenance-smoke.mjs`, `/tmp/crawl-json-ctx-_crawl-sessions_1.out`, `/tmp/crawl-json-ctx-_crawl-sessions_nope-not-real.out`
- `/tmp/compare-outline.mjs`, `/tmp/pre-crawl-inspect` (pre-change HEAD worktree)

## Open Questions

None

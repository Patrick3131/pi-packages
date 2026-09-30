---
status: done
owner: engineering
last_reviewed: 2026-09-30
canonical_ref: none
---

# Crawl Session Inspection To-Do

## Tasks

### Slice A — manifest provenance

- [x] Extend `CrawlManifest` with optional `request` and `service`; add optional `error` to `CrawlManifestPage`.
- [x] Accept the provenance payload in `SaveCrawlOptions` and write it into the manifest (additive; existing `deepCrawl` field retained).
- [x] Write `error` from the already-redacted `result.error_message` for failed pages only.
- [x] Assemble the effective request in `crawlTool.ts`: resolved `strategy` (default `bfs`), `maxPages` (default 10) and `maxDepth`, filters as given, `format`, `bypassCache`, `preferFitMarkdown`, optional `waitFor`, `bm25`, `extractor`.
- [x] Record `service.baseUrl` with URL userinfo stripped; record `jsCode` as a boolean only.

### Slice B — session browsing

- [x] Expose `host?` and `pageCount?` on `CrawlSessionInfo` from the manifest parse, degrading to `undefined` on missing/invalid data.
- [x] Export the manifest overview renderer from `crawlReadTool.ts` with optional `{ numbered, maxPages }`; keep default output identical.
- [x] Add `sessions.ts`: selector resolution (index | exact name | unique prefix, with ambiguity errors) and drill-down text (header, request summary, numbered bounded page list, manifest path).
- [x] Update `/crawl-sessions` rows to include host and page count.
- [x] Route `/crawl-sessions <selector>` to the drill-down and send it with `pi.sendMessage({ customType: "crawl-sessions", display: true }, { triggerTurn: false })`; keep `notify` for the list in UI mode, and fall back to a `crawl-sessions` message for selector failures/empty listings when there is no UI.
- [x] Update the command description to advertise the selector form.

### Docs

- [x] `packages/pi-crawl4ai/README.md`: session command usage and the new manifest fields.
- [x] `packages/pi-crawl4ai/CONTEXT.md`: manifest provenance and session-inspection behavior.

## Validation

- [x] Focused case 1: manifest provenance is effective, additive, and secret-free (no `jsCode` source, no token); a failed page records a redacted `error`.
- [x] Focused case 2: session listing exposes host/page count, and drill-down formatting numbers pages, caps at 20 with a remainder, and includes exact paths plus the manifest path.
- [x] Focused case 3: `/crawl-sessions <selector>` sends one `crawl-sessions` message with `display: true` and resolves an ambiguous selector to an actionable error.
- [x] `npm run test --workspace=packages/pi-crawl4ai` passes with all pre-existing cases (212 passed / 3 opt-in skipped).
- [x] `npm run typecheck` and `npm run build` pass; root `npm run test --workspaces` and `npm run test:configs` exit 0.
- [x] Real session check: PTY `/crawl-sessions` shows host ×count rows for the existing sessions; `/crawl-sessions 1` prints numbered page paths within the 20-line cap.
- [x] Real session check: `--mode json` runs show the `crawl-sessions` drill-down message in the session event stream (proves model-context entry) and the headless selector-error message.
- [x] `crawl_read` outline output for a manifest matches its pre-change text (14/14 sessions byte-identical against a pre-change build).

## Completion

- [x] Every acceptance criterion is verified
- [x] Test plan records coverage decisions and evidence

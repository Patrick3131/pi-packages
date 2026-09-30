---
status: done
owner: engineering
last_reviewed: 2026-09-30
canonical_ref: none
---

# Crawl Session Inspection

## Type

feature

## Problem

Saved crawl sessions are opaque after the fact:

- `/crawl-sessions` lists 14 `pi-dev-*` directories with only size and time; the rows are indistinguishable, and there is no way to see which URLs or pages a session holds without reading the manifest by hand.
- The manifest records `format`, `urls`, `totalPages` and only `deepCrawl.{maxDepth,maxPages}`, so the traversal filters, browser controls and service endpoint that actually shaped a result are lost. When a crawl returns fewer pages than expected there is nothing on disk that explains why.
- A failed page records `success: false` with no reason.
- Command output goes through `ctx.ui.notify`, which never reaches the model, so "summarise 3" cannot resolve against a listed page.

## Outcome

A saved crawl is inspectable end to end:

1. `/crawl-sessions` rows identify each session by host and page count.
2. `/crawl-sessions <n|name|prefix>` drills into one session and prints its pages as numbered `URL → exact path` lines, capped at 20 with an explicit remainder, plus the request/service summary that produced it.
3. The drill-down enters model context (`pi.sendMessage` with `display: true`), so a follow-up "summarise 3" resolves without pasting paths.
4. Every new manifest records the effective request, the credential-free service base URL, and a redacted failure reason per failed page.

## Scope

### Included

- Manifest provenance: additive `request`, `service`, and per-page `error` fields written by `saveCrawlResultsDetailed`.
- Effective-value resolution (defaults applied) for deep options, recorded at save time.
- Credential/secret redaction for everything persisted, including never writing `jsCode` source.
- Session rows with host + page count, derived from the manifest already read during listing.
- `/crawl-sessions <selector>` drill-down with bounded page listing, ambiguity handling, and context entry.
- Reuse of the existing manifest overview renderer for the page list.
- Package documentation for the new manifest fields and command usage.

### Excluded

- Replay/resume engines, automatic re-crawl on partial failure, or any retry policy.
- Interactive picker/TUI wizard, page-body rendering inside the command.
- Session tags, annotations, indexes, or content search.
- An extra network call to record the service version (`/health` is not called during crawl).
- Changing `crawl_read` output for existing modes (the renderer gains optional parameters; defaults stay identical).

## Implementation Notes

- `saveCrawlResultsDetailed(outputDir, urls, results, format, deepCrawl?, options?)` owns manifest writing (`saveOutput.ts:245`). `CrawlManifest` currently hardcodes `deepCrawl: {maxDepth, maxPages}`; provenance belongs in a new optional `request` object plus `service`, with the existing `deepCrawl` field retained for compatibility with existing readers.
- Effective values: `buildDeepCrawlStrategy` already defaults `strategy` to `bfs` (`crawlTool.ts:22`) and `maxPages` to `DEFAULT_DEEP_MAX_PAGES` (10). Save the resolved values, not the raw parameters.
- `result.error_message` is redacted in place before persistence (`crawlTool.ts:186`), so per-page `error` can be copied from the result at manifest build time; keep `CrawlResult` unchanged.
- Credentials must never be persisted. `jsCode` is recorded as a boolean only. `service.baseUrl` is recorded with URL userinfo stripped. Server/proxy/token configuration is not recorded at all.
- `listCrawlSessions` already parses each manifest for validation (`cleanup.ts`); extend that parse to expose `host` (first `urls[]` entry host, falling back to first `pages[].url`) and `pageCount` (`pages.length`, falling back to `totalPages`). Missing/invalid metadata must degrade to `undefined`, never throw.
- The manifest overview renderer `buildManifestOverview` (`crawlReadTool.ts:290`) becomes exported with optional `{ numbered?: boolean; maxPages?: number }`. `crawl_read` keeps calling it with no options, so its outline output is byte-identical.
- Drill-down selector resolution: 1-based index into the same newest-first listing printed by `/crawl-sessions`, exact session name, or unique name prefix. Ambiguous prefix → error listing matching names; unknown → error stating the count searched. Selector failures stay out of the TUI message list but must not be silent headless: notify when `ctx.hasUI`, otherwise the same error as a `crawl-sessions` message.
- Deep provenance keeps depth in one place per reader: `request.deepCrawl.maxDepth` mirrors the legacy top-level `deepCrawl.maxDepth`, and the drill-down summary prints it so an inspection never suggests depth was unset.
- Context entry: the drill-down calls `pi.sendMessage({ customType: "crawl-sessions", content, display: true }, { triggerTurn: false })` in UI and non-UI modes. The plain list keeps `ctx.ui.notify` when `ctx.hasUI`, matching current behavior.
- Command description updates to advertise the selector form.
- Output bounds: at most 20 numbered pages plus a remainder line; the request summary is one or two bounded lines.

## Files

- `packages/pi-crawl4ai/src/features/crawl/saveOutput.ts` — `CrawlManifest` gains optional `request`, `service`; `CrawlManifestPage` gains optional `error`; `SaveCrawlOptions` accepts the provenance payload.
- `packages/pi-crawl4ai/src/features/crawl/crawlTool.ts` — assemble effective request + credential-free service and pass them to the save call.
- `packages/pi-crawl4ai/src/features/crawl/cleanup.ts` — `CrawlSessionInfo` gains `host?`/`pageCount?` from the manifest parse.
- `packages/pi-crawl4ai/src/features/crawl/sessions.ts` — new: selector resolution and drill-down formatting.
- `packages/pi-crawl4ai/src/features/crawl/crawlReadTool.ts` — export the manifest overview renderer with optional numbering/cap.
- `packages/pi-crawl4ai/src/index.ts` — session rows, selector handling, `sendMessage` context entry, command description.
- `packages/pi-crawl4ai/src/index.test.ts`, `packages/pi-crawl4ai/src/features/crawl/sessions.test.ts` (new), `packages/pi-crawl4ai/src/features/crawl/saveOutput.test.ts`, `packages/pi-crawl4ai/src/features/crawl/crawlTool.test.ts` — focused coverage.
- `packages/pi-crawl4ai/README.md`, `packages/pi-crawl4ai/CONTEXT.md` — current behavior and manifest fields.

## Acceptance Criteria

- [x] AC1: `/crawl-sessions` rows show host and page count from the manifest (`1. <name>  <size>  <host> ×<n>  <timestamp>`); sessions with unusable metadata still list without error.
- [x] AC2: `/crawl-sessions <n|name|prefix>` prints the selected session's pages as numbered `URL → exact path` lines, capped at 20 with a `… and N more` remainder, and always prints the manifest path.
- [x] AC3: the drill-down output enters model context through `pi.sendMessage` with `display: true` and `triggerTurn: false`; the `crawl-sessions` list keeps `notify` in UI mode.
- [x] AC4: an ambiguous or unknown selector produces an actionable error naming the candidates or the searched root, never prints another session's pages, and reaches the user in both modes — `ctx.ui.notify` under a terminal UI and the same text as a `crawl-sessions` message when there is no UI.
- [x] AC5: new manifests record `request` with effective values — `format`, `bypassCache`, `preferFitMarkdown`, optional `waitFor`, optional `jsCode: true`, `deepCrawl` with resolved `strategy`/`maxPages`/`maxDepth` plus any filters, optional `bm25 {query, threshold}`, optional `extractor {name, includeLinks}`.
- [x] AC6: `service.baseUrl` is recorded with credentials removed; `jsCode` is recorded as a boolean (`jsCode: true`) and its source never appears in the manifest.
- [x] AC7: failed pages record a redacted `error` reason; no configured token appears anywhere in `crawl-manifest.json`.
- [x] AC8: `crawl_read` outline output for a manifest is unchanged, and the previous 209 package tests plus new focused cases pass.

## Validation

`npm run test --workspace=packages/pi-crawl4ai` (212 passed / 3 opt-in skipped), `npm run typecheck`, `npm run build`, root `npm run test --workspaces` + `npm run test:configs` (all exit 0), plus real-session checks: PTY `/crawl-sessions` and `/crawl-sessions 1` against the existing 14 sessions, `--mode json` runs proving the drill-down and headless selector errors are session messages, a live provenance smoke against the deployed service (effective `request`, credential-free `service`, per-page `error`), and a pre-change-vs-current byte comparison of `crawl_read` outline output over all 14 sessions. Details and artifact paths live in the companion test plan.

## Open Questions

None

---
status: done
owner: engineering
last_reviewed: 2026-09-21
canonical_ref: none
---

# pi-recap: browse a session as user questions with short, expandable answers

## Type

feature

## Problem

Session transcripts are hard to re-read. The terminal requires scrolling through
large tool outputs, and the built-in `/export` HTML viewer filters its sidebar
tree only — the main pane still renders every tool call and tool result in full.
After a long session, the operator cannot quickly answer "what did I actually ask
and what came out of it?".

## Outcome

A new `pi-recap` package registers `/recap` and the alias `/user-messages`.

- Running `/recap` renders the current session branch as a standalone HTML file:
  every user message in full, each assistant answer shortened to a configurable
  preview, and the full answer available behind a per-exchange expander.
- The page ships a sticky toolbar (search, filter chips, expand/collapse),
  a scrollspy table of contents, keyboard navigation (`/`, `j`, `k`, `e`, `c`),
  a persisted theme toggle, and copy buttons.
- Prompts and answers render a practical Markdown subset (headings, lists, tables,
  fenced code, emphasis, links) so the page reads like documentation. Session
  HTML is escaped, not executed, and unsafe link schemes degrade to text.
- Tool calls, tool results, thinking blocks, system prompts, and compaction
  entries are removed from the recap; a muted one-line tool summary per exchange
  (`🔧 14 calls: bash ×9, read ×5`) preserves the fact that work happened.
- The file is written to `~/.pi/agent/recaps/` (override with `PI_RECAP_DIR`),
  opened in the default browser, and the path is reported in the TUI.
- `/recap --summarize` adds a 2–3 sentence model-written TL;DR per exchange.
  Summaries are cached per exchange by content hash, so re-running only pays for
  new or edited messages. The model call uses a small transcript (user prompts +
  assistant answer text only), a configurable cheap model, `reasoning: "off"`,
  capped output tokens, and a pre-flight cost estimate.
- `/recap --summarize` falls back to the truncated recap when the model call
  fails; it never blocks HTML generation.
- `/recap auto on` enables a `turn_end` hook that keeps the summary cache current
  for the session so later recaps are free and instant. Off by default.

## Scope

### Included

- New package `packages/pi-recap` with pure, unit-tested modules and a thin
  extension entry point.
- Commands: `/recap` and alias `/user-messages`.
- Flags: `--session <id|path>`, `--limit <n>`, `--full`, `--preview <chars>`,
  `--text`, `--no-open`, `--summarize`, `--model <provider/id>`, `--yes`,
  `--help`, and `auto on|off|status`.
- HTML output: sticky table of contents, in-page search filter, expand/collapse
  all, light/dark via `prefers-color-scheme`, no network assets.
- Markdown rendering for prompts and answers with fence-aware preview splitting.
- Text output (`--text`) for terminal-friendly reading.
- Summary cache and settings under `~/.pi/agent/recaps/`.
- Root workspace registration (`package.json` `pi.extensions`), root `README.md`,
  root `AGENTS.md`, package `README.md`/`AGENTS.md`/`CONTEXT.md`.

### Excluded

- Cross-session library/index across all past sessions (discussed as follow-up
  idea C; the per-session package keeps `--session` targeting).
- Full CommonMark compliance; the renderer is a practical subset for model output.
- Markdown rendering in `--text` output; that stays Markdown source.
- Reusing pi's internal export template/`exportSessionToHtml` (not part of the
  package's public export surface).
- Publishing/committing the package beyond the repository working tree.

## Implementation Notes

- pi exposes `ExtensionAPI.registerCommand(name, { handler })`,
  `pi.exec(command, args)`, `ctx.ui.notify/confirm`, `ctx.sessionManager
  (getBranch/getEntries/getSessionFile/getSessionId)`, `ctx.cwd`, `ctx.hasUI`,
  `ctx.modelRegistry.find(provider, id)`, and
  `ctx.modelRegistry.completeSimple(model, context, options)` returning an
  `AssistantMessage` with `usage.cost.total`. Cost rates are USD per 1M tokens.
- Session files are JSONL. The recap reads the current branch from
  `ctx.sessionManager.getBranch()`; for `--session` it parses the file and walks
  parent pointers from the last entry (append order makes the last entry the
  active leaf).
- Message parsing follows `docs/session-format.md`: user content is `string` or
  `(TextContent | ImageContent)[]`; assistant content is
  `(TextContent | ThinkingContent | ToolCall)[]`; skip `toolResult`,
  `custom_message`, `bashExecution`, `compaction`, `branch_summary`, `label`,
  `model_change`, `thinking_level_change`, `usage`, `session_info`, and system
  messages for the recap body.
- Message text is Markdown rendered with a dependency-free, escaping-first
  renderer (`src/markdown.ts`): code spans and autolinks are stashed, the rest is
  escaped, link schemes are checked, and previews split at block boundaries
  outside fences so collapsed answers stay balanced.
- Summaries are keyed by user entry ID and validated by SHA-1 over the
  prompt+answer text. The incremental request includes cached TL;DRs as compact
  context so continuity survives incremental runs.
- Chunking keeps each provider request under a token budget estimated as
  `chars / 4`; there is no merge call because every chunk returns its own keys.
- Follow repository conventions: `node:test` with `tsx`, strict TypeScript,
  `No automated test needed` only where justified.

## Files

- `packages/pi-recap/src/index.ts` — extension entry; command registration, orchestration, browser open, confirm, auto mode
- `packages/pi-recap/src/args.ts` — `/recap` flag parsing
- `packages/pi-recap/src/session.ts` — JSONL parse, branch walk, exchange extraction, session file resolution
- `packages/pi-recap/src/text.ts` — truncation and text helpers
- `packages/pi-recap/src/escape.ts` — HTML escaping
- `packages/pi-recap/src/markdown.ts` — Markdown subset renderer and fence-aware preview split
- `packages/pi-recap/src/html.ts` — standalone HTML renderer
- `packages/pi-recap/src/text-report.ts` — plain-text renderer
- `packages/pi-recap/src/summarize.ts` — transcript build, chunking, response parsing, cache, cost estimate, model runner
- `packages/pi-recap/src/config.ts` — recap dir/model/auto settings resolution
- `packages/pi-recap/test/*.test.ts` — unit and integration-style tests
- `packages/pi-recap/package.json`, `tsconfig.json`, `README.md`, `AGENTS.md`, `CONTEXT.md`
- `package.json` — register the extension in `pi.extensions`
- `README.md`, `AGENTS.md` — list the new package
- `docs/work/work/2026-09-21-feature-pi-recap-user-messages*.md` — this package

## Acceptance Criteria

- [x] `/recap` (and `/user-messages`) writes an HTML file that contains every user message on the active branch in order, each with a shortened assistant answer and an expander for the full answer.
- [x] Prompts and answers render Markdown (headings, lists, tables, fenced/inline code, emphasis, links); raw session HTML is escaped and never executed, and `javascript:` link targets degrade to text.
- [x] Collapsed previews split at block boundaries outside code fences, so an expander never starts from a half-open fence.
- [x] Tool results, thinking blocks, system messages, and compaction bodies do not appear in the recap body; tool activity is summarized as a per-exchange count line.
- [x] `--full` disables truncation; `--limit N` keeps only the last N exchanges; `--preview N` changes the collapsed preview length.
- [x] `--text` writes a plain-text recap and `--no-open` suppresses browser launch; otherwise the default browser opens the written file.
- [x] `--session <id|path>` recaps a past session without touching the live session.
- [x] `--summarize` attaches a TL;DR per exchange, reports estimated cost before the call and actual usage after, and renders the recap even when the model call fails.
- [x] Re-running `--summarize` with unchanged content performs no model call (cache hit); edited or new exchanges are the only ones sent.
- [x] `/recap auto on` persists a setting that summarizes new exchanges on `turn_end`; `/recap auto status` reports it.
- [x] `npm test --workspace=packages/pi-recap`, `npm run typecheck --workspace=packages/pi-recap`, and `npm run lint --workspace=packages/pi-recap` pass.
- [x] A real session on this machine renders correctly in a browser (manual check recorded in the test plan).

## Validation

Unit tests cover parsing, extraction, truncation, HTML escaping/markup, the
Markdown subset and preview splitting, argument parsing, transcript building,
response parsing, cache/incremental planning, and cost estimation. An
integration-style test drives the summarize runner with a fake model completion
to prove caching, session-id forwarding, and fallback, and another drives the
real command handler with a fake pi context. Evidence: 61 tests passing,
clean typecheck/lint/build, mutation checks on escaping and cache hashing, a
live provider run (284 input tokens, $0.000213, second run cached), and manual
browser checks on real 3 MB, 19 MB session / 2.1 MB and 46 MB session files.
Details and commands live in `2026-09-21-feature-pi-recap-user-messages-test.md`.

## Open Questions

None

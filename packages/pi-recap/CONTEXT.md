# pi-recap — CONTEXT.md

## Purpose

Explain the architecture behind the recap package. Rules live in `AGENTS.md`;
user-facing behavior lives in `README.md`.

## Data flow

```
/recap <flags>
   │
   ├─ args.ts        parse flags
   ├─ session.ts     current session file (ctx.sessionManager) or live branch
   │                 JSONL → entries → active branch → exchanges
   ├─ summarize.ts   optional: plan pending vs cached → estimate → call model → cache
   ├─ document.ts    build the renderer document
   └─ html.ts        render (markdown subset) → write file → open browser
      text-report.ts
```

Exchange extraction groups the active branch into `user → assistant text`
blocks. `toolResult`, `custom_message`, `bashExecution`, `compaction`,
`branch_summary`, `system`, and label/model/thinking entries contribute counts
at most; they never contribute text.

## Session source

- Live session: `ctx.sessionManager.getSessionFile()`; when the session is
  ephemeral, `getBranch()` is converted directly.
- Branch selection walks `parentId` from the last entry. Fully linear files
  (older sessions with no parent links) fall back to file order.

## Markdown rendering

`markdown.ts` renders a practical subset for prompts and answers: headings,
ordered/unordered nested lists, pipe tables, fenced and inline code,
blockquotes, horizontal rules, emphasis, strikethrough, and links.

Safety model:

1. Code spans, explicit `<https://…>` autolinks, and backslash escapes are stashed
   from the raw text.
2. The rest is HTML-escaped before any tag is generated, so session HTML can
   never execute.
3. Link targets are scheme-checked (`http`, `https`, `mailto`, `#`); anything
   else degrades to plain text. Bare URLs are not auto-linked.

Previews use `splitMarkdown`, which cuts at blank-line block boundaries outside
fences, so each half renders standalone and a collapsed answer never shows an
unclosed code fence. When no boundary exists, it falls back to `truncateAtLine`.
The `--text` renderer keeps the Markdown source unchanged.

## Renderer contract

`RecapDocument` is the only input to both renderers, so HTML and text output can
never disagree about which exchanges or summaries exist.

Answer rendering uses `truncateAtLine`: the head is visible, the tail lives
inside a `<details>` expander. `previewChars === Infinity` (`--full`) disables
both the split and the expander.

## Summary cache

`summary-<session>.json`:

```json
{
  "version": 1,
  "entries": {
    "<userEntryId>": { "hash": "<sha1(prompt + answer)>", "text": "tl;dr …" }
  }
}
```

- `planSummary` treats an exchange as cached only when the stored hash matches
  the current text. Edited answers invalidate their own entry.
- Pending exchanges are chunked by a token budget estimated as `chars / 4`; each
  chunk is one completion, so there is no merge call.
- Cached TL;DRs are prepended as compact continuity context for incremental runs.
- Empty-string summaries are cached too, so trivial exchanges are not re-asked.
- The model response is parsed as JSONL (fenced or not), tolerating malformed
  lines and accepting `tl;dr`/`tldr`/`summary` keys.

## Model call

`runSummarize` depends on the structural `RecapModelRegistryLike`
(`streamSimple` → `.result()`, or `complete`), not on a specific
pi-coding-agent version. This keeps the package typecheckable against older
local package versions while running against the installed pi.

Options: `reasoning: "off"`, `temperature: 0.2`, `maxTokens` capped at 4000,
`cacheRetention: "short"`, `sessionId` forwarded for session-routed providers,
`signal` from the command context.

A `confirm` callback gates the call; the extension wires it to a cost-estimate
dialog unless `--yes` is passed or no UI is available.

## Auto mode

`/recap auto on` stores the setting in the recap dir's `settings.json`. The
`turn_end` handler re-reads the session file, summarizes only pending exchanges,
and writes the cache. It is best-effort: a module-level guard prevents
overlapping runs, and errors are reported without disturbing the turn.

## HTML UI

The page is a single dependency-free file with two inline scripts: a theme
initializer in `<head>` (sets `data-theme` from `localStorage` before first
paint) and the main behavior script at the end of `<body>`.

- Toolbar: multi-token AND search, filter chips driven by
  `data-summary`/`data-tools`/`data-answered` attributes, expand/collapse all,
  and a live result count.
- TOC: sticky on desktop, a `Contents` drawer under 900px; `IntersectionObserver`
  sets `.is-active` and `aria-current` on the section in view.
- Keyboard: `/` focus search, `Esc` clear, `j`/`k` move between visible
  exchanges, `e`/`c` toggle expanders. Shortcuts are ignored while typing.
- Theme: system → light → dark cycle persisted as `recap-theme`.
- Per-exchange `Copy` writes the rendered prompt and answer with
  `navigator.clipboard`.
- The `?` help panel documents shortcuts and commands inside the page. It is a
  native `<dialog>` opened with `showModal()`, so it stays visible at any scroll
  position; `Esc`, the close button, or a backdrop click dismisses it.
- `messages` mode (`--messages`) renders the same exchange list without
  summaries, tool lines, filter chips, or expanders; full answers, full prompts.
- Message data is never interpolated into script text; all dynamic content in
  markup is escaped or restricted to numbers, booleans, and sanitized ids.

## Retention cleanup

Every command that generates a recap calls `pruneRecapFiles`, which deletes
`recap-*.html` and `recap-*.txt` files older than the retention window
(`PI_RECAP_RETENTION_DAYS`, settings `retentionDays`, default 14 days; `0`
disables). The selector is name-restricted, so `summary-*.json`, `settings.json`,
and anything else in the directory is never touched. Deletions are silent except
for one info notification when at least one file was removed.

## Output files

Written under the recap dir (default `~/.pi/agent/recaps`, override
`PI_RECAP_DIR`): `recap-<session>-<timestamp>.html|.txt`, the summary cache, and
`settings.json`.

## Testing

Unit tests cover parsing, extraction, truncation, HTML escaping and markup,
argument parsing, transcript building, response parsing, cache planning, cost
estimation, and the model runner with fake registries. `extension.test.ts` drives
the real command handler and auto hook with a fake pi/context and a temp recap
dir, proving file output, flag handling, cache reuse, confirm decline, and model
failure fallback without network access.

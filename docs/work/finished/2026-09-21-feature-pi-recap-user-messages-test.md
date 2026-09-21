---
status: done
owner: engineering
last_reviewed: 2026-09-21
canonical_ref: 2026-09-21-feature-pi-recap-user-messages.md
---

# pi-recap: browse a session as user questions with short, expandable answers — Test Plan

## Coverage Decision

Automated coverage required

Reason: the feature parses untrusted session JSONL into HTML, renders untrusted
Markdown into that HTML, computes cache keys that decide whether the operator is
billed again, and derives a transcript that is sent to a provider. Parsing,
escaping, cache-keying, fallback behavior, and the static inline UI script are
material production risks that fail silently if wrong.

## Risk Coverage

| Material failure risk | Existing coverage | Cheapest stable proof | Planned change |
|---|---|---|---|
| Branch walk/extraction drops assistant text, leaks tool results into answers, or misgroups exchanges | none | unit (`session.ts`) | add |
| Message text is injected unescaped into HTML or expander markup is malformed | none | unit (`html.ts`) | add |
| Rendered Markdown executes session-supplied HTML or links to unsafe schemes | none | unit (`markdown.ts`) | add |
| A collapsed preview cuts inside a code fence and renders the tail as prose | none | unit (`markdown.ts`) | add |
| Truncation splits mid-line or loses the full remainder | none | unit (`text.ts`) | add |
| Flag parsing accepts invalid values or loses `--session`/`--model` arguments | none | unit (`args.ts`) | add |
| Cache keying returns stale TL;DRs or re-sends unchanged exchanges | none | unit (`summarize.ts`) | add |
| Unparseable or fenced model output crashes the recap instead of falling back | none | unit + fake-model integration (`summarize.ts`) | add |
| Cost estimate/usage reporting is wrong or missing | none | unit (`summarize.ts`) | add |
| Command wiring loses flags, files, or alias behavior | none | integration-style with fake `pi`/`ctx` (`extension.test.ts`) | add |
| Toolbar, filter, scrollspy, or keyboard wiring regresses in the generated page | none | unit (`html.ts`) + inline-script syntax check + manual browser | add |

## Automated Cases

Default to zero to three new cases. Add more only for distinct named risks.

- Given a JSONL branch with system, user, assistant-text, assistant-tool-call,
  tool-result, and compaction entries, when extraction runs, then only user
  messages start exchanges, assistant text is joined, tool names are counted, and
  tool/system/compaction content never appears in the answer text.
- Given a >preview assistant answer, when truncation runs, then the visible head
  ends at a line boundary, `truncated` is true, and head+tail reconstruct the
  original text.
- Given message text containing `<script>`, quotes, ampersands, and newlines,
  when HTML is rendered, then the raw markup is escaped, the exchange carries an
  id, and a `<details>` expander exists exactly when content was truncated.
- Given Markdown with headings, lists, tables, fences, emphasis, and links, when
  it is rendered, then structures render as tags and raw HTML, `<img onerror>`,
  and `javascript:` links never become executable markup.
- Given a long answer whose first block is a paragraph and whose second block is a
  fenced code sample, when the preview is split, then the head excludes the code
  block, the tail keeps it, and the source is preserved.
- Given cached summaries keyed by entry ID and content hash, when the plan runs
  with one unchanged and one edited exchange, then only the edited and new
  exchanges are requested and the cached TL;DR is preserved.
- Given a model response wrapped in a markdown fence with valid JSONL plus one
  malformed line, when parsing runs, then valid summaries are returned and the
  malformed line is ignored.
- Given a model call that throws, when the runner executes, then it returns a
  failure result with the cached summaries intact and no exception escapes.
- Given a confirm is declined, when `--summarize` runs, then no model call is
  made and the recap still renders.
- Given `/recap --limit 2 --full --session abc --model x/y`, when the command
  handler runs, then the parsed options are applied to the rendered document and
  the model runner receives `x/y`.

## Browser Or Manual Verification

Evidence recorded 2026-09-21: 61 automated tests passing; live summarize run
(`opencode-go/deepseek-v4-flash`, 284 input tokens, $0.000213, second run fully
cached); real-session rendering at 3 MB, 2.1 MB, and 46 MB inputs (97–99.94%
smaller); both inline scripts parsed without syntax errors; browser review of
the reworked page opened from `~/.pi/agent/recaps`.

| Step | Expected result |
|---|---|
| `node --import tsx packages/pi-recap/src/cli.ts --session <real .jsonl> --no-open` (or the packaged entry) writes a recap | HTML file exists in `~/.pi/agent/recaps` with one section per user message |
| Open the HTML in a browser | TOC scrolls to exchanges and highlights the active section; search and filter chips hide non-matching exchanges; expand/collapse toggles full answers; keyboard `/`, `Esc`, `j`, `k`, `e`, `c` work; theme toggle persists; copy button copies the exchange; long answers show a preview plus expander; headings, lists, tables, and code blocks render styled instead of showing `##`/`**`/backticks |
| Run `/recap --text --no-open` in pi | Plain-text recap file contains `## 1.` style headings and truncated answers |
| Run `/recap --summarize --yes` with provider auth configured | TL;DRs appear per exchange, notify reports tokens/cost; re-running reports cache hits and makes no new call |
| Extract both inline scripts from a generated page and parse them with `new Function` | No syntax errors; toolbar, filters, scrollspy, keyboard, and theme markers present |
| Headless Chrome `elementFromPoint` hit-test of every TOC link at 1280×813, 1280×400, 1280×330, 1280×600, 900×700, and 500×700 (drawer) | Every TOC link is reachable; sticky offsets use the measured toolbar height; the sidebar falls back to the full-height `Contents` drawer under 520px viewport height |

## Commands

```sh
npm test --workspace=packages/pi-recap
npm run typecheck --workspace=packages/pi-recap
npm run lint --workspace=packages/pi-recap
npm run build --workspace=packages/pi-recap
```

## Explicitly Not Testing

- CSS classes, color values, and exact copy in the HTML template.
- The `open`/`xdg-open`/`start` platform branches beyond a manual check.
- `ctx.modelRegistry` internals; the runner is tested against a fake completion.
- Browser DOM behavior (search/expand) via a headless framework; verified
  manually because a DOM harness would duplicate the rendered HTML assertions.
- Full CommonMark edge cases (setext headings, reference links, footnotes).
- Syntax highlighting inside fenced code; content is monospace and escaped.

## Open Questions

None

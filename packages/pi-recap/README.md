# pi-recap

Turn a Pi session into a re-readable recap: every user question in full, each
answer shortened with a per-exchange expander, and no tool noise. Written as a
single-file HTML page that opens in the browser, or as plain text.

## Why this exists

Re-reading a session in the terminal means scrolling past tool calls, tool
results, and thinking blocks. Pi's `/export` writes an HTML viewer, but its
`User` and `No-tools` filters only narrow the sidebar tree — the main pane still
renders every tool result in full. `pi-recap` renders only what the operator
wants to remember: the questions, a short preview of each answer, and the fact
that tools ran.

On a real 2.1 MB session, the recap HTML was ~24 KB: a 98.9% reduction.
Prompts and answers render a practical Markdown subset — headings, lists,
tables, fenced code, emphasis, links — so the recap reads like documentation
instead of raw syntax.

## Install

```bash
pi install /absolute/path/to/pi-packages/packages/pi-recap
# or project-local:
pi install -l /absolute/path/to/pi-packages/packages/pi-recap
```

## Commands

`/recap` and `/user-messages` are aliases.

```text
/recap                                  recap the current session in the browser
/recap --messages                       plain transcript: full answers, no tool lines, no summaries
/recap --full                           full answers, keep the recap chrome
/recap --limit 20                       only the last 20 exchanges
/recap --preview 600                    longer collapsed preview (default 320 chars)
/recap --text --no-open                 write a plain-text recap instead
/recap --summarize --yes                add model-written TL;DRs per exchange
/recap --summarize --model opencode-go/deepseek-v4-flash
/recap auto on | off | status           keep summaries fresh after every turn
/recap help                             show all options
```

| Flag | Meaning |
| --- | --- |
| `--limit <n>` | Keep only the last `n` exchanges |
| `--preview <chars>` | Collapsed answer preview length |
| `--full` | Disable answer truncation |
| `--messages` | Plain transcript: full answers, no tool lines, no summaries |
| `--text` | Write `.txt` instead of `.html` (does not open a browser) |
| `--no-open` | Do not launch the browser |
| `--summarize` | Add cached model-written TL;DRs |
| `--model <provider/id>` | Summarizer model for `--summarize` |
| `--yes` | Skip the summarize cost confirmation |
| `help`, `--help` | Show all options |
| `auto on\|off\|status` | Persist the background summarizer setting |

## What the HTML contains

- a sticky toolbar with search (`/` to focus), filter chips
  (`All`, `Summarized`, `With tools`, `Unanswered`), `Expand all`, and
  `Collapse all`;
- a sticky table of contents of every user question that highlights the section
  you are reading and collapses into a `Contents` drawer on small screens;
- the full prompt text per exchange, rendered as Markdown;
- the answer shortened to `--preview` characters, with a `Show full answer`
  expander when it was cut;
- a per-exchange `Copy` button and a back-to-top button;
- keyboard shortcuts: `/` search, `Esc` clear, `j`/`k` next/previous exchange,
  `e` expand all, `c` collapse all;
- a theme toggle that cycles system → light → dark and remembers the choice;
- a muted `🔧 N tool calls · bash, read · 1 error` line so you can see work
  happened without reading any tool output;
- accessible landmarks, focus styles, a skip link, and reduced-motion support;
- a `?` help panel (also `?` key) with keyboard shortcuts and every command,
  opened as a modal dialog so it is visible at any scroll position.

Markdown covers headings, ordered and unordered (nested) lists, tables, fenced
and inline code, blockquotes, rules, emphasis, strikethrough, and links. Raw HTML
in a session is escaped and never executed, and `javascript:` links are dropped
to plain text. Previews split at block boundaries outside code fences, so a
collapsed answer never shows a half-open code block.

Tool calls, tool results, thinking blocks, system prompts, and compaction
bodies never appear in the recap.

## Summaries (`--summarize`)

Summaries are deliberately cheap:

1. Only user prompts and assistant answer text are sent (typically a few percent
   of the session).
2. One request covers all pending exchanges; long sessions are chunked at a
   token budget instead of one call per exchange.
3. Results are cached in `~/.pi/agent/recaps/summary-<session>.json`, keyed by
   entry id and a SHA-1 of the exchange text. Re-running only sends new or
   edited exchanges, and cached TL;DRs are included as continuity context.
4. The call uses a small model with `reasoning: "off"` and capped output.
5. The estimated cost is shown before the call (`--yes` skips the prompt), and
   the actual cost is reported after it.
6. If the model call fails, the recap still renders with truncated answers.

Real run (two exchanges, `opencode-go/deepseek-v4-flash`): 284 input tokens,
$0.000213, and a second run with zero model calls.

Default model resolution: `--model` → `PI_RECAP_MODEL` → `settings.json` →
active session model. Prefer an explicit cheap model.

### Auto mode

`/recap auto on` persists `auto: true` and summarizes each completed turn in the
background, so `/recap` is instant and free later. It is off by default. Pair it
with `recapModel`/`PI_RECAP_MODEL` so background work does not use a premium
session model.

## Files

```
~/.pi/agent/recaps/
├── recap-<session>-<timestamp>.html   generated recaps
├── recap-<session>-<timestamp>.txt    --text output
├── summary-<session>.json             per-exchange summary cache
└── settings.json                      auto/model/dir/retention settings
```

Generated `recap-*.html` / `recap-*.txt` files are deleted when they are older
than the retention window (14 days by default). Summary caches and
`settings.json` are never removed, so incremental summaries keep working.

## Configuration

| Setting | Env | Notes |
| --- | --- | --- |
| Output directory | `PI_RECAP_DIR` | Default `~/.pi/agent/recaps` |
| Summarizer model | `PI_RECAP_MODEL` | `provider/model-id` |
| Auto summaries | `PI_RECAP_AUTO` | `1`/`0`, overrides settings |
| Retention | `PI_RECAP_RETENTION_DAYS` | Default 14; `0` keeps recaps forever |
| Settings `dir` | — | Relative paths resolve against the recap dir |
| Settings `model` | — | Same format as `PI_RECAP_MODEL` |
| Settings `retentionDays` | — | Same as the env variable |

`PI_RECAP_DIR` also moves `settings.json`, which is handy for tests.

## Limitations

- Markdown support is a practical subset (headings, lists, tables, fenced and
  inline code, emphasis, links, blockquotes, rules); full CommonMark edge cases
  are out of scope. `--text` output stays plain Markdown source.
- Summaries depend on provider auth; without it, `--summarize` warns and the
  truncated recap is still written.
- Cross-session browsing/index is not part of this package.

## Development

```bash
npm test --workspace=packages/pi-recap
npm run typecheck --workspace=packages/pi-recap
```

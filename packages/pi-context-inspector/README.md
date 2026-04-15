# pi-context-inspector

Pi extension that inspects the current effective system prompt and captured provider payload, then exports a self-contained HTML report plus sibling JSON.

## What it does

Adds a `/context-report` command that:

1. collects the current effective system prompt
2. captures the latest provider request payload via `before_provider_request`
3. normalizes visible request sections such as instructions, conversation messages, and tools
4. compares normalized payload estimates, serialized request JSON estimates, and runtime context usage metadata
5. discovers relevant prompt source files
6. traces base-prompt contributions where possible
7. writes HTML + JSON reports to a temp directory
8. opens the HTML report in your default browser when possible

## What it inspects

- effective system prompt via `ctx.getSystemPrompt()`
- latest captured provider payload via `before_provider_request`
- normalized payload sections such as system/developer instructions, conversation messages, tools, and unclassified request fields
- current-context summary showing the best available view of what is in context right now
- normalized payload estimate vs serialized request JSON estimate vs `ctx.getContextUsage()`
- prompt sections such as base prompt, appended system text, AGENTS files, skills, metadata
- tool definition burden from registered tools
- discovered global/project `SYSTEM.md`, `APPEND_SYSTEM.md`, and `AGENTS.md` files
- inferred base prompt provenance from extension tool snippets and prompt guidelines
- context usage metadata when available

## How to read the report

The HTML report now distinguishes four commonly confused numbers:

- **Effective system prompt**: text returned by `ctx.getSystemPrompt()`. This is the visible assembled system prompt only.
- **Normalized payload estimate**: best-effort estimate of the parts of the captured request the report could classify into instructions, conversation, and tools.
- **Serialized request JSON estimate**: estimate of the captured request body serialized as JSON text. This is useful for debugging but is **not** the same thing as exact provider context usage or billing.
- **Runtime context usage**: `ctx.getContextUsage()` metadata when Pi exposes it. This may differ from visible request JSON because providers can add framing, defaults, cached/session state, and hidden accounting.

The report also calls out:

- **Request JSON minus normalized payload**: the portion of the captured request JSON estimate that was not mapped into the normalized instruction/message/tool buckets
- **Raw JSON tree/object size**: report/export artifact size, not exact model-context size
- **Best available current context**: prompt-only if no payload has been captured yet, otherwise prompt + latest captured payload with explicit caveats when visibility is partial

## Completeness and caveats

When available, the report captures the actual provider request payload via `before_provider_request` and analyzes it as the best available view of the current session context.

Important caveats:

- completeness still depends on what Pi exposes in the hook for the active provider
- token accounting is approximate and may differ from provider billing
- some multimodal/provider-specific fields are only partially normalized
- the first payload-backed report requires at least one prior model turn after the extension is loaded
- if hook visibility is insufficient, pair this with `pi-llm-debugging` for deeper raw request logging
- OpenAI Responses payloads may contain top-level `instructions`; the report now classifies those as normalized system/developer instructions instead of leaving them unclassified

## Installation

```bash
pi install npm:pi-context-inspector
```

Or install locally during development from this repo.

## Usage

```bash
/context-report
```

The command writes reports to a temp directory like:

```text
/tmp/pi-context-inspector/context-report-<timestamp>.html
/tmp/pi-context-inspector/context-report-<timestamp>.json
```

## Notes

- Browser opening is best-effort and non-blocking.
- If opening fails, the report files are still written and their paths are shown.
- The HTML report is self-contained.
- Captured payloads are persisted under `.pi/context-inspector/<session-id>/captures/` when possible, otherwise temp storage is used as a best-effort fallback.
- Large/sensitive provider payload fields are sanitized, truncated, and may be redacted in saved snapshots.
- Zero-value normalized buckets are hidden or de-emphasized in the HTML report to keep focus on meaningful sections.

## Future ideas

- `--no-open`
- `--output <dir>`
- diffing reports
- redaction mode
- latest-report shortcut

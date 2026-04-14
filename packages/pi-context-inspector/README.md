# pi-context-inspector

Pi extension that inspects the current effective system prompt and related context burden, then exports a self-contained HTML report plus sibling JSON.

## What it does

Adds a `/context-report` command that:

1. collects the current effective system prompt
2. analyzes prompt sections and token burden
3. discovers relevant prompt source files
4. traces base-prompt contributions where possible
5. writes HTML + JSON reports to a temp directory
6. opens the HTML report in your default browser when possible

## What it inspects

- effective system prompt via `ctx.getSystemPrompt()`
- prompt sections such as base prompt, appended system text, AGENTS files, skills, metadata
- tool definition burden from registered tools
- discovered global/project `SYSTEM.md`, `APPEND_SYSTEM.md`, and `AGENTS.md` files
- inferred base prompt provenance from extension tool snippets and prompt guidelines
- context usage metadata when available

## What it does not claim to inspect

MVP does **not** claim to show the exact full provider request payload including conversation history. For raw provider payload capture, pair this with a package like `pi-llm-debugging`.

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

## Future ideas

- `--no-open`
- `--output <dir>`
- diffing reports
- redaction mode
- latest-report shortcut

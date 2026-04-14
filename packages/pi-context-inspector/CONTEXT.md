---
owner: repo-maintainers
last_verified: 2026-04-14
applies_to: /**
inherits_from: /Users/patrick/Development/pi-packages/AGENTS.md
canonical_for: System architecture and data flow for pi-context-inspector
---

# CONTEXT.md

## Overview

`pi-context-inspector` is a Pi extension that adds a `/context-report` command. The command collects the current effective system prompt and related runtime metadata, analyzes prompt burden using logic adapted from `pi-token-burden`, writes a self-contained HTML report plus sibling JSON, and attempts to open the HTML report in the default browser.

## Architecture

```text
/context-report
  -> src/index.ts
  -> src/collect-report.ts
     -> src/parser.ts
     -> src/path-discovery.ts
     -> src/file-reading.ts
     -> src/base-trace/*
  -> src/report-json.ts
  -> src/report-html.ts
  -> src/open-browser.ts
```

## Data sources

- `ctx.getSystemPrompt()` for the effective assembled system prompt
- `pi.getAllTools()` for registered tool definitions
- `ctx.getContextUsage()` for context window metadata when available
- filesystem discovery for `SYSTEM.md`, `APPEND_SYSTEM.md`, and `AGENTS.md`
- extension discovery for base prompt trace attribution

## Output model

The canonical report object is the source of truth for both HTML and JSON output. HTML is a presentation layer only.

## Scope boundary

The package focuses on:
- effective system prompt
- prompt section burden
- discovered source files feeding prompt construction
- tool definition burden
- inferred base prompt provenance

It does not claim to expose the exact full provider payload including conversation history.

---
owner: repo-maintainers
last_verified: 2026-04-15
applies_to: /**
inherits_from: /Users/patrick/Development/pi-packages/AGENTS.md
canonical_for: System architecture and data flow for pi-context-inspector
---

# CONTEXT.md

## Overview

`pi-context-inspector` is a Pi extension that adds a `/context-report` command and passively captures provider payloads. The command collects the current effective system prompt, merges in the latest captured provider request payload for the active branch when available, analyzes prompt and payload burden using logic adapted from `pi-token-burden`, writes a self-contained HTML report plus sibling JSON, and attempts to open the HTML report in the default browser.

## Architecture

```text
before_provider_request
  -> src/index.ts
  -> src/payload-capture-store.ts
  -> src/provider-normalization.ts

/context-report
  -> src/index.ts
  -> src/collect-report.ts
     -> src/parser.ts
     -> src/path-discovery.ts
     -> src/file-reading.ts
     -> src/payload-capture-store.ts
     -> src/provider-normalization.ts
     -> src/payload-analysis.ts
     -> src/base-trace/*
  -> src/report-json.ts
  -> src/report-html.ts
  -> src/open-browser.ts
```

## Data sources

- `ctx.getSystemPrompt()` for the effective assembled system prompt
- `before_provider_request` for the latest provider-specific request payload
- `pi.getAllTools()` for registered tool definitions
- `ctx.getContextUsage()` for context window metadata when available
- `ctx.sessionManager.getBranch()` plus `pi.appendEntry()` for branch-scoped capture/history restoration
- filesystem discovery for `SYSTEM.md`, `APPEND_SYSTEM.md`, and `AGENTS.md`
- extension discovery for base prompt trace attribution

## Output model

The canonical report object is the source of truth for both HTML and JSON output. HTML is a presentation layer only.

The report intentionally keeps these concepts separate:

- **effective system prompt**: visible assembled prompt text from `ctx.getSystemPrompt()`
- **normalized payload estimate**: best-effort classification of captured provider request content into system/developer instructions, conversation messages, and tools
- **serialized request JSON estimate**: estimate of the captured request body serialized as JSON text for debugging
- **runtime context usage**: metadata from `ctx.getContextUsage()`
- **raw report JSON/tree size**: export artifact size only

The latest payload section also includes a `currentContextSummary` object that answers “what is in context right now?” with the best available view. It prefers prompt + latest captured payload, but explicitly falls back to prompt-only when no payload has been captured yet.

## Normalization model

`src/provider-normalization.ts` maps provider payloads into a shared shape:

- `system`: normalized system/developer instructions
- `messages`: normalized conversation messages
- `tools`: normalized tool definitions/tool blocks
- `otherFields`: unclassified request JSON fields that were present but not mapped into the normalized buckets
- `caveats`: explicit visibility/coverage warnings

For OpenAI Responses payloads, top-level `instructions` is treated as system/developer instruction content and should not remain in `otherFields` once consumed.

## HTML/reporting rules

`src/report-html.ts` should preserve the distinctions above and avoid implying more certainty than the capture actually provides.

Current rendering rules:

- include a visible glossary/help section in the standalone HTML
- include a dedicated “what is in context right now?” summary block
- explain that serialized request JSON is a debugging proxy, not exact provider usage
- explain that raw JSON tree/object sizes are report artifact sizes, not model context sizes
- hide or de-emphasize zero-value normalized buckets in the main payload tables/cards
- keep caveats explicit when payload visibility or normalization is partial

## Scope boundary

The package focuses on:

- effective system prompt
- prompt section burden
- captured provider payload burden
- discovered source files feeding prompt construction
- tool definition burden
- inferred base prompt provenance
- normalized payload vs serialized request JSON vs runtime usage comparisons

It now attempts to expose the latest provider payload as the best available view of current session context, but still labels normalization/completeness explicitly because provider hook visibility and tokenizer estimates are not guaranteed to be exact for every provider.

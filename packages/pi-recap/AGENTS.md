---
owner: repo-maintainers
last_verified: 2026-09-21
applies_to: packages/pi-recap/**
inherits_from: ../../AGENTS.md
canonical_for: pi-recap package conventions
---

# pi-recap — AGENTS.md

## Purpose

Render a Pi session as a re-readable recap: user questions in full, answers
shortened with expanders, tool noise removed, optionally summarized by a cheap
model with an incremental cache.

## Scope

- `src/args.ts` — `/recap` flag parsing only
- `src/session.ts` — JSONL parsing, branch walking, exchange extraction
- `src/text.ts` — truncation and formatting helpers
- `src/escape.ts` — HTML escaping
- `src/markdown.ts` — escaping-first Markdown subset renderer and fence-aware preview split
- `src/document.ts` — the renderer document shape
- `src/html.ts`, `src/text-report.ts` — pure renderers
- `src/summarize.ts` — transcript building, chunking, response parsing, cache, model runner
- `src/config.ts` — recap dir/model/auto resolution
- `src/index.ts` — the only file that touches the pi API: commands, files, browser, auto hook
- `test/` — node:test unit tests plus an integration-style extension harness

## Rules

- Keep every module except `src/index.ts` free of pi imports so it stays unit-testable.
- Never leak tool results, thinking blocks, or system prompts into the recap body.
  Tool activity is a count line only.
- Escape every message-derived string before it reaches HTML. Message text is untrusted.
- Escape every message-derived string before it reaches HTML. Markdown rendering
  must never emit raw session HTML: escape first, then generate tags, and reject
  non-`http(s)`/`mailto`/`#` link schemes.
- Never re-call the summarizer for an exchange whose hash is unchanged; the cache
  is the operator's bill. Judge summary plans by `planSummary`, not by UI state.
- Fail soft: a summarize failure or a missing browser must not prevent the recap
  file from being written.
- Retention cleanup may only delete generated `recap-*.html`/`recap-*.txt`
  files; never `summary-*.json`, `settings.json`, or unknown files.
- Forward `sessionId` on summarizer calls; some providers route by it.
- Keep answer previews line-aware (`truncateAtLine`) so the collapse point reads well.

---
owner: repo-maintainers
last_verified: 2026-08-13
applies_to: packages/pi-searxng/**
inherits_from: ../../AGENTS.md
canonical_for: pi-searxng package conventions
---

# pi-searxng — AGENTS.md

## Purpose

Thin SearXNG search tool for the discovery-services instance.

## Rules

- Keep a single tool: `web_search_searxng`.
- Do not add `web_fetch`, Brave API search, or xAI search.
- Default the tool **off**.
- Default URL is the VPN bind, not localhost.
- Default engines are `brave,duckduckgo`.
- Keep MIT attribution to `pi-searxng-search`.

## Commands

```bash
npm test --workspace=packages/pi-searxng
npm run typecheck --workspace=packages/pi-searxng
```

---
owner: repo-maintainers
last_verified: 2026-04-15
applies_to: /**
inherits_from: ../../AGENTS.md
canonical_for: Package-specific conventions
---

# AGENTS.md

## Purpose

Working agreements for the pi-brave-search extension.

## Scope

A Pi extension that provides Brave Web Search as a tool for web discovery.

## Commands

```bash
npm run build
npm run dev
npm run typecheck
npm run lint
npm run test
```

## Architecture

```
src/
├── index.ts
├── config.ts
└── features/
    └── search/
        ├── searchTool.ts
        └── types.ts
```

## Conventions

- Keep the tool focused on search result retrieval.
- Return normalized result URLs so crawl4ai can consume them easily.
- Keep credentials in env vars or JSON config, never in source.

## Change Policy

- Update `README.md` for user-facing config or tool changes.
- Update `CONTEXT.md` when request/response flow changes.

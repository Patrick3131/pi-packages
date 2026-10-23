---
owner: repo-maintainers
last_verified: 2026-10-23
applies_to: packages/pi-discovery/**
inherits_from: ../../CONTEXT.md
canonical_for: pi-discovery architecture
---

# pi-discovery — Context

```
src/config.ts   URL / enable flags
src/search.ts   GET /search?format=json
src/answer.ts   bounded cancellable POST /v1/web-answer
src/index.ts    register both tools with native defaultActive
```

Live instance: Dokploy `Tools` / `discovery-services`, JSON on
`http://10.8.0.1:18089` and `http://172.18.0.1:18089`. No API token.

`pi-packages/research` exports the shared web_search_searxng tool descriptor and execution client so other harnesses reuse the coding-agent tool name, description and parameter schema.

Environment reads belong in src/config.ts. Default-off uses native ToolDefinition.defaultActive;
project/preset/loadout ownership stays with Pi/toolkit. Answer validates wire data,
keeps search evidence distinct from citations and never retries. Auth is server-owned.

Web answers default to a 180-second total server budget (up to 300 seconds)
and a 310-second HTTP timeout. Server admission allows two running and 32 waiting
requests; individual Codex turns remain capped at 60 seconds. Explicit HTTP
timeout overrides must still exceed the requested server budget by five seconds.

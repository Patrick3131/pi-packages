---
owner: repo-maintainers
last_verified: 2026-08-13
applies_to: packages/pi-searxng/**
inherits_from: ../../CONTEXT.md
canonical_for: pi-searxng architecture
---

# pi-searxng — Context

```
src/config.ts   URL / enable flags
src/search.ts   GET /search?format=json
src/index.ts    register web_search_searxng, disable on session_start
```

Live instance: Dokploy `Tools` / `discovery-services`, JSON on
`http://10.8.0.1:18089` and `http://172.18.0.1:18089`. No API token.

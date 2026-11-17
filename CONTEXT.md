---
owner: repo-maintainers
last_verified: 2026-11-17
applies_to: /**
inherits_from: none
canonical_for: System architecture and package relationships
---

# CONTEXT.md

## System Overview

pi-packages is a monorepo of Pi extensions distributed through one repository Git package. Each package registers tools and capabilities for the Pi coding agent; the Paseo plugin is installed separately with `paseo plugin add`.

## Architecture

```
pi-packages/
├── packages/
│   ├── pi-crawl4ai/       # Remote crawling, crawl_read sessions, research cores
│   ├── pi-work/           # Docs-as-work skills, scaffold, /work wizard
│   ├── pi-delegation/     # Standing delegation policy prompt
│   ├── pi-toolkit/        # /tools, /preset, $ mentions + actions, /overview (5 entry points)
│   ├── pi-recap/          # Session recap HTML (/recap, /user-messages)
│   ├── pi-discovery/      # Search, web_answer, ads, social, YouTube, Amazon, Reddit
│   └── [future packages]/
├── paseo-melon/           # Paseo workspace panel for Melon worktrees and previews
├── configs/global/        # Restore snapshot, native MCP call policy, worktree hook
├── scripts/               # pi-sync deployment, prepare-research, capability smoke
├── package.json           # Workspace root
├── AGENTS.md              # Working agreements
└── CONTEXT.md             # This file
```

## Package Topology

Pi loads every extension from the one Git package (or the versioned npm release
`@patrick3131/pi-packages` for research consumers). Each toolkit feature is an
independently filterable entry point in the Git package manifest; crawl and
discovery register tool providers; delegation and work contribute prompts and
skills. No package imports another package's runtime code.

## Shared Patterns

- Configuration comes from environment variables (plus first-match JSON files
  where a package documents them); no hardcoded credentials; document keys in
  `.env.example`.
- Each package is a workspace with its own `package.json`, `tsconfig.json`,
  tests colocated as `*.test.ts`, and its own README/AGENTS/CONTEXT.
- Errors throw meaningful messages for Pi to surface; silent fallbacks are
  avoided by policy.

The repository root is the canonical Pi package source. Install it with
`git:github.com/Patrick3131/pi-packages`; use package filters when only one
extension should be loaded.

## Git Package Release Flow

1. Develop in `packages/<name>/`
2. Test: `npm run test --workspace=packages/<name>`
3. Bump the root version, commit, and push the repository; optionally create a
   Git tag for pinned installs

## Canonical Deep Context

- pi-crawl4ai: `packages/pi-crawl4ai/CONTEXT.md`
- pi-work: `packages/pi-work/CONTEXT.md`
- pi-discovery: `packages/pi-discovery/CONTEXT.md`
- pi-toolkit: `packages/pi-toolkit/CONTEXT.md`
- Future packages: `packages/<name>/CONTEXT.md`

## Harness-neutral research consumers

The root Git package exports `pi-packages/research` (`@patrick3131/pi-packages/research`
from GitHub Packages): a Node-only bundle of SearXNG search, Crawl4AI execution
and progressive artifact reading that shares its cores with the Coding Agent
tools and stays free of Coding Agent/TUI runtime imports. Consumers supply
config, cancellation and a private cwd; `prepare` builds the bundle only when
dev dependencies are present. See the root README for the registry and peer
contract details.

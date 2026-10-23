---
owner: repo-maintainers
last_verified: 2026-08-13
applies_to: /**
inherits_from: none
canonical_for: System architecture and package relationships
---

# CONTEXT.md

## System Overview

pi-packages is a monorepo containing Pi extensions distributed through one repository Git package. Each package provides tools and capabilities for the Pi coding agent.

## Architecture

```
pi-packages/
├── packages/
│   ├── pi-crawl4ai/          # Web crawling extension
│   │   ├── src/
│   │   │   ├── index.ts      # Exports extension
│   │   │   ├── config.ts     # Env config
│   │   │   └── features/
│   │   │       └── crawl/
│   │   │           ├── crawlTool.ts
│   │   │           └── types.ts
│   │   └── package.json
│   │
│   ├── pi-work/              # Docs-as-work skills and /work wizard
│   │   ├── src/
│   │   ├── skills/
│   │   └── package.json
│   │
│   ├── pi-toolkit/           # /tools, /preset, mentions, /overview
│   │   ├── src/features/     # Four separate extension entry points
│   │   └── package.json
│   │
│   ├── pi-discovery/         # SearXNG search and Luna web_answer
│   │   ├── src/
│   │   └── package.json
│   │
│   └── [future packages]/    # Additional extensions
│
├── configs/global/           # Restore snapshot, native MCP call policy, worktree hook
├── package.json              # Workspace root
├── AGENTS.md                 # Working agreements
└── CONTEXT.md                # This file
```

## Package Topology

```
┌─────────────────────────────────────────────────────────────┐
│                      Pi Agent                                │
│                                                             │
│  Loads extensions from:                                     │
│  - npm packages                                             │
│  - Git repositories                                         │
│  - Local paths                                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │                           │
        ▼                           ▼
┌───────────────┐           ┌───────────┐
│ pi-crawl4ai   │           │ pi-work   │
│               │           │  package  │
└───────────────┘           └───────────┘
```

## Shared Patterns

All packages follow the same patterns:

### Configuration

```
Environment Variables
        │
        ▼
┌─────────────────┐
│   config.ts     │
│                 │
│  - Load from    │
│    process.env  │
│  - Validate     │
│  - Provide      │
│    defaults     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Tool execute   │
│                 │
│  - Use config   │
│  - Call external│
│    services     │
└─────────────────┘
```

### Tool Registration

```typescript
// src/index.ts
export default function (pi: ExtensionAPI) {
  const config = loadConfig();
  registerMyTool(pi, config);
}
```

### Error Handling

```typescript
// Throw meaningful errors for Pi to surface
throw new Error(`Operation failed: ${reason}`);
```

## Package Independence

Packages are **independent**:
- No cross-package dependencies
- Each has its own `package.json`, `tsconfig.json`
- Each can be built and tested independently
- Each has its own documentation

The repository root is the canonical Pi package source. Install it with
`git:github.com/Patrick3131/pi-packages`; use package filters when only one
extension should be loaded.

## Git Package Release Flow

```
1. Develop in packages/<name>/
2. Build: npm run build
3. Test: npm run test
4. Push the repository; optionally create a Git tag for pinned installs
```

## Canonical Deep Context

- pi-crawl4ai: `packages/pi-crawl4ai/CONTEXT.md`
- pi-work: `packages/pi-work/CONTEXT.md`
- Future packages: `packages/<name>/CONTEXT.md`

## Harness-neutral research consumers

The root Git package exports `pi-packages/research`, a Node-only bundle of SearXNG search, Crawl4AI execution and progressive artifact reading. Coding Agent registrations delegate to these same cores. No second crawler/search implementation is added. Consumers provide explicit config, signal and private cwd; presentation uses fixed bounded byte/line delivery without loading the Coding Agent runtime. Pin the Git source revision. `prepare` builds the standalone research export only when `tsup` is installed; production installs omit dev dependencies, so they skip the build instead of failing it.

The root toolkit additionally publishes public versioned GitHub Packages releases
as `@patrick3131/pi-packages`. Keep the Git resource layout/prepare path compatible.
Tagged release CI owns build/test/publishing; consumers use exact versions and
secret-only registry authentication. No repository visibility or local Pi settings
change accompanies registry publishing. Subpackages declare host-provided peer contracts; the root declares no peers,
so research consumers do not install a Coding Agent runtime.
the research bundle stays standalone. Ship the work scaffold as well as resources.

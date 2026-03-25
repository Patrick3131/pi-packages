---
owner: repo-maintainers
last_verified: 2025-03-25
applies_to: /**
inherits_from: none
canonical_for: System architecture and package relationships
---

# CONTEXT.md

## System Overview

pi-packages is a monorepo containing Pi extensions published as npm packages. Each package provides tools and capabilities for the Pi coding agent.

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
│   └── [future packages]/    # Additional extensions
│
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
        ┌─────────────┼─────────────┐
        │             │             │
        ▼             ▼             ▼
┌───────────┐  ┌───────────┐  ┌───────────┐
│pi-crawl4ai│  │  future   │  │  future   │
│           │  │  package  │  │  package  │
└───────────┘  └───────────┘  └───────────┘
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
- Each can be published independently
- Each has its own documentation

## Publishing Flow

```
1. Develop in packages/<name>/
2. Build: npm run build
3. Test: npm run test
4. Publish: cd packages/<name> && npm publish
```

## Canonical Deep Context

- pi-crawl4ai: `packages/pi-crawl4ai/CONTEXT.md`
- Future packages: `packages/<name>/CONTEXT.md`

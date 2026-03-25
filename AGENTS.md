---
owner: repo-maintainers
last_verified: 2025-03-25
applies_to: /**
inherits_from: none
canonical_for: Repo-wide working agreements and navigation
---

# AGENTS.md

## Purpose

Root guidance for the pi-packages monorepo. Contains Pi extensions published as npm packages.

## Scope

- `packages/pi-crawl4ai` - Web crawling extension with crawl4ai
- Future extensions added to `packages/`

## Commands

```bash
# Install all dependencies
npm install

# Build all packages
npm run build

# Type check all packages
npm run typecheck

# Lint all packages
npm run lint

# Run all tests
npm run test

# Run tests with coverage
npm run test:coverage

# Build single package
npm run build --workspace=packages/pi-crawl4ai

# Test single package
npm run test --workspace=packages/pi-crawl4ai
```

## Package Structure

Each package in `packages/` should follow this structure:

```
packages/<name>/
├── src/
│   ├── index.ts           # Entry point
│   ├── config.ts          # Configuration (if needed)
│   └── features/          # Feature modules
│       └── <feature>/
│           ├── <feature>Tool.ts
│           └── types.ts
├── package.json
├── tsconfig.json
├── AGENTS.md              # Package-specific conventions
├── CONTEXT.md             # Package architecture
└── README.md              # User documentation
```

## Conventions

### Naming

- Package names: `pi-<feature>` (e.g., `pi-crawl4ai`, `pi-screenshot`)
- Folder names: Same as package name without scope

### Code Style

- TypeScript strict mode
- `camelCase` for variables/functions
- `PascalCase` for types/interfaces/classes
- `kebab-case` for files

### Environment Variables

- All config via environment variables
- No hardcoded credentials
- Document in package `.env.example`

### Testing

- Colocate tests with implementation: `*.test.ts`
- Use Jest with ts-jest
- Mock external services (APIs, fetch)
- Run tests before committing: `npm run test`
- Aim for meaningful coverage on core logic

### Publishing

1. Update version in package `package.json`
2. Run tests: `npm run test --workspace=packages/<name>`
3. Build: `npm run build --workspace=packages/<name>`
4. Publish: `npm publish` from package directory

## Adding a New Package

1. Create folder in `packages/<name>/`
2. Copy structure from existing package
3. Update `package.json` with new name
4. Add to this file's Scope section

## Change Policy

- Update root `AGENTS.md` for repo-wide changes
- Update package `AGENTS.md` for package-specific changes
- Update root `README.md` when adding/removing packages

## References

- Pi extension docs: https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md

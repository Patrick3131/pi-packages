---
owner: repo-maintainers
last_verified: 2026-04-14
applies_to: /**
inherits_from: /Users/patrick/Development/pi-packages/AGENTS.md
canonical_for: Package-specific conventions for pi-context-inspector
---

# AGENTS.md

## Purpose

Package guidance for `pi-context-inspector`, a Pi extension that exports HTML and JSON reports describing the effective system prompt and related context burden.

## Scope

Applies to all files in `packages/pi-context-inspector/`.

## Conventions

- Prefer small pure helpers for parsing and report shaping.
- Keep the canonical report object in `src/types.ts` stable and serializable.
- Keep HTML rendering separate from analysis/collection logic.
- Preserve clear distinction between:
  - effective system prompt inspection
  - inferred provenance
  - non-prompt metadata
- Do not claim to expose the exact full provider payload unless that data is actually captured.
- For AGENTS.md analysis, discovered files on disk are not enough; prompt/payload evidence must support any presence claim.

## Testing

- Prioritize parser compatibility, report serialization, HTML rendering stability, and AGENTS coverage truthfulness.
- Keep browser-opening logic isolated for easy testing/mocking.

## Documentation

Update:
- `README.md` for user-facing behavior
- `CONTEXT.md` for architectural changes
- this file for package-specific workflow changes

---
status: backlog
owner: engineering
last_reviewed: 2026-11-18
canonical_ref: none
---

# Organize discovery tools by capability

## Type

technical

## Problem

`packages/pi-discovery/src` is flat. Social, YouTube, and Amazon each have related clients, schemas, validation, formatting, and registration files mixed together. The root `src/research.ts` imports individual files from those internals. This makes it harder to see which code a Pi or Eve tool can reuse.

## Outcome

Each capability has an obvious home. The Pi extension assembles the tools and the existing `@patrick3131/pi-packages/research` entry point exposes the same Node clients, types, schemas, formatters, and errors to Melon Labs and other consumers.

## Scope

- Group discovery code under `packages/pi-discovery/src/features/` by web search, web answer, Ad Library, social, Reddit, YouTube, and Amazon. Keep shared configuration in `src/config.ts`.
- Move Pi registration and terminal rendering into a registration module inside each feature. Keep `src/index.ts` as the extension entry point, preserving registration order. Separate reusable schema and description data from any Pi-specific registration fields where they currently live together.
- Update the root research entry and existing tests to the new paths. Give a feature a small entry module only when several callers need its exports.
- Preserve the published package name and public import path. A separate neutral package, Eve wrappers, changes to Crawl4AI, and publishing are outside this work item.

## Implementation Notes

The root package manifest maps `./research` to compiled JS and declarations. `src/research.ts` draws from both Discovery and Crawl4AI, so `research` remains the appropriate public name. `tsup.research.config.ts` builds the standalone bundle. Keep reusable modules free of Pi Coding Agent and TUI runtime imports. Audit configuration dependencies so importing the shared clients retains the existing config and credential behavior.

Several capabilities already have separate client and registration files. Start by moving those. For web search and web answer, split their shared definitions file by capability and move registration out of the root entry. Keep each move focused on paths and imports. Audit repository references to the old source paths before removing them.

## Decisions and Assumptions

- `D1` Keep the public research surface and Pi package discovery paths stable. Give any future standalone research package its own work item once there is a consumer for it.
- `D2` Keep provider-specific schemas, errors, and formatting with their capability. Use native Pi tool registration and share the reusable pieces with future Eve integrations.
- `D3` Implement as one serial change. Feature moves, the extension entry point, and the research bundle share imports and should land together.

## Files

- `packages/pi-discovery/src/` and `packages/pi-discovery/test/` for the layout and import updates.
- `src/research.ts` for the existing public export list.
- `packages/pi-discovery/CONTEXT.md`, `packages/pi-discovery/AGENTS.md`, and the package README where they describe old paths.

## Acceptance Criteria

- [ ] Related implementation and registration files are grouped by capability and Pi still loads the same entry point.
- [ ] Existing tool names, registration order, activation defaults, schemas, deadlines, and output/error behavior are preserved.
- [ ] The packed package resolves `@patrick3131/pi-packages/research` and its types from a clean Node consumer without installing Pi Coding Agent or TUI. The full public export surface matches the baseline.
- [ ] The package notes describe the new locations and where future tool adapters should import from.

## Validation

Use existing Discovery and configuration tests, a typecheck, and a standalone packed-consumer smoke check. See the companion test plan.

## Open Questions

None

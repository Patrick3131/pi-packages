---
status: in_progress
owner: engineering
last_reviewed: 2026-10-07
canonical_ref: none
---

# Pi Toolkit consolidation, overview, and migration To-Do

## Execution Shape

One serial source implementation unit owns `packages/pi-toolkit/`, migration of `packages/pi-{tools,presets,skill-mentions}/`, and root/config/sync integration listed in the primary spec. Preserve unrelated working-tree changes. Source tests precede publication; local-global and configured-remote cutovers are explicit separate gates. No parallel slices or delegation required.

## Tasks

- [ ] Consolidate existing tools, presets, and skill-mentions code/tests into toolkit with independently filterable entry points, preserving hook order, commands/shortcuts/flags, config paths, and preset-state (AC9).
- [ ] Inventory only local-global and configured-remote consumer metadata; design previewable old-path/declaration/filter mapping that preserves exclusions and handles ambiguous selectors safely (AC10).
- [ ] Implement backup-first, idempotent migration and fresh-restore/sync integration without blanket shared-config replacement; cover mapping, repeats, failure, and rollback with fixtures (AC10).
- [ ] Establish package-local host compatibility and a versioned allowlisted snapshot schema; make optional API gaps explicit (AC2, AC4, AC7). Inspect installed-path helper side effects; preserve verified exact-name preset resolution.
- [ ] Collect personal/project declarations and local installation evidence without loading code or executing config values; normalize identity, filters, replacement/delta overrides, and trusted-scope provenance (AC2, AC6, AC7).
- [ ] Add runtime tools/commands/skills/model/auth-status/MCP registration observations; correlate preset definitions and recorded state while preserving live-versus-saved differences and unknown health/load status (AC3, AC4).
- [ ] Render searchable, responsive, self-contained HTML with relationship links, plain-language explanations, source evidence, safe warnings, and keyboard-accessible detail panels (AC5, AC6).
- [ ] Implement the single `/overview` command without flags or text export, protected output paths, and best-effort browser opening; generate only on command invocation (AC1, AC6).
- [ ] Register the extension in the root manifest and workspace metadata, and document supported host/API limits, commands, environment configuration, snapshot freshness, and local/private report handling (AC8).

## Validation

- [ ] Prove package/filter identity and preset/tool behavior using fixture tests, including this repository's local-versus-Git override pattern (AC2, AC3).
- [ ] Prove secret projection, HTML escaping, non-mutation/network boundaries, malformed-source recovery, and untrusted-scope withholding (AC6, AC7).
- [ ] Verify command behavior in TUI and non-TUI harnesses; browser failure still leaves a report (AC1).
- [ ] Manually review `/overview` in this repository: locate `/preset` ownership, definitions, tool exposure/default differences, current versus startup provider, and MCP unknown-state explanation (AC2–AC5).
- [ ] Run workspace tests/typecheck, root regression tests/typecheck/build, recording baseline failures separately (AC8).
- [ ] Run migrated feature regression tests and verify each feature can be filtered independently without duplicate hooks/commands (AC9).
- [ ] After separately approved publication/activation, preview/apply the narrow cutover on local-global and configured-remote Pi, verify installed revisions and fresh-session smoke checks, and record per-target evidence/reload requirements (AC11).
- [ ] Stop on an unknown project consumer, ambiguous mapping, or one-target failure; report residuals and preserve targeted backups instead of widening scope (AC10, AC11).

## Docs

- [ ] Add toolkit `README.md`, `AGENTS.md`, `CONTEXT.md`, and `.env.example`; retire/migrate old package docs, update root and global restore/sync docs with feature paths and narrow cutover/rollback instructions, preserving unrelated edits.
- [ ] Keep spec/test/to-do consistent if implementation discovers a material API limitation or changes the supported host range.

## Completion

- [ ] Every acceptance criterion is verified with evidence recorded in the test companion.
- [ ] Coverage decision and explicit omissions are still justified; no claim of tested UI before manual verification.
- [ ] Set all three documents to `done`, update `last_reviewed`, and move the complete basename group to `docs/work/finished/` only after acceptance.

## Open Questions

None

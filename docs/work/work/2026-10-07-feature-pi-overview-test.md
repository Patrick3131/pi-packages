---
status: in_progress
owner: engineering
last_reviewed: 2026-10-07
canonical_ref: none
---

# Pi Toolkit consolidation, overview, and migration Test Plan

## Coverage Decision

Automated coverage required.

Reason: inaccurate scope/override explanations, secret leakage, and unintended mutation are material failures of overview; consolidation and consumer cutover add registration and preference-loss risks. Reuse/move the existing feature tests without duplicating them. Eight focused scenario groups exceed the default three-case budget because each protects a distinct risk below; use table-driven inputs. Visual usability and live consumer activation are manual-only.

## Risk Coverage

| Material failure risk | Existing coverage | Cheapest stable proof | Planned change |
|---|---|---|---|
| Wrong package identity/scope makes the report claim duplicate loads or hide an override | None for overview | Pure normalization fixtures | Personal/project npm, Git, local-path, filters, autoload-delta, and observed source joins |
| Saved defaults or recorded preset name are mistaken for the current loadout | `packages/pi-presets/test/config.test.ts`, `packages/pi-tools/test/project-persistence.test.ts` protect engines only | Snapshot/normalization fixtures | Whole-preset replacement, recorded-state/live divergence, exposure, unknown names |
| Credentials or untrusted markup enter an executable/shareable output | `packages/pi-recap/test/html.test.ts` protects recap only | Collector projection plus renderer fixture | Disallowed secret sentinels never enter snapshot/HTML; escaped adversarial labels/instructions cannot execute |
| Inspection mutates config/auth/session state or launches/connects infrastructure | None | Command harness with throwing forbidden methods | Only expected report write and optional browser open; no auth read/resolution, package resolve/install, MCP connection, network, or imports |
| Missing/invalid sources and trust/API gaps are shown as empty or crash the report | None | Table-driven collector fixture | Localized safe warnings; untrusted scope not read; unknown versus empty |
| Command cannot produce usable output without a browser or writes outside intended output directory | Recap pattern is not overview coverage | Command/output harness | Safe session ID, non-TUI browser suppression, browser failure, output failure |
| Consolidation breaks hooks, command ownership, or independently filtered features | Existing tools/presets/skill-mentions suites, to migrate intact | Existing tests plus toolkit registration harness | Prove exactly one registration and preserved hook order/feature filtering |
| Migration broadens filters, loses preferences, or leaves mismatched old/new paths | Existing restore/sync coverage needs inspection/extension | Targeted migration fixtures | Exact/prefix selectors, standalone declarations, empty/delta filters, malformed/ambiguous inputs, backups, no-op repeat, scoped rollback |

## Automated Cases

1. Package provenance: local `..` resolves against project `.pi`, the equivalent Git identity is project-filtered rather than runtime-loaded twice, installation evidence stays separate, versions/refs do not create false duplicate identities, and `autoload: false` remains a delta.
2. Preset/tool state: project `plan` replaces the entire personal definition; missing provider/model means unchanged; exact-name matching/deduplication follows `resolve-tools.ts` without inventing aliases; unregistered requested names warn; recorded name with manually changed/resumed model/tools shows divergence rather than pretending reapplication. Active-set, hidden/loadout hiding, and codemode/deferred callability are distinct.
3. Safe export: raw API keys/tokens, MCP env/args/headers/URLs, endpoint/package URL credentials, parameter defaults, and error payloads never survive allowlisted collection. HTML-significant text and closing-script payloads in every rendered dynamic text field stay inert; no external resources. Preset prose remains explicitly local/private, not a guarantee of public sanitization.
4. Read-only boundary: trap forbidden APIs and writes outside output; invocation never reads `auth.json`, resolves credential commands, connects/probes MCP, imports extensions, refreshes model/auth state, or changes tools/model/preset/config/session. Browser opening uses executable/argument arrays only.
5. Partial-state recovery: missing files, malformed JSON, inaccessible manifests, absent optional APIs, and untrusted project scope yield warnings/unknown with unaffected sections still rendered. Provider auth configured does not become validated; MCP registered tools do not imply connected health. Disk-versus-runtime drift is visible.
6. Command/output behavior: the single `/overview` command produces HTML and an absolute output path; interactive use attempts browser opening, non-TUI use never launches a browser, browser launch failure preserves success/path, unexpected arguments are rejected without collecting/writing, sanitized session identifiers cannot escape the chosen output directory, and output-write failure is reported safely. No flags or text export exist.
7. Toolkit integration: migrate and rerun all existing feature tests; a registration harness proves `/tools`, `/preset`, `$` input/autocomplete, and `/overview` load once, relative hook order is preserved, and excluding any one feature does not suppress the others.
8. Migration: fixture personal/global and remote settings with canonical Git filters, old standalone declarations and exact entry paths, disabled features, `extensions: []`, autoload deltas, and unrelated settings. Preview changes only approved references, apply backs up only changed files, repeat writes nothing, malformed/ambiguous input leaves files untouched, and targeted rollback restores the prior references without touching credentials/sessions or project files.

## Browser Or Manual Verification

| Step | Expected result |
|---|---|
| Load the implemented extension, run `/overview` in this repository | Local HTML opens; no server/service starts; header identifies cwd, trust, timestamp, model/defaults |
| Find packages and search `/preset` | Personal Git declaration, project filtering, local checkout, and command owner are understandable without JSON |
| Inspect presets and compare tools to `/tools` without toggling anything | Actual definitions and source files appear; live tools, saved preferences, and preset requests are separate |
| Inspect provider/MCP sections | Current versus default provider is clear; auth status is metadata only; absent declarations versus unavailable health are distinct |
| Switch a preset or tool manually, then rerun `/overview` | New snapshot reflects state; old HTML is explicitly a snapshot, not live |
| Navigate by keyboard; narrow browser width; switch OS color scheme | Search, navigation, details, and source evidence remain usable and readable |
| Simulate browser-opening failure and a non-TUI invocation | HTML and its path remain available; non-TUI invocation does not launch a browser |
| Use fixtures for malformed config and untrusted project | Scoped safe warnings, withheld project contents, no credential/source payload leakage |
| Before activation, inspect migration preview for each scoped consumer | Only verified old package/feature references change; personal filters/defaults and other packages stay intact |
| After approved publication/cutover, start fresh local-global and remote sessions | Intended installed revision and toolkit source paths; one copy of every feature; presets/mentions/tools smoke checks pass |
| Generate remote `/overview` | HTML path on remote filesystem; no browser/server/tunnel required; copy for local inspection only if explicitly needed |
| Repeat migration; simulate rollback with disposable fixtures | No new writes/backups on repeat; prior package revision and targeted config references restore consistently |

## Commands

Verified existing root command contracts (execute during implementation, not planning):

```sh
npm run test
npm run typecheck
npm run build
```

Workspace commands use the verified repository `--workspace` pattern but require the new package/scripts to exist first:

```sh
npm run test --workspace=packages/pi-toolkit
npm run typecheck --workspace=packages/pi-toolkit
```

Toolkit test discovery must include migrated feature tests and new overview tests. Use Node/tsx and `tsc --noEmit`, following existing tooling. Root build may skip source-only toolkit. Manual overview-only host command after creation: `pi --extension ./packages/pi-toolkit/src/features/overview/index.ts`, then `/overview`; avoid double loading through the root package. A full toolkit smoke check must load all four manifest entry points.


Consumer commands verified in current `README.md` (not executed during planning): `./scripts/pi-sync --check` and `./scripts/pi-sync --local-only --check`. Check mode has remote audit/task metadata side effects. Do not use current apply/accept-config as a substitute for the new narrow migration: first integrate and test preservation of target-owned filters, publish the selected revision under explicit authority, then use reviewed migration/update commands. Record the final migration command in this plan before live cutover.
## Acceptance Evidence

| Check | Result | Evidence |
|---|---|---|
| Planning placement and source investigation | passed | `docs/work/AGENTS.md`, root manifest, preset/tools code/tests, recap pattern, installed host declarations; primary spec distinguishes verified/proposed paths |
| Three-document consistency | passed | Matching basename, backlog/date, Open Questions None, AC/task/test alignment checked directly; file existence/frontmatter check passed on 2026-10-07 |
| Package normalization / state / safety / recovery / command tests | pending | Implementation records workspace test command and output |
| Supported host and workspace typecheck | pending | Implementation records resolved host version, optional API gaps, and command outcome |
| Root regression tests/typecheck/build | pending | Implementation records outputs and unrelated baseline failures separately |
| Browser and current-session acceptance | pending | Implementation records manual observations for AC1–AC7 |
| Migrated feature regression / toolkit registration | pending | Toolkit tests, hook order and feature filter evidence for AC9 |
| Targeted migration fixtures / repeat / rollback | pending | Migration tests and safe-preview evidence for AC10 |
| Local global consumer activation | pending | Prior/new installed revision, targeted backup/mapping, fresh-session attribution and smoke checks for AC11 |
| Configured remote consumer activation | pending | Verified deployment identity, prior/new revision, targeted backup/mapping and remote smoke checks for AC11 |

## Explicitly Not Testing

- CSS class names, exact explanatory wording, file existence as product behavior, TypeScript guarantees, or the Pi/npm framework itself.
- Existing preset application/tool-default behavior at runtime beyond the projection/parity needed for the report.
- Actual credentials, live provider requests, remote MCP connectivity, remote tunneling, or other users' private configuration. Authorized shared-package consumer update is verified during cutover, not by overview tests.
- Exhaustive loaded-extension enumeration or MCP connection health not exposed by authoritative session APIs.
- Duplicate visual/browser proofs for pure normalization or escaping behavior already covered below the UI.

## Open Questions

None

---
status: done
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
| Package normalization / state / safety / recovery / command tests | passed | `npm run test --workspace=packages/pi-toolkit`: 105 tests passed; `/tmp/pi-toolkit-final-test.log`. Five overview cases cover distinct projection/state/provenance/recovery/command risks, including auth-read/network traps, nested URL credentials, unsafe HTML, argument rejection, browser/output failure and missing APIs. Initial red evidence: `/tmp/pi-overview-red.log`. |
| Supported host and workspace typecheck | passed | Workspace-resolved Pi **0.99.1**, fresh-process hosts **1.0.4 local / 0.99.2 remote**. Root `npm run typecheck` passes (`/tmp/pi-toolkit-final-types-pinned.log`); optional APIs are guarded. Standard managed-cache paths are inspected directly, not through resolving/installing package APIs. Model availability counts are explicitly inferred from configured auth, not credential resolution/remote validation. Remote report warns that loadout-hiding metadata is unavailable and marks direct declaration unknown. No Pi upgrade was needed. |
| Root regression tests/typecheck/build | passed | `npm run test` passed (`/tmp/pi-toolkit-final-root-test.log`), `npm run typecheck` passed, `npm run build` passed (`/tmp/pi-toolkit-build-retry.log`). Initial build timed out at crawl DTS; an isolated HEAD baseline build succeeded and the normal retry succeeded in six seconds. No outstanding baseline failure. Lock metadata removes retired entries and reuses prior Node typings 24.13.3; no unrelated dependency upgrades. |
| Browser and current-session acceptance | passed | Real Pi TUI generated/opened the report with zero token usage and no browser failure (`/tmp/pi-toolkit-tui-smoke.log`); harness proves browser/non-TUI/output failures. PTY shutdown timed out; subsequent process inspection found no remaining smoke process. Fresh RPC command smoke passed, including preset switch and regenerated report (`/tmp/pi-toolkit-dev-smoke.json`). Browser `/preset` search found nine matching evidence cards; Escape cleared it; Expand opened all 174 details; theme toggle worked; 390px viewport had no horizontal overflow. Final rendered `/preset` owner is the local toolkit preset entry, provider metadata and absent/unknown MCP explanation are visible. Axe WCAG 2 A/AA: zero violations (`/tmp/pi-toolkit-final-a11y.json`). Browser evidence/screen captures: `/tmp/pi-toolkit-final-browser-evidence.json`, `/tmp/pi-toolkit-{desktop,mobile,final-mobile}.png`. |
| Migrated feature regression / toolkit registration | passed | All migrated behavior suites included in the 105-test toolkit run; registration harness proves feature omissions, once-only commands/input hook and original relative preset/tools/mentions order. Root manifest retains searxng's original position between presets and tools. Pure overview readers reuse existing exact-name matching without aliases. |
| Targeted migration fixtures / repeat / rollback | passed | `npm run test:configs`: 21 passed (`/tmp/pi-toolkit-final-configs-reviewed.log`). Fixture checks cover exact/prefix mapping, empty lists/deltas, standalone selectors without adding other resource groups, unrelated-package filter preservation, safe failure, private backups, no-op repeat, targeted rollback with later personal edits, and toolkit-only sync bypassing shared replacement. `/tmp/toolkit-migration-red.log` records initial red. Final commands: `./scripts/pi-sync --toolkit-only --check`, then `./scripts/pi-sync --toolkit-only --apply`, only after publication/activation approval. |
| Local global consumer activation | passed | Operator approved “yes finish it.” `~/.pi/agent` updated from `8f90855cba3884c8bc62475ed5163833dcc4f3b5` to verified intended feature revision `056b4c5143ce6928fad4fc35005d7e1705909547` using `./scripts/pi-sync --toolkit-only --apply`. Preview and repeat mapping: no settings changes, so no settings backups were created. Normal fresh RPC smoke from the agent directory proves one toolkit owner per `/tools`, `/preset`, `/skill-mentions`, `/overview`, activates implement, generates HTML, and makes zero model calls (`/tmp/pi-toolkit-global-smoke.json`). Installed-factory downstream input probe proves actual expansion, and normal TUI `$` completion displays indexed skills (`/tmp/pi-toolkit-global-live-mentions.json`). Prior commit and old manifest remain in managed clone for package rollback; scoped reference rollback is fixture-proven. Pre-existing sessions need `/reload`; no service restart or project edits. |
| Configured remote consumer activation | passed | Verified Dokploy compose `_aUWwRNm5fjVkxzUFO4_J`, app `tools-remotecoding-wmvl3i`, service `paseo`; gosu/Paseo/flock boundary preserved. `/data/pi-agent` updated from the same prior revision to `056b4c5143ce6928fad4fc35005d7e1705909547`. Normal fresh RPC smoke proves intended installed revision and once-only toolkit command sources, preset/tool behavior, zero model calls and remote HTML `/data/pi-agent/overview/overview-01a117da-f8a2-71ac-828c-518b1591b045.html` (`/tmp/pi-toolkit-remote-final-smoke.log`). Installed-factory input probe and normal TUI prove live expansion/autocomplete (`/tmp/pi-toolkit-remote-live-mentions.log`). Preview/repeat mapping: no settings changes or backups. Prior commit/old manifest remain available (`/tmp/pi-toolkit-rollback-evidence.log`). Active sessions need `/reload`; no Pi upgrade, service restart, server, tunnel or report copy. |

Final direct diff review fixed catalog-provider search visibility and added explicit preset-to-model/provider relationships. `/tmp/pi-toolkit-catalog-search.json` proves keyboard `/` focus, default catalog collapse, and opening the matching catalog row; Escape restores collapse. Final Axe result still has zero violations. Desktop/mobile screenshots were visually inspected for readable layout. Updated toolkit fixtures also prove requested-model edges do not leak into a whole-name project override and absent active-set metadata is unknown, not inactive. Affected toolkit tests/typecheck and config tests were rerun after fixes; unrelated green workspace/build evidence was reused.

Publication/cutover logs: `/tmp/pi-toolkit-cutover-{check,apply}.log`, `/tmp/pi-toolkit-compatible-cutover.log`. Source/compatibility commits were pushed as `8f90855..a2e7b7b..056b4c5`. Release root tests passed again (`/tmp/pi-toolkit-release-test.log`). Remote startup initially failed because Pi 0.99.2 lacks `--no-mcp` (deployment `hF-YLZXrv0WvkHdL6IVy-`); this was a smoke-harness compatibility issue, fixed to use supported `--offline`, then tested/published/activated on both hosts. Its disabled task `PtnhR-nDbXVeqtss7yX1O` was inspected after terminal error and removed. Earlier inventory typo task was also inspected/removed; all successful tasks removed normally. Augmented expansion probes initially intercepted input before the package hook because explicit CLI extensions load first; controlled installed-factory ordering fixed the verification harness without changing feature behavior. Normal consumer registration and TUI completion were checked separately. No live rollback was performed; prior revisions and target settings are preserved and disposable rollback fixtures pass.



## Explicitly Not Testing

- CSS class names, exact explanatory wording, file existence as product behavior, TypeScript guarantees, or the Pi/npm framework itself.
- Existing preset application/tool-default behavior at runtime beyond the projection/parity needed for the report.
- Actual credentials, live provider requests, remote MCP connectivity, remote tunneling, or other users' private configuration. Authorized shared-package consumer update is verified during cutover, not by overview tests.
- Exhaustive loaded-extension enumeration or MCP connection health not exposed by authoritative session APIs.
- Duplicate visual/browser proofs for pure normalization or escaping behavior already covered below the UI.

## Open Questions

None

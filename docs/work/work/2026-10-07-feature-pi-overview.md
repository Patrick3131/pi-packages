---
status: in_progress
owner: engineering
last_reviewed: 2026-10-07
canonical_ref: none
---

# Pi Toolkit consolidation, My Pi overview, and consumer migration

## Type

feature

## Problem

Pi configuration is distributed across personal settings, project overrides, package manifests, preset files, tool defaults, MCP declarations, provider configuration, and live session state. Lists of installed packages alone do not explain which copy supplies a command, why a capability is unavailable, or how presets affect tools. The user explicitly does not want a Paseo-like session dashboard or pi-agent-dashboard installation.

## Outcome

One `pi-toolkit` workspace contains tools, presets, skill mentions, and the new `/overview` feature. Existing commands and configuration formats retain their behavior. `/overview` opens a self-contained local HTML page titled My Pi, explaining this session's setup without another service or model call. The local global Pi installation and configured remote runtime are migrated and verified as separate cutover gates, not assumed to work because source tests pass.

## Scope

### Included

- Consolidate `packages/pi-tools`, `packages/pi-presets`, and `packages/pi-skill-mentions` into `packages/pi-toolkit`, preserving separate extension entry points for feature-level filtering and existing behavior/tests. Add overview as a fourth entry point. Keep work, recap, delegation, crawl, and search packages separate.
- Include targeted migration tooling and deployment/verification instructions for local global Pi and the configured melon-remote Pi runtime. Source implementation and live consumer activation are separate steps.
- `/overview` generates a self-contained HTML page and opens it in the local browser. This is the only user-facing mode: no flags or text export. Always report the absolute file path; if a browser cannot be opened, the page remains available there. Automated/non-TUI invocations generate the HTML without auto-opening a browser.
- Header: generation time, working directory, agent directory, project trust, current model/thinking, startup defaults, and recorded preset name when observable.
- Packages: personal and project declarations, installation path/version when locally observable, resource filters, overridden declarations, and runtime-linked capabilities. Local package means a checkout loaded in place, not an npm installation.
- Extensions and resources: configured entry paths/manifests, observed commands/tools with source attribution, prompt templates and skills exposed by runtime metadata, and loaded skill metadata where available. Extensions without observable registrations remain explicitly unconfirmed; themes show configured selection, not invented load evidence.
- Tools: registry name/description, source extension or MCP namespace, exposure, active-set membership, saved project preference, and preset membership. Explain that inactive codemode/deferred tools can still be callable; hidden is unreachable. Active-set membership is not guaranteed direct declaration when loadout hiding applies.
- Presets: personal/project definitions, whole-preset override by name, requested tools and unregistered names, optional model/thinking/instructions, recorded active name, and differences from live model/tool state. Show absent fields as unchanged. Do not label a preset active solely because its tools match.
- MCP: personal/project declarations and extension registrations, effective enabled/exposure/tool overrides, config provenance, and observed registered tools. Connection state is unknown unless an authoritative session API supplies it; refer to `/mcp` for connection diagnostics.
- Providers: current and startup provider/model, configured custom-provider identifiers, registry auth-status metadata and available model counts. Authentication configured is not remote credential validation. Group catalog-only providers separately and collapse them by default.
- Plain-language relationship view: package -> extension -> command/tool; preset -> requested tools/model; MCP -> tools; personal declaration -> project override. Links navigate within the report, never execute Pi commands.
- Search, section navigation, compact summary cards, expandable details, accessible keyboard operation, dark/light appearance, and explicit warnings for missing/unreadable/invalid inputs.

### Excluded

- The overview command does not install/update/remove packages, toggle tools, apply presets, edit credentials, reconnect MCP, control sessions, host HTTP, watch files, provide remote access, load external assets, send analytics, generate LLM summaries, or probe networks. Explicit consumer migration is a separate implementation/deployment operation, not an overview capability.
- Exhaustive disk inventory of arbitrary npm packages or unrelated repositories.
- A claim that every discovered extension loaded successfully, or that registry auth metadata proves valid credentials.
- Semantic changes to existing tools/presets/skill-mentions behavior; consolidation may move code and share pure readers internally but must preserve feature entry points, hook order, commands, and config formats.
- Workspace-wide/project-consumer scanning or automatic migration of other repositories. If a scoped consumer reveals a project-owned old reference, report it and request scope approval rather than modifying it.

## Implementation Notes

### Newly checked repository evidence

- `AGENTS.md`, `CONTEXT.md`, and root `package.json`: independent workspaces; root `pi.extensions` explicitly lists eight extension entry points. Root scripts already support workspace tests/typechecks and builds with `--if-present`.
- `.pi/settings.json`: this development repo filters all resource types from the configured Git package and loads `..`, resolved from `.pi`, as a local package. This is a concrete acceptance fixture, not a universal assumption.
- `packages/pi-presets/src/config.ts` and `test/config.test.ts`: project preset names replace complete personal presets, not individual fields.
- `packages/pi-presets/src/preset.ts`: `preset-state` custom entries record the name; resume restores name/instructions without reapplying tools/model. Clearing a preset reloads `.pi/tools.json` when present. Empty/entirely unknown tool requests do not necessarily replace the live set. `src/resolve-tools.ts` matches exact registry names and deduplicates them; it does not alias old names.
- `packages/pi-tools/src/project-config.ts` and `test/project-persistence.test.ts`: saved tool preferences differ from live state; reconciliation writes defaults, and a recorded preset prevents defaults from overwriting the preset. Overview must not invoke these mutating handlers.
- `packages/pi-recap/src/index.ts`, `package.json`, `tsconfig.json`, and `test/html.test.ts`: existing local HTML export/browser-open pattern and Node/tsx testing pattern. Use as a reference, not a cross-package runtime dependency.
- No existing work package for a Pi setup overview was found under `docs/work`.
- Newly checked `packages/pi-{tools,presets,skill-mentions}/package.json` and `CONTEXT.md`: these are independent extension workspaces; tools and presets already coordinate through `preset-state`, while skill mentions owns input/autocomplete hooks.
- Newly checked `configs/global/restore.sh`: legacy local tools/presets declarations are already normalized, but the legacy set does not include skill mentions; current normalization is insufficient for the complete toolkit/filter cutover.
- Newly checked `README.md` sync section and `scripts/pi-sync.py`: existing two-target published-package sync preserves target-only package entries and has an explicit shared-config allowlist. It must not be assumed to remove old declarations or preserve custom filters automatically. The scripts and some root docs are currently uncommitted; preserve that work and verify the integrated revision before using them.

### Host API evidence and limits

Checked installed Pi documentation (`docs/extensions.md`, `configuration.md`, `settings.md`, plus packages/models/MCP docs checked earlier in this conversation), `examples/extensions/hello.ts`, and installed exported declarations under `dist/core`:

- `ExtensionAPI.getAllTools()` includes exposure and `sourceInfo`; `getActiveTools()`, `getCommands()`, and `getSettings()` provide runtime/effective snapshots.
- `ExtensionCommandContext.getSystemPromptOptions()` includes loaded skill metadata and hidden-tool information; consume metadata only, not complete prompt/context contents.
- `ctx.model`, `pi.getThinkingLevel()`, `ctx.isProjectTrusted()`, and `getAgentDir()` provide session context.
- `ctx.modelRegistry.getProviderAuthStatus()` returns configured/source/label metadata; do not call credential-returning, refresh, streaming, or authentication methods.
- `pi.getMcpServers()` lists extension registrations, not all configured servers or connection health. Do not subscribe to `mcp_servers_change`: that handler identifies an MCP connection owner.
- `DefaultPackageManager.getInstalledPath()` and `SettingsManager.inMemory()` provide a possible non-mutating installed-path adapter. Use public exports only and inspect their current implementation before use; never call `resolve`, install, update, or extension loaders. A local `npm root` lookup, if the public adapter requires it, is acceptable with a bounded failure fallback; no network or lifecycle scripts.
- No complete loaded-extension list or session MCP-health getter was verified in the command context. The v1 contract deliberately labels those gaps rather than requiring private APIs.
- Installed documentation reports APIs newer than root development dependencies (`^0.99.1`). Before implementation, verify actual workspace-resolved types. Use guarded adapters for optional APIs and unknown-state fallback; declare the supported host version based on typechecked evidence. Do not upgrade every workspace to solve a package-local issue.

### Architecture

Collect live metadata and safe file projections into one versioned plain-data snapshot, normalize identity/provenance and relationship edges, then render HTML from that snapshot. Keep collection, normalization, rendering, and command/output integration separately testable within one workspace.

Read settings/manifests/presets/tools/MCP/model files without executing values. Retain both declaration layers and compare to `pi.getSettings()`; do not overwrite runtime truth with a reconstructed merge. Resolve relative paths against their owning configuration directory, preserving source metadata. Normalize npm identity without version, Git identity without ref, and local identity by resolved path. Cover standard host-supported forms; unfamiliar forms remain separate/unknown rather than falsely deduplicated. Respect `autoload: false` filtering deltas rather than treating them as replacement entries. No project files are read when project trust is absent; report the scope as withheld.

Read installed manifests/declaration roots only; do not import extension code to inspect it. Use registry source metadata to establish observed capability edges. A declared manifest path is not proof of load success. If config was edited since load, label disk definitions versus runtime observations as separate snapshots.

Security is projection-first: never serialize raw settings/provider/MCP objects, credentials, tool parameter defaults, MCP arguments/env/headers/URLs, provider endpoint URLs, full system prompts, or arbitrary error messages. Package URLs must have credentials/query/fragment stripped before display. Provider summaries use only IDs and safe registry status; never read `auth.json`. Preset instructions and descriptive text are shown as escaped local text and may contain user-private content: document that the report is local/private, not a sanitized public export. Errors report file/category without echoing input. No string-based shell invocation; browser opening uses fixed executable plus argument array.

## Decisions and Assumptions

- `D1` Package/workspace name is `pi-toolkit`; overview is a feature with command `/overview` and page title My Pi. Preserve the existing work-document basename to keep this planning thread's paths stable.
- `D2` Write a single latest HTML file per session under `<agent-dir>/overview/`, using a sanitized session ID and restricted permissions where supported. An optional `PI_OVERVIEW_DIR` relocates output. Do not add persistent overview settings, overview command flags, text export, or a JSON export in v1. Existing flags of migrated features stay unchanged.
- `D3` Status vocabulary separates declared, installed-path-found, runtime-observed, active-set, filtered/overridden, missing, and unknown; each displayed fact has source or observation evidence.
- `D4` Use direct command-time snapshots, no automatic startup export. Rerunning `/overview` refreshes the report; browser reload alone does not refresh Pi state.
- `D5` Features retain separate loadable entry points inside one toolkit workspace. Share pure config/state readers internally when it prevents drift, never import an entry point to inspect state. Preserve `preset-state` and existing config paths, commands, shortcuts, and hook semantics; recorded preset state is not proof its requested loadout still applies.
- `D6` One serial source writer owns consolidation, overview, and migration tooling. Live cutover follows publication and scoped inspection/approval; no delegation is authorized by this plan.
- `D7` Source-only TypeScript packaging follows existing small extensions; no separate frontend framework/build or added runtime dependencies unless a concrete unsupported host format warrants a documented revision.
- `D8` Optional host introspection gaps are nonblocking and rendered as unknown. They must not be hidden as zero/none, and supported-host/manual evidence must record them.
- `D9` Consumer scope is local global Pi (`getAgentDir()`, normally `~/.pi/agent`) and the existing configured remote service only. Other consumers are not assumed absent; unknown references become reported residuals, not permission to scan/mutate all projects.
- `D10` Use targeted, previewable, backup-first, idempotent migration. Preserve consumer-owned exclusions/preferences and third-party packages; never run full `restore.sh --force` or blanket `pi-sync --accept-config` as a shortcut for this migration.

## Files

Verified existing integration/reference paths:

- `package.json` — replace the three old feature entry paths with toolkit paths in the same relative hook order; add overview, leaving other package entries unchanged.
- `AGENTS.md`, `CONTEXT.md`, `README.md` — document package scope, architecture, and user command; preserve unrelated existing edits.
- `package-lock.json` — update workspace metadata if required by npm, without unrelated dependency upgrades.
- `packages/pi-recap/{package.json,tsconfig.json,src/index.ts,test/html.test.ts}` — reference patterns, no intended edits.
- `packages/pi-tools/`, `packages/pi-presets/`, `packages/pi-skill-mentions/` — migrate implementation, tests, guidance and license attribution into toolkit; retire old workspaces only with new load paths and migration ready. Avoid compatibility stubs that duplicate registration.
- `configs/global/{restore.sh,README.md,settings.json}` — update documented package structure and narrow old-declaration/filter migration; do not overwrite personal model/provider/tool defaults.
- `scripts/{pi-sync,pi-sync.py,pi-sync-dokploy.py,pi-sync-test.py}` and `configs/global/pi-sync.test.mjs` — existing but uncommitted sync integration/reference paths; change only what the targeted cutover requires and retain unrelated behavior.

Proposed new paths (not existing files):

- `packages/pi-toolkit/{package.json,tsconfig.json,AGENTS.md,CONTEXT.md,README.md,.env.example}`.
- `packages/pi-toolkit/src/features/{tools,presets,skill-mentions,overview}/index.ts` — four separately loadable feature entry points.
- Overview collection/schema/normalization/HTML modules under `packages/pi-toolkit/src/features/overview/`; move existing feature helpers beside their entry points, sharing pure internal helpers where justified.
- Existing feature tests move into toolkit without losing coverage; add risk tests for overview and migration. Define toolkit test discovery to include both migrated tests and new colocated tests.
- A narrowly scoped migration helper/test under `configs/global/` if existing restore/sync code cannot safely expose preview/apply without broader config replacement. Final helper filename is chosen during implementation and documented before use.

## Acceptance Criteria

- [ ] AC1: `/overview` creates a usable self-contained HTML report and opens it in the local browser during interactive use. It always reports its path and survives browser-launch failure; automated/non-TUI invocations do not auto-open a browser. No command flags or text export are implemented.
- [ ] AC2: All scoped declarations and observed capabilities appear with origin/status evidence; this repository's filtered Git copy and local development checkout are explained without claiming two loaded copies.
- [ ] AC3: Tool rows separate live membership, exposure/callability, saved defaults, and preset requests. Preset whole-name overrides, recorded state, unknown tools, and resume/manual divergence are represented accurately.
- [ ] AC4: Provider rows separate current/default/auth-configured/model-availability; MCP rows separate configured/extension-registered/observed-tools/unknown connection state. Empty and unknown are visibly different.
- [ ] AC5: Search, section links, expanders, keyboard navigation, and responsive dark/light presentation allow a user to answer what supplies `/preset`, which presets exist, and why a declared package/tool is not active without reading raw JSON.
- [ ] AC6: The overview command performs no config/session/tool/model/MCP mutation, auth resolution, network call, extension import, or server launch. Only report output and an optional local browser launch are its side effects. Secrets in disallowed fields never enter the snapshot/rendered output; untrusted text cannot execute in HTML.
- [ ] AC7: Invalid/missing files and unsupported optional APIs yield localized safe warnings/unknown state rather than a broken report or misleading empty inventory; untrusted project scope is not read.
- [ ] AC8: New workspace is registered/documented, typechecks, and passes risk tests and root regression tests; any unrelated baseline failures are recorded rather than attributed to this feature.
- [ ] AC9: Toolkit supplies `/tools`, `/preset`, skill-mention expansion/autocomplete, and `/overview` once each. Feature filters remain independent; existing presets.json, tools.json, shortcuts, and preset-state remain compatible. Old workspaces are retired without behavior regression.
- [ ] AC10: Targeted migration previews exact local-global/remote changes, backs up only changed files, preserves unrelated settings and deliberate filters, rejects malformed/ambiguous state safely, and is a no-op on repeat. No credentials/sessions/trust or project-owned config is changed.
- [ ] AC11: Following separately approved publication and activation, both scoped consumers have the verified intended published revision, no stale active old entry paths or duplicate registrations, and passing command/preset/mention/overview smoke checks. Record installed revision, source attribution, reload requirements, and rollback evidence per target. Remote HTML stays local to the remote filesystem; no server/tunnel is added.

## Consumer Migration and Cutover

1. Inventory only the two scoped consumers' settings, standalone extension references, canonical Git package filters, and installed manifests. Read credential-free metadata; capture current installed commit and targeted backups. Verify remote deployment identity against current sync configuration before any remote work.
2. Map old feature paths to `packages/pi-toolkit/src/features/tools/index.ts`, `.../presets/index.ts`, and `.../skill-mentions/index.ts`. Prefix filters map to the corresponding feature subtree; exact old entry paths map to new index paths. Preserve include/exclude intent and `extensions: []`, resource lists, ordering, and autoload deltas. Conflicting/ambiguous selectors fail with an actionable preview; do not silently broaden permissions.
3. Keep `git:github.com/Patrick3131/pi-packages` as the canonical installation source; this is an internal workspace reorganization, not an extra npm install. Replace verified standalone old feature declarations with equivalent feature selections in the canonical source, preserving disabled features. Do not treat arbitrary packages with similar names as first-party or delete unknown loose files.
4. Add migration fixtures and repeat-run/backup proofs. Adjust restore/fresh-install behavior so retired references cannot be reintroduced. Integrate narrow migration with sync or invoke it as an explicit separate gate; current sync replaces matching shared declarations, so guard consumer-owned filters rather than copying the snapshot over them.
5. After implementation validation, obtain publication/activation authorization, publish the selected source commit, preview each consumer, then update only the shared Git package and apply the reviewed narrow migration using existing remote lock/user boundaries. No full restore, unrelated config sync, Pi upgrade, third-party upgrade, project scan, service restart, or deletion of caches/worktrees.
6. Reload/start a fresh session per consumer and verify the four feature surfaces register once, source paths are toolkit-owned, preset/tool behavior and mentions still work, overview reports provenance, and feature disable filters remain effective. Remote overview generation is sufficient; the file may be copied explicitly for browser inspection without introducing hosting.
7. Migration and update are not transactional across targets. On failure, stop and report exact target/revision/changed files; retain backups and inspection artifacts. Roll back the shared package to the recorded prior revision together with only the targeted settings references, avoiding mixed old/new entry paths. Do not overwrite later personal edits or claim both targets complete after one succeeds.


## Validation

Use fixture-driven collection/normalization tests, a command harness proving side-effect boundaries, safe HTML rendering tests, and a manual local report check. Detailed risks, commands, and pending evidence are in the companion test plan. Planning itself does not run implementation tests or claim a UI exists.

## Open Questions

None

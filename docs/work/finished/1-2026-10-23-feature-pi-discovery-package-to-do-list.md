---
status: done
owner: engineering
last_reviewed: 2026-10-23
canonical_ref: 1-2026-10-23-feature-pi-discovery-package.md
---

# To-do — `pi-discovery`

## Execution order

Execute directly: move/replace the package, implement the final API, update
consumers and release. Breaking changes are accepted; no temporary copy, parity
stage, compatibility shim or legacy aliases. Keep the final tree buildable.

## 1. Replace the package

- [x] Recheck deployed OpenAPI against discovery-services models/errors and the
      primary spec. Use a sanitized real-response shape or authored fixture;
      do not copy credentials. Server is already live; no new login needed.
- [x] Move pi-searxng directly to pi-discovery; reuse useful search code/tests and
      remove obsolete code/config aliases. Define the final public API and use
      DISCOVERY_WEB_SEARCH_ENABLED. Include all src/test in strict NodeNext checks.
- [x] Add package docs/.env.example with actual private-VPN access and default-off
      behavior. No invented API token, context_size or insecure-HTTP opt-in.

**Done when:** the replacement package exists with no duplicate legacy package.

## 2. Implement the client and tool contract

- [x] Add askWeb and exported runtime error class; env/fetch/signal injection,
      validated request bounds, snake_case wire types, source_type/search actions,
      optional usage, request identity and timings.
- [x] Couple server timeout_ms with the longer HTTP deadline; retain cancellation
      and deadline through body read, cleanup listeners/timer; one fetch, no retry.
- [x] Validate configured origin; reject credentials and redirects without raw
      URL/body echo. Do not add a bearer header or model-selection parameter.
- [x] Normalize only supplied sources to requested cap; preserve empty-source
      successes/gaps. Render answer, Search results and gaps consistently.
- [x] Map server codes distinctly (disabled/auth/busy/quota/timeout); unknown
      status/code stays upstream. Parse Retry-After without inventing a delay.
- [x] Test the named risks in the companion plan at the cheapest stable layer.

**Done when:** deterministic tests prove contract and failures without network calls.

## 3. Wire Pi lifecycle

- [x] Register both schemas and safe tool results; rethrow caller cancellation,
      return typed failures with isError:true, retain meaningful TUI output.
- [x] Use native defaultActive for env/default-off; toolkit handles project overrides.
      Respect CLI/child/preset/history ownership; no discovery lifecycle filter.
      Fix the narrow toolkit CLI-startup override and prove it with real sessions.
- [x] Exercise discovery + existing toolkit/preset handlers in actual registration
      order; keep any shared ownership helper narrow and documented.

**Done when:** fresh defaults and explicit selections agree with the primary spec.

## 4. Update exports, configuration and callers

- [x] Update search exports/extension to the final API; add askWeb, schema, runtime error
      class and types to src/research.ts. No host runtime import in the bundle.
- [x] Update root package list/docs, AGENTS/CONTEXT, configs/global/README and any
      scripts/config references found by grep. Keep README API/env examples aligned.
- [x] Remove remaining old exports/config references and regenerate the lockfile
      after deletion; assert old workspace/link absent. Update callers directly.
- [x] Clean install; root typecheck/test/build and build:research. Inspect emitted
      declarations and smoke built research import in a host-free environment.

**Done when:** both tools and the final exports work with no compatibility layer.

## 5. Release and live acceptance

- [x] One explicit DISCOVERY_LIVE=1 check against production plus direct SearXNG
      smoke; explicit live mode fails on unreachable service, no silent skip.
- [x] Choose a new exact root registry patch version; commit/push and use existing
      tagged release CI. Record source/version/workflow and artifact integrity.
- [x] Smoke the installed registry artifact for exports and extension paths;
      reload a test Pi session and call each tool once with project opt-in.
- [x] Following Melon Labs' repository instructions, bump apps/agents from registry
      0.1.6 to the newly published exact version, update its lockfile and adapt
      affected imports/config/tool adapters to the new contract; run affected
      checks/build. No requirement to preserve the previous adapter contract.
## 6. Update local global Pi and melon-remote

- [x] Inspect the local global Pi and configured melon-remote Pi/Paseo install;
      record their current source revision and discovery extension/config references.
- [x] Update any discovery-related package filters, removed extension paths and
      enablement keys to the new package. Extend the existing narrow pi-sync
      migration only where required; no compatibility aliases or cache edits.
- [x] Run `./scripts/pi-sync --toolkit-only --check`, inspect both target previews,
      then `./scripts/pi-sync --toolkit-only --apply` for the published source.
      Verify both installed revisions; do not use --local-only or full restore.
- [x] For melon-remote, verify the temporary Dokploy task reaches terminal success
      with completion logs; no SSH/sudo or workspace scan. Preserve unrelated
      settings, credentials, models, MCP configuration and sessions on both targets.
- [x] Reload/start fresh on local global Pi and melon-remote; confirm pi-discovery
      loads and the removed pi-searxng extension is no longer referenced.
- [x] With both tools enabled in a test session on each target, run one web_answer
      and one web_search_searxng call. Record installed revision, loaded tool names,
      network reachability and successful results separately for local and remote.

**Done when:** both actual installations use the new package and pass tool calls;
publication or a successful sync command alone is insufficient.

## 7. Closeout

- [x] Record verification, promote durable package docs, move these three files to
      docs/work/finished only after implementation/release acceptance is complete.

## Recovery

Fix forward, or revert the update and restore the matching consumer version. No
parallel compatibility implementation or staged rollback mechanism is required.

Implementation finding: installed Pi 1.3.0 ToolDefinition.defaultActive natively
implements default-off/environment defaults while host/toolkit owns explicit
selection. Use it instead of a custom discovery session_start filter; verify
with real Pi session loading plus toolkit project overrides.

Local implementation evidence (2026-10-23): clean npm ci, root typecheck/test/
build/build:research passed. New client/real Pi lifecycle tests pass, live
production Luna + SearXNG check passed. Built research imports without host
dependencies; pack inspection contains the new extension, no old package.
Release 0.1.7, consumer pin and local/remote activation completed; evidence below.

## Completion evidence — 2026-10-23

Released 0.1.7 from a3d0230; release CI, local checks, consumer checks and both
installed-session tool calls passed. Local global and melon-remote use the new
package. Melon Labs pin update is local commit 3c512a797; no application deployment.
See [full acceptance and operational caveats](1-2026-10-23-feature-pi-discovery-package.md#completion-evidence--2026-10-23).

---
status: done
owner: engineering
last_reviewed: 2026-09-30
canonical_ref: none
---

# Shared work skills without duplicated orchestration

## Type

technical

## Problem

Pi Packages and Melon Labs maintain separate versions of the same three planning/implementation skills. The global package excludes pi-work skills to avoid collisions, while /work embeds the packaged versions anyway. Direct skill invocation and /work can therefore follow different procedures.

Melon Labs also carries three generic workflow scripts and many phase-specific agents. Its serial implementation workflow already catches failures and reserves finishing time, but still uses 30-minute mutation caps, forked implementation/finalizer contexts, and multiple mandatory phases. Moving all that machinery into a shared package would centralize complexity rather than remove it.

## Outcome

One canonical set of three work skills in pi-work, consumed by Pi installations and accessible to existing non-Pi hosts without maintained copies. Repositories own their scope, commands, architecture, permissions, and specialist skills. Execution is direct by default; authorized delegation uses existing builtin agents and concise handoffs, not a new workflow engine.

## Scope

### Included

- Consolidate planning, implementation, and their thin composition skill in packages/pi-work.
- Retain three-file work packages, risk-based testing, readiness, /work injection, and completion evidence.
- Replace repository-chain/workflow requirements with a short host-neutral procedure and bounded Pi host notes.
- Align pi-delegation's standing policy so it does not reintroduce automatic multi-phase orchestration or depend on removed project agents.
- Migrate Melon Labs as the first consumer: remove duplicate generic skills, generic scripts, and orphaned generic phase agents; preserve actual project policy and specialist resources.
- Enable canonical package skills in the sanitized global snapshot, restore normalization, and both local and melon-remote Pi installations only after collision checks. Remote discovery is a required cutover gate, not an assumed consequence of updating packages.
- Preserve non-Pi discovery with documented user-level links to the installed canonical skill directories, including shared templates/policy and operator-only host metadata.
- Migrate all local and remote repositories/setups that carry these generic skills or workflow copies, as explicitly requested in the implementation goal. Inventory discovery roots, linked worktrees, and runtime consumers before activation; retain each repository's actual local policy.

### Excluded

- A shared scripted workflow, phase registry, budget planner, checkpoint database, automatic resume engine, config schema, or synchronization service.
- New worker/reviewer agent copies when pi-subagents already supplies those roles.
- Changing provider transport, retry settings, Goal behavior, or all global deadlines.
- Product code, existing crawl implementation work, MCP authorization, credentials, infrastructure redeployment, or business-specific skills. The narrowly scoped remote package/settings activation and reload described below are included.
- New automatic commit/push behavior. Publication and live activation require the implementation request's authority.

## Implementation Notes

### Keep the method, delete the machinery

Keep the existing public skill names. Planning produces the canonical work package. Implementation performs risk-justified tests and code in one ownership loop, verifies the result, obtains review when warranted and authorized, applies findings, then finishes the documents. The composite skill delegates to its siblings instead of duplicating their bodies.

Small work runs directly. When delegation is authorized, assign one bounded slice to builtin worker and request a fresh read-only builtin reviewer for substantial work. Multiple review lenses and isolated parallel writers are optional, justified by named risks and exclusive paths, not fixed stages. Never treat enabling tools alone as delegation authorization.

Use fresh child context with exact scope paths, relevant project guidance, changed paths, and concise evidence. Fork only when a documented state dependency needs it. Use existing run deadline/checkpoint controls explicitly on launches or resumes where supported; do not add an enforcement framework or claim a best-effort checkpoint guarantees safe termination. On failure, inspect the worktree and existing handoff, continue remaining work rather than restarting completed phases, and distinguish infrastructure interruption from an external task blocker.

### Keep project meaning local

Melon Labs retains AGENTS.md, CONTEXT.md, work-folder lifecycle guidance, package boundaries, npm run quality:affected, feature-owned work locations, presets, MCP policy, browser/crawl configuration, and business/operations skills. Shared skills read these documents; do not add an adapter file duplicating their content. Existing PI_WORK_* overrides and explicit supplied package paths remain supported.

Pi-specific launch details belong in a compact Host notes section. Non-Pi hosts use their own tools and authorization rules. Preserve disable-model-invocation and supported non-Pi operator-only metadata.

### Distribution and cutover

Pi loads the canonical skills through the existing Git package, not restore-time copied workflow files. /work and direct skill invocation must resolve the same source. The restore snapshot controls installation and machine preferences only.

Before removing Melon copies, make canonical skills discoverable to its existing non-Pi host through user-level links in the verified ~/.codex/skills location, targeting the installed package checkout; ensure sibling _shared resources resolve. Do not commit machine-specific absolute links into Melon. Confirm actual host discovery and operator-only handling before deletion. Do not expose a second copy to Pi through a directory Pi also scans.

Inspect affected installations/repositories for same-name skill copies before removing the global exclusion. Other consumers may require a coordinated cutover; do not blindly activate duplicate names. Preserve unrelated package filters and settings. Restore must remove the specific obsolete pi-work exclusion from existing objects, not only change defaults for new installs.

### Remote installation and required migration gate

Verified source: /Users/patrick/Development/melon-remote/scripts/paseo-init.sh clones pi-packages and runs configs/global/restore.sh --force during bootstrap. That restore installs the Git package globally. Remote PI_CODING_AGENT_DIR is /data/pi-agent, backed by persistent state. This proves intended provisioning, not the current live installation or successful network-dependent bootstrap.

The remote currently receives the same obsolete skill exclusion as local Pi. Updating package code through paseo-update extensions does not itself migrate /data/pi-agent/settings.json: its implementation updates extensions/browser/plugin, not the global snapshot. Reload alone cannot remove that filter.

Implement the cutover in this order:
1. Publish the canonical skill resources and corrected restore policy within granted implementation authority; do not delete Melon copies yet.
2. Verify the running remote's actual package revision, agent directory, settings, and skill discovery roots. Back up its settings. Apply a targeted removal of only the obsolete pi-work exclusion, preserving other settings/filters. Use existing installation/update facilities; do not introduce another installer or synchronization service.
3. Verify canonical discovery on local and remote Pi using a disposable checkout/discovery setup without the local duplicates, then perform a coordinated consumer cutover. Confirm all three skill names resolve exactly once, sibling templates/testing policy load, and both direct invocation and /work use the canonical source.
4. Remove Melon's maintained copies only after local, remote, and existing non-Pi discovery gates pass. Update the remote Melon checkout to that verified consumer revision and reload or start a fresh session; check discovery again in the actual workspace. Avoid a persistent interval with both same-name sources enabled.
5. Record installed package/consumer revisions and discovery evidence. Demonstrate the corrected bootstrap policy in an isolated fresh/persisted-state fixture or an explicitly approved restart; do not restart infrastructure solely to prove a documentation claim.

If remote access, publication authority, network installation, or discovery fails, leave the package incomplete and retain the old consumer resources. Roll back the narrow setting change from its backup if needed, rather than enabling both sources or restoring unrelated machine preferences.

Melon Labs has unrelated dirty .pi/tools.json; Pi Packages has extensive unrelated crawl changes. Preserve both. Use path-scoped diffs and commits if publication is authorized. Do not run a broad force restore over personal settings.

## Files

Paths below exist unless marked proposed. Melon Labs paths are relative to /Users/patrick/Development/melon-labs.

- packages/pi-work/skills/{task-and-plan-routing,implement-tdd-review-runner,plan-and-implement-runner}/SKILL.md — canonical concise method; remove stale .chain.md hooks.
- packages/pi-work/skills/_shared/ — retain canonical templates/testing policy.
- packages/pi-work/skills/*/agents/openai.yaml — proposed minimal operator-only metadata if required by verified non-Pi discovery.
- packages/pi-work/{AGENTS.md,CONTEXT.md,README.md} — distribution and ownership documentation.
- packages/pi-work/test/{skills,prompts,scaffold}.test.ts — inspect existing coverage; update the obsolete exclusion expectation.
- packages/pi-delegation/src/guidance.ts and its existing tests — remove stale project-role routing and align bounded authorization policy.
- configs/global/{settings.json,restore.sh,restore.test.mjs,README.md} — canonical skill enablement and narrow old-filter migration.
- README.md and CONTEXT.md — shared ownership/distribution references.
- Melon .shared-agents/skills/{task-and-plan-routing,implement-tdd-review-runner,plan-and-implement-runner}/ — remove duplicate bodies/resources after host discovery passes.
- Melon .pi/workflows/{work-item-creation,implement-tdd-review,implement-tdd-review-parallel}.js — retire generic scripted workflows.
- Melon .pi/agents/implement-tdd-review-*.md and work-item-*.md; test-validator.md — remove only roles whose remaining consumers have been migrated; preserve specialist usage if found.
- Melon {AGENTS.md,CONTEXT.md,.pi/README.md} and any verified active references — describe shared method, local policy, and simplified invocation.
- Live ~/.pi/agent/settings.json and ~/.codex/skills — narrowly migrate/link during authorized activation; not package source or committed machine paths.
- /Users/patrick/Development/melon-remote/scripts/{paseo-init,paseo-update}.sh, docker-compose.yml, and docs/deployment/CONTEXT.md — verified installation/update boundary; inspect and document the cutover, change bootstrap code only if required to consume the corrected shared policy.
- Remote /data/pi-agent/settings.json and /workspace/melon-labs — inspect and narrowly migrate settings/update the consumer checkout during authorized activation; do not commit runtime state.

## Acceptance Criteria

- [x] AC1: Each of the three generic skill bodies has one maintained source in pi-work; /work and direct Pi invocation use that source, with public names and three-file lifecycle intact.
- [x] AC2: Small tasks require no subagents or scripted phases. Authorized substantial tasks can use builtin worker/reviewer with bounded scope, fresh handoffs, verification, and recovery from actual state; no new orchestrator or duplicated agents ship.
- [x] AC3: Melon generic copies/scripts and unused phase agents are removed, with no active dangling references. Local commands, feature work placement, specialist resources, and MCP policy remain intact.
- [x] AC4: Existing and fresh global installs load the canonical Pi skills once; obsolete exclusion migration preserves unrelated settings/filters. Existing non-Pi discovery resolves the same skill source and its siblings without tracked absolute links.
- [x] AC5: Existing relevant tests pass, packaging includes required resources, and smoke checks in Pi Packages and Melon prove local policy/lifecycle behavior. Incomplete work and failed validation cannot be reported complete.
- [x] AC6: Running melon-remote Pi is verified on the published canonical skill revision with the obsolete filter removed. All three skills and their shared resources resolve once through direct invocation and /work without Melon copies; the actual remote consumer checkout works after cutover. Corrected bootstrap policy covers fresh and persisted state. Remote failures leave the migration incomplete and old resources recoverable.

## Validation

Use existing skill/injection and restore tests plus focused real-host discovery and invocation checks. Detailed commands and risks are in the test companion. Record commands actually run and limitations; do not count documentation promises as runtime evidence.

## Verified implementation

- Canonical method published in `e2e58e1`; `/work` and direct invocation load the same three operator-only skills. No shipped workflow runtime, phase registry, copied agents, or synchronization mechanism.
- Pi and Codex discovery passed in **76 local checkouts**; remote Pi passed in **22 workspaces**, remote Codex in **9 accessible workspaces**. Each public name resolves once. Local producer/package skill bytes are identical; shared templates/policy resolve. Actual Codex loaders accept the operator-only YAML policy (local 0.149.1, remote 0.159.2).
- Nine local consumer setups and every inventoried remote consumer lost generic copies/scripts/orphaned agents. Five additional remote legacy chain files were backed up and retired. Active reference audits, including presets/extensions and backlog plans, return zero hits. Typed routing, feature ownership, specialist resources and permissions stay local.
- Direct feature-owned fixture passed existing regression coverage and finished three documents together. Bounded worker checkpoint, fresh independent review, parent validation and actual-state recovery passed; a separate unready package returned BLOCKED with all six core files unchanged. Current remote `/work plan` and direct implementation passed through persistent RPC and finished the marker fixture correctly.
- Narrow settings migration and bootstrapping preserve personal filters/configuration. Live verification uncovered and fixed an existing account-setup provider overwrite: published `melon-remote` revisions `7a6686c` and `726eefe`; actual helper matches the latter, mode 0755. The original provider was narrowly recovered from the protected backup, and settings/subagent preservation checks pass.
- Relevant tests/typechecks/packaging pass. Default parallel full-suite runs exposed unrelated crawl extractor deadline failures; unchanged crawl passes serially (209 passed, 3 skipped). No crawl source/assertion/deadline changes were made for this goal. Concurrent crawl commit `2a3088a` and subsequent edits were left untouched.
- Consumer migration is verified working-tree state, not an implicit push of unrelated product branches. Exact base revisions and scoped cutover fingerprints are recorded in the test evidence/ledgers; existing staged and unpublished work remains intact.

## Open Questions

None

Assumptions: Melon Labs is the first migrated project; public skill names and work-document shape stay stable. Cross-host access remains supported through one canonical source. The implementation goal expands migration to all local and remote consumers of these generic resources; unrelated specialist skills and product changes remain out of scope.

---
status: done
owner: engineering
last_reviewed: 2026-09-30
canonical_ref: none
---

# Shared work skills simplification Test Plan

## Coverage Decision

Existing coverage is sufficient for skill injection/readiness/lifecycle, with targeted restore regression coverage required for the changed installation policy. No new orchestration runtime is introduced.

Reason: the material runtime change is enabling canonical skills in existing settings without collisions or collateral changes. Instruction quality and cross-host discovery require actual host smoke checks, not tests matching prose.

## Risk Coverage

| Material failure risk | Existing coverage | Cheapest stable proof | Planned change |
|---|---|---|---|
| /work and direct skills drift or sibling templates disappear | packages/pi-work/test/skills.test.ts and prompts.test.ts | Existing loader/injection tests plus host discovery | Update obsolete exclusion expectation; retain meaningful resource checks |
| Restore retains the exclusion or erases unrelated package filters/settings | configs/global/restore.test.mjs | Mocked isolated restore integration | Extend existing fixture for the narrow filter migration and repeat-run behavior |
| Deleting Melon copies breaks Codex or local lifecycle/commands | Existing project guidance; no host proof yet | Actual Pi/non-Pi discovery and disposable invocation | Manual evidence; no source-string tests |
| Remote package is installed but skills remain excluded, or bootstrap failure is mistaken for success | melon-remote bootstrap/update source and restore fixtures; live state not yet verified | Targeted settings migration tests plus actual remote discovery | Verify published revision, persisted filter removal, sibling resources, and actual workspace after cutover |
| Removed agents/scripts retain live consumers or interrupted work appears complete | Workflow reference inspection and shared readiness tests | Scoped reference audit and controlled failure handoff | Manual checks; no fake timer engine |

## Automated Cases

Default zero to three new cases; prefer extending existing tests.

- Existing settings containing the specific pi-work exclusion are migrated; unrelated settings and resource filters remain unchanged.
- Fresh/repeated restore keeps the canonical skills enabled without duplicate package entries or further mutation. Combine with existing fixtures where practical.
- No additional prose/snapshot tests. Existing loader and injection tests prove the retained public skill contract.

## Browser Or Manual Verification

| Step | Expected result |
|---|---|
| Inventory affected skill discovery roots before activation | No same-name copy is silently overwritten or exposed twice |
| Inspect skills in fresh Pi sessions from Pi Packages and Melon; exercise /work handoff and direct invocation | One canonical generic skill source; same procedure through both entry points |
| Inspect existing non-Pi host discovery from Melon after link setup | Canonical operator-only skills load; sibling _shared resources resolve; no tracked machine-specific links |
| Inspect running melon-remote agent directory, installed package revision, settings, and discovery roots before deletion | Actual state is known; the Git package's presence alone does not prove its skills are enabled |
| Back up remote settings, update package, and narrowly remove the obsolete skill exclusion; use duplicate-free disposable discovery before consumer removal | All three published canonical skills resolve once; unrelated settings/filters and private state remain unchanged |
| Exercise remote direct skill invocation and /work, update actual Melon checkout to the verified cutover revision, then reload/start fresh and repeat | Real remote workspace works without Melon skill copies; siblings/templates/policy resolve; package and consumer revisions are recorded |
| Test corrected bootstrap against fresh and persisted state in isolation, or use an approved restart | Shared restore policy enables canonical skills; failed network/bootstrap does not produce a false success |
| Remote gate fails before deletion | Consumer resources remain available, package stays incomplete, and targeted rollback avoids dual discovery |
| Plan a disposable Melon feature-owned work item and a Pi Packages work item | Repository-specific placement and guidance are honored without new adapter configuration |
| Execute a small disposable scoped change directly | No compulsory workflow/agents; risk-based tests and local validation remain applicable |
| Authorized bounded worker plus fresh read-only reviewer on disposable work | Exact path ownership, concise handoff, parent verification, and no mandatory review fanout |
| Controlled interruption with a durable handoff | Remaining work is reconstructed from actual state; no automatic replay of completed phases or false success |
| Check removed workflow/agent names in active files and inspect final diffs | No dangling consumer; specialist skills, MCP policy, product code, and unrelated dirty files preserved |

## Commands

Verified scripts/paths as of planning; implementation records actual results.

```sh
# Pi Packages
npm test --workspace=packages/pi-work
npm run typecheck --workspace=packages/pi-work
npm test --workspace=packages/pi-delegation
npm run test:configs
npm pack --workspace=packages/pi-work --dry-run
git diff --check

# Melon Labs: repository contracts, not the whole product suite for instruction deletion
npm --prefix /Users/patrick/Development/melon-labs run check:repository
git -C /Users/patrick/Development/melon-labs diff --check

# Before any authorized commit in Pi Packages
npm run test
```

Remote installed helper verified: paseo-update extensions updates package code but not persisted settings. Run it only within granted activation authority, followed by targeted /data/pi-agent/settings.json migration and actual discovery checks. Resolve remote access/host discovery commands from the running deployment during implementation; do not invent SSH targets. /reload or a fresh session is required after the cutover.

Use scoped formatting checks on changed Melon Markdown/JSON only, not the repository-wide format command. For host-specific discovery/launch commands, inspect the installed host docs during implementation and record exact invocations rather than guessing them in this plan.

## Explicitly Not Testing

- Product browser journeys, production MCP calls, credentials, deployment, or live crawl behavior.
- Provider timeout/retry tuning, Goal internals, or unrelated active crawl changes.
- Exact prompt prose, source structure, test count/coverage targets, or a new mocked workflow runtime.
- Timer/checkpoint safety by assertion: checkpoint delivery is best-effort and requires honest evidence, not a promise.

## Execution evidence — 2026-09-30

### Automated proof

- `npm test --workspace=packages/pi-work`: **43 passed**; `npm test --workspace=packages/pi-delegation`: **5 passed**. Both workspace typechecks pass.
- `npm run test:configs`: **16 passed**. Narrow migration backs up immediately before mutation, removes only the exact obsolete exclusion, preserves other filters and intentional empty selections, is idempotent, rejects malformed JSON/force combinations, and does not copy machine configuration/install packages.
- `npm pack --workspace=packages/pi-work --dry-run`: includes all three skills, `agents/openai.yaml`, `_shared` templates/testing policy and extension/scaffold resources.
- `python3 ../melon-remote/tests/paseo-work-skills.test.py /Users/patrick/Development/pi-packages`: **1 integration case passed**, covering fresh/persisted/repeated bootstrap and actual account-setup code with fake protected keys. A named provider-preservation regression was recorded red before the guard and green after it. Fresh settings retain the existing named-account default; persisted operator choices, auth fixture data and subagent preferences survive.
- `bash -n` on both remote scripts and scoped migration `git diff --check` pass. Melon `npm run check:repository`: **350 passed, 1 skipped**, boundary/testing-policy/audit commands passed. Scoped Melon Markdown Prettier checks pass.
- Full `npm run test` was run before publication and passed earlier. Final default-parallel attempts hit existing crawl extractor deadlines (logs retained); unchanged `npm test --workspace=packages/pi-crawl4ai -- --runInBand` passes **209 tests, 3 skipped**, with the same assertions/deadlines. Every other workspace passed those full attempts; configs passed separately. No unrelated crawl fixes, test suppression or timeout tuning. Unrelated pre-existing whitespace in four non-consumer repos was also preserved, not silently reformatted.

### Actual host and invocation gates

- Inventory: 64 Development checkouts plus 12 additional Home/global-install checkouts; **76 local Pi and Codex discovery gates passed**. Three names per workspace; source is the installed Git package (or identical producer files in Pi Packages). Public skill bytes match. User-level `~/.codex/skills/{task-and-plan-routing,implement-tdd-review-runner,plan-and-implement-runner,_shared}` links are usable and untracked; no private agent state moved.
- Remote: **22 Pi workspaces** and **9 Codex-accessible workspaces** pass discovery. Running Pi 0.99.1, HOME `/data/home`, agent dir `/data/pi-agent`, installed revision `e2e58e1dea176cbb6353c7223cee1c7aa2c7b8d2`. Code-only checkout `/workspace/.runtime/pi-packages`; managed install alias survives real `pi update` and observed container replacement. Codex links resolve the same source from its separate home; its live loader recognizes typed `policy.allow_implicit_invocation` metadata. A disposable malformed policy produces the expected warning, not a skills/list error: ancillary metadata intentionally fails open. Canonical metadata is valid false.
- Duplicate-free local/remote/non-Pi discovery succeeded before consumer deletion. After cutover, all names/templates resolve once in the actual workspaces. Rechecks on observed current container `367428a314da` pass; no manual infrastructure restart was issued for proof.
- Current remote `/work plan` via persistent RPC created exactly three ready flat-layout documents without implementing. Direct `/skill:implement-tdd-review-runner` then produced exact `canonical remote final\n` bytes (23), verified them, and moved all three done documents to `finished/`. Parent independently checked marker bytes and final paths. Earlier print-mode `/work` exited before its asynchronous follow-up and emitted stale-context diagnostics; that failed attempt is not counted as proof. Persistent RPC is the verified command interface; no SDK/transport workaround was shipped.
- Local `/skill:plan-and-implement-runner` respected feature-owned `docs/features/readiness/work/finished/`, changed only the fixture gate to `is True`, reused existing unittest (red then green), and finished the three-file package directly. No delegation/commits/dependencies/new tests.
- Authorized bounded worker left an honest in-progress checkpoint before final validation. Parent inspected actual files, ran the existing unittest (1 passed), obtained fresh read-only review (OK), and finished together without replay. Separate blocked fixture refused an unresolved owner decision: six core-file hashes unchanged, documents still backlog/open, no COMPLETE claim.
- Content worker updated three branch-specific backlog plans, timed out at its explicit 600000ms deadline, and its best-effort finishing steer missed. Parent captured the 44KB partial diff and resumed the SAME native run lineage only to collect a handoff. Fresh independent review OK; no phase replay/external-agent fallback or checkpoint-safety guarantee. Business templates/progress remained intact. Existing missing evaluation framework links were reported as pre-existing, not guessed/repaired.

### Scope, revisions and rollback

Canonical source commit `e2e58e1`; remote bootstrap commits `7a6686c7f1c727a3493092c528843bf39c368316` and `726eefe10424` (full SHA in melon-remote). Actual runtime helper SHA256 `80b53daac8e443e9a8d8bf4e30b0f5b8bfdde6ce44a035038836dd5ab739208f`, root-owned mode 0755. Restart inspection exposed the pre-existing default-provider overwrite; its original value was narrowly restored with a protected backup. Final settings equal pre-migration JSON minus only the obsolete exclusion; subagent bytes and 13 unrelated remote dirty-file hashes match.

Consumer checkout revisions are recorded together with scoped working-tree cutover fingerprints, rather than misrepresenting unpublished branches as pushed. Local Melon base `20e657078f82`, cutover diff prefix `3f8f0354c9fcea9e`; remote Melon base `8ae502b27b911bc57fe48a6c4d60809a930daf05`, exact runtime cutover inspected. Other local bases/digests: Discovery `52d583da93ee`/`1449e71c8b8ed2a6`; Posts staging `2e7313202159`/`f577566e9ecff603`; second production checkout `531ed239fcdd`/`f577566e9ecff603`; evaluation worktree `3f5107b26d20`/`37c71c88685ca832`; Motivation `d394375769eb`/`d79664419290e598`; its two worktrees `e897f58b7504`/`6227b2f54b7257cc`. Unrelated staged/unpublished product work was not committed/pushed/reset.

Evidence ledgers/logs: `/tmp/shared-work-migration/{local-consumers.jsonl,additional-local-consumers.jsonl,local-consumer-revisions.json,all-local-*-discovery.json,additional-local-*-discovery.json,blocked-events.jsonl,delegated-smoke-*.log,disposable-independent-review.md,backlog-independent-review.md,root-tests-final-*.log,crawl-serial-final.log,config-tests-final.log,pi-work-pack-final.log}`. Remote counterparts under `/workspace/.runtime/` include `remote-final-check.log`, `all-remote-pi-discovery.json`, `all-remote-codex-discovery-final.json`, current RPC event/results and active-reference audit. These are runtime evidence, not a new shipped workflow dependency.

Recoverability: local generic deletion tarballs/manifests under `/tmp/shared-work-migration/local-consumer-backups/`; branch-specific content backups under `backlog-reference-backups/`. Remote settings/config/deletions backed under `/data/shared-work-migration/`; additional five orphaned chains under `/workspace/.runtime/generic-chain-backups/`. Restore only reviewed owned paths and targeted settings, rolling back activation/links before re-exposing old copies to avoid duplicate discovery. Do not force-restore personal configuration. Active reference audits across policy, skills, presets/extensions and open backlog/work documents now return zero retired-resource hits. Current crawl edits and concurrently published `2a3088a` were explicitly kept outside this migration.

## Open Questions

None

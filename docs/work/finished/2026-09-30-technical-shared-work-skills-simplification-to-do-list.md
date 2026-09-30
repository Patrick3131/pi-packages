---
status: done
owner: engineering
last_reviewed: 2026-09-30
canonical_ref: none
---

# Shared work skills simplification To-Do

## Tasks

- [x] Inspect canonical and Melon skill differences, active generic-agent consumers, host discovery, and affected-install collision risks; preserve material project policy rather than copying workflow machinery (AC1, AC3, AC4).
- [x] Simplify the three canonical skills and align standing delegation policy: direct execution first, authorized bounded builtin delegation, concise handoffs, actual-state recovery, and existing completion gates (AC1, AC2).
- [x] Update packaging/discovery and narrow restore migration; publish only within granted authority, then verify local Pi, running melon-remote, and existing non-Pi discovery in a duplicate-free disposable setup before deleting Melon copies (AC1, AC4, AC6).
- [x] Inspect and back up remote /data/pi-agent/settings.json; update the installed Git package and remove only its obsolete pi-work skill exclusion. Do not assume paseo-update extensions or /reload migrates settings (AC6).
- [x] Remove Melon's duplicate generic skills, scripted flows, and orphaned phase agents; update live references without touching specialist skills, product code, permissions, or dirty tools.json (AC3).
- [x] Update the actual remote Melon consumer checkout to the verified cutover revision; reload/start a fresh session and prove all three canonical skills, shared resources, and /work work without local copies (AC6).
- [x] Complete focused tests and host smoke checks, record local/remote package and consumer revisions, and activate only within granted authority (AC4, AC5, AC6).

## Validation

- [x] Existing skill loading, sibling paths, /work injection, readiness, and lifecycle checks stay green.
- [x] Fresh and existing-settings restore fixtures activate canonical skills once and preserve unrelated filters/settings.
- [x] Local Pi in both repos, running melon-remote Pi, and the existing non-Pi host discover the same canonical generic skills with usable shared resources.
- [x] Corrected remote bootstrap policy works for fresh and persisted settings; verify with isolated fixtures or an approved restart. Network/bootstrap failure is not counted as installation success.
- [x] One small direct task and one authorized bounded delegation smoke demonstrate local commands, fresh handoffs, honest interrupted-work recovery, and completion evidence; use disposable work, not real product edits.
- [x] Audit active references for retired scripts/roles and confirm unrelated dirty files are unchanged.

## Docs

- [x] Document package-owned method versus repository-owned policy and machine preferences.
- [x] Document installation/update, non-Pi source links, collision-safe local/remote cutover, and rollback without duplicate maintained bodies; distinguish remote extension updates from persisted-settings migration.

## Completion

- [x] Every acceptance criterion is verified; missing required host evidence leaves the package open.
- [x] Test plan records coverage decisions and exact evidence.
- [x] Mark all three files done, update last_reviewed, and move together to docs/work/finished only after verification.

## Completion evidence

AC1–AC6 verified against actual source, installations and checkout state. See the test companion for commands, host evidence, revisions and rollback. Canonical publication `e2e58e1`; bootstrap/persisted-provider safeguards `7a6686c` → `726eefe`. Pi/Codex discovery: 76 local, 22 remote Pi, 9 remote Codex workspaces. Current remote planning/implementation, direct feature-owned execution, readiness refusal, bounded delegation/fresh review and checkpoint recovery passed. Consumer working-tree migrations preserve unrelated staged/unpublished branches; no broad consumer push or reset. All three package documents finish together.

This is a serial migration: shared source and discovery must work before consumer deletion and global activation. Do not parallelize writes across the source/cutover boundary.

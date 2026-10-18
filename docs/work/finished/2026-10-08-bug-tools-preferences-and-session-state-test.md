---
status: done
owner: engineering
last_reviewed: 2026-10-18
canonical_ref: none
---

# Predictable tools preferences and session state Test Plan

## Coverage Decision

Automated coverage required.

Reason: saved configuration loss, malformed-file destruction, lifecycle resets,
and abandoned-branch ownership are material persistence/state regressions.
Extend existing tests; do not test Pi's own execution engine with fake evidence.

## Risk Coverage

| Material failure risk | Existing coverage | Cheapest stable proof | Planned change |
|---|---|---|---|
| Read-only activity or smaller/restricted catalogs delete or flip preferences | test/tools/project-{config,persistence}.test.ts currently expects pruning | Existing extension harness with a shared temp file | Replace pruning contract with explicit-only writes; assert no delete/flip for restricted catalogs and sequential saves |
| Invalid config is overwritten | Parser rejection only in project-config.test.ts | Real temporary file through extension handlers | Check reads/save preserve bytes and report failure |
| Reload/resume resets session choice; late registration resets current choices | No adequate lifecycle coverage | Existing extension harness | Exercise fresh/restored lifecycle variants and late registration; assert session choices, not file bytes |
| Abandoned preset branch controls current state | test/tools/state.test.ts and test/presets/preset-state.test.ts use flat history | Existing branch-aware harness | Give getEntries and getBranch differing preset evidence; check both consumers |
| UI represents inaccessible or indirect tools as ordinary enabled/disabled | test/tools/format.test.ts tests old labels | Pure-format unit tests plus a handler-level toggle case | Extend format tests for exposure status; add a hidden-toggle rejection/readback case |

Paths in this table are relative to packages/pi-toolkit.

## Automated Cases

Five distinct regression groups justify exceeding the default three-case budget;
extend current files and parameterize variants rather than duplicate proof layers.

1. Shared-file persistence: reads, picker entry, non-TUI print, agent runs and
   session toggles never write/create defaults. Explicit sequential saves merge
   current non-hidden activation with unavailable saved preferences; different
   catalogs cannot delete or flip keys just by opening/running, including a
   restricted allowlist session. Check JSON.
2. Invalid-file safety: malformed JSON and non-boolean values remain byte-identical
   through reads and explicit save, with no partial/default application and a
   reported error. Missing-file behavior remains separately covered in group 1.
3. Lifecycle: fresh valid defaults apply, preset-owned tools win, existing-history
   startup and reload/resume/fork retain restored state, and late registration
   does not reset current session choices.
4. Branch ownership: current branch cleared/no preset wins despite an abandoned
   named-preset entry later in full history; current-branch active preset is
   restored/respected by both tools and presets.
5. Exposure and control rendering: table-driven format checks for direct,
   codemode/deferred, hidden, and saved-only status; a handler-level case proves
   a hidden tool toggle is rejected and read back as not accepted (AC5).

Atomic save error behavior should preserve the original valid file; cover this
within persistence checks using a deterministic failing operation when practical,
not filesystem timing races. Do not claim concurrent transaction isolation.

## Browser Or Manual Verification

No browser required. Use disposable project/config files, not Melon Labs defaults.

| Step | Expected result |
|---|---|
| Open /tools and /tools print before and after an unsaved toggle | Same disk bytes; active selection and status agree |
| Reload, then resume/fork a session with a changed loadout | Accepted session selection remains; fresh sessions use saved defaults |
| Inspect direct, codemode/deferred, and hidden registered tools | Indirect access is distinguished from direct activation; hidden cannot be enabled |
| Open another session with fewer registered tools, then save sequentially | Unavailable preferences remain; catalog is clearly process-local |
| Run a disposable project under a reduced allowlist (pi --tools read,bash), then reopen it normally | tools.json bytes unchanged; no preference deleted or flipped |
| Run an async subagent (for example an agent with a four-tool allowlist) in a disposable project that has preferences saved | The project's tools.json is unchanged; no preference is deleted or flipped |
| Change tool selection while Pi has an active request/tool | No cancellation or retroactive-request claim; subsequent request reflects selection |
| Save explicitly and start a fresh session | Saved direct activation is applied where registered; late registrations follow documented native semantics |

Only attempt harmless read-only tools for indirect-access checks. No production
MCP writes, purchases, security changes, or changes to live personal configuration.

## Commands

Run from /Users/patrick/Development/pi-packages:

```sh
npm test --workspace=packages/pi-toolkit
npm run typecheck --workspace=packages/pi-toolkit
git diff --check
```

## Acceptance Evidence

| Check | Result | Evidence |
|---|---|---|
| Pre-change toolkit suite | passed | Reused discussion investigation: 105 tests passed on 2026-10-08 |
| Pre-change targeted reproductions | passed as bug reproductions | Temporary harness showed preference loss, late-active/saved-false state, reload reset, malformed replacement |
| Pre-change MCP connection race (2026-10-16) | passed as bug reproduction | Real project-config module: session-start catalog pruned 17 mcp__ entries; post-connect catalog re-added them false; saved true for mcp__admin__admin_save_brief lost. Melon Labs tools.json mtime 23:57:20 vs session start 23:56:54 |
| Pre-change deferred MCP availability (2026-10-16) | verified observation | `pi mcp list --json` in Melon Labs: engagement 14 + admin 3 connected tools matching tools.json names; Pi 1.3.0 dist lists every registered definition regardless of exposure |
| Pre-change restricted-catalog flips (2026-10-16) | source-verified; no isolated live run recorded | `_refreshToolRegistry` filters definitions by --tools/--exclude-tools; Melon Labs history shows 9/20/19/9 true-count flips that correlate with session catalogs |
| Pre-change async-child prune (2026-10-18) | passed as bug reproduction | Disposable dir: fixture with 24 keys / 14 true became 6 keys / 4 true after one `async` reviewer child with that cwd; survivors were exactly its tools (find, grep, ls, read) |
| Pre-change async-child prune in this checkout (2026-10-18) | observed in place | pi-packages `.pi/tools.json` mtime coincided with an async reviewer child (cwd = pi-packages, tools find/grep/ls/read); content left exactly those four true |
| Melon Labs fingerprint (2026-10-18) | source- and data-verified | tools.json's nine true names equal the `web-researcher` agent's nine tools; 177 async child sessions ran with the repo as cwd |
| New persistence/invalid/lifecycle/branch regressions | passed | `npm test --workspace=packages/pi-toolkit`: 115 tests, 115 pass, 0 fail. New/extended: project-config (read states, overrides, merge, atomic write), project-persistence (no lifecycle writes, partial catalog, merge save, missing file, malformed, child session, declared loadout, preset owner, abandoned branch), format (exposure labels, hidden, unavailable list), state (declared loadout), presets (branch-local entry) |
| Toolkit typecheck and diff check | passed | `npm run typecheck --workspace=packages/pi-toolkit` clean; root `npm run typecheck` clean for every workspace |
| Real Pi exposure/lifecycle verification | passed (write behaviour), not manually exercised (picker UI) | Pi 1.3.0 with the working-tree extension in a disposable project: old code rewrote `.pi/tools.json` (deleted `crawl` + `some_removed_tool`, appended 6 names as false); fixed code left it byte-identical (sha256 unchanged). The interactive `/tools` picker was not opened in a real terminal |
| Full suite | passed | `npm test` at the repo root: exit 0, jest 217 passed / 3 skipped, every node workspace `fail 0` |

## Explicitly Not Testing

- Exact labels/copy, styling, snapshots, source structure, or compiler guarantees.
- Pi provider checkpoint internals, cache hit rates, or attribution of past costs.
- Cross-process locking/transaction isolation; no such guarantee is introduced.
- Duplicate access-control tests: this feature is not a permission boundary.
- Remote publication or changes to real user/project configs.

## Open Questions

None

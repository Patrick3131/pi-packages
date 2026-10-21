---
status: done
owner: engineering
last_reviewed: 2026-10-21
canonical_ref: none
---

# Tools picker: list only declared-switch tools and stop saving unenforceable decisions

## Type

technical

## Problem

`/tools` in a real project session lists every registered tool and gives each one
an on/off value, but for most MCP tools that value is not a decision Pi can honor:

- A project with two MCP servers at `exposure: "deferred"` registered 49 tools, 17
  of them `mcp__*`. Pi's exposure contract (`dist/core/extensions/types.d.ts:378-393`
  in `@earendil-works/pi-coding-agent` 1.3.0) says `codemode` and `deferred` tools
  stay callable from `codemode` and findable by `tool_search` whether or not they
  are active, and `hidden` tools are "registered but unreachable. Activating it has
  no effect."
- The picker hardcodes `currentValue: enabled | disabled` for every row
  (`src/features/tools/index.ts`, the `items` map in `showPicker`), so an inert
  row reads as a control. `/tools print` already reports the truth through
  `toolStatus()` (`inactive (indirect via deferred)`, `unavailable (hidden)` —
  `src/features/tools/format.ts`).
- `/tools save` therefore persists the inert decision: `savableToolNames()` returns
  every non-hidden registered tool and `mergeProjectTools` writes
  `active.has(name)` for each (`src/features/tools/project-config.ts`). One save
  with the MCP servers connected-but-inactive produced 17 `mcp__*: false` keys in
  this project's consumer `.pi/tools.json` (49 keys, 17 `mcp__*`, none `true`).
  That contradicts the feature's own rule, "Never append freshly registered names
  as `false`" (`src/features/tools/AGENTS.md`).

Result: 17 of 49 rows are noise, the value column misstates what a toggle does,
and `tools.json` accumulates claims that Pi cannot enforce — which is why the
same 17 tools keep looking "pruned but present".

## Outcome

`/tools` answers one question — what is declared to the model in this session —
and every row it shows is a switch Pi actually honors. `/tools save` records only
decisions Pi can enforce. `/tools print` keeps the complete catalog for diagnosis.

## Scope

### Included

- One shared predicate for "declaring this tool to the model is a real decision".
- The picker lists only those tools and states how many it withheld.
- `/tools save` writes only those tools' decisions.
- Feature tests, feature docs, and the package README sentence about `tools.json`.

### Excluded

- Changing exposure from `/tools`. Exposure is server/tool configuration
  (`.pi/mcp.json`, `/mcp`), file-persisted; `/tools` stays session-only.
  Verified: there is no exposure key in Pi's settings schema
  (`dist/core/settings-schema.js`), so a user-level override does not exist for
  non-MCP extension tools either.
- Pruning the 17 stale `mcp__*` keys already in a consumer `.pi/tools.json`. That
  is a one-time data edit in the consuming repository (melon-labs), not part of
  this package's diff; it is safe to do once this ships because saves stop
  re-adding them.
- `/mcp` behavior, resource tools, `tool_search` ranking, and preset resolution.
- Adding a picker mode that shows indirect/hidden tools (see `D4`).

## Implementation Notes

Verified in `/Users/patrick/Development/pi-packages` (HEAD `c79f661`, identical to
the live Git clone Pi loads for `/tools`):

- `src/features/tools/format.ts` already owns the exposure vocabulary
  (`INDIRECT_EXPOSURES`, `toolStatus`, `formatToolDetails`' `exposure:` line).
- `src/features/tools/index.ts` has the two write sites that need the predicate:
  the `items` map in `showPicker` and `savableToolNames()`.
- `src/features/tools/project-config.ts` `mergeProjectTools` needs no change; it
  writes exactly the names it is given and preserves every other key.
- `test/tools/project-persistence.test.ts:97` ("an explicit save records the
  current session set and preserves unknown keys") currently asserts the buggy
  behavior (`[mcpTool]: false`) and must be rewritten, not duplicated.
- `test/tools/tui-width.test.ts` pins `fitPickerLine` against the existing hint
  string; it stays green as long as the new footer line also goes through
  `fitPickerLine`.
- `test/tools/non-tui.test.ts` covers the non-TUI fallback to `/tools print`; its
  expectations must stay unchanged, which is the guard that the dump keeps the
  full catalog.

Predicate shape (name and home are `D2`/`D3`):

```ts
const DECLARED_SWITCH_EXPOSURES = new Set(["direct", "model-only"]);

export function isDeclaredSwitch(tool: ToolLike): boolean {
  return tool.exposure === undefined || DECLARED_SWITCH_EXPOSURES.has(tool.exposure);
}
```

Picker footer: one line through `fitPickerLine`, for example
`17 tools not listed · exposure is set in /mcp`, only when the count is above zero.

## Decisions and Assumptions

- `D1` Type is `technical`: this changes tool-inventory semantics and the save
  policy, not an end-to-end feature, page, or bug report. Rename the package if a
  reviewer prefers `feature`.
- `D2` The predicate lives in `format.ts` beside `INDIRECT_EXPOSURES` and is shared
  by picker and save. Both call sites already import that module; a new module for
  six lines would be churn. `state.ts` was rejected because this is not session
  state.
- `D3` Declared-switch membership is exactly `direct` + `model-only`, and an absent
  `exposure` counts as `direct` (Pi's registration default, and it keeps partial
  test fixtures meaningful). `model-only` stays included on purpose: turning
  `codemode` or `tool_search` off is enforced, so it is a real switch.
- `D4` The picker filters instead of grouping or adding a second mode. A
  `/tools all` escape hatch was rejected: it adds UI state for a case `/tools print`
  already serves. Withheld rows are summarized in one footer line.
- `D5` `/tools print` keeps the whole catalog, including `hidden` tools, because it
  is the diagnostic surface and the tool that explains why something is missing.
- `D6` A save writes only declared-switch tools and preserves every other key
  byte-for-byte; nothing is pruned. This keeps the existing invariant that a save
  from a smaller or filtered catalog cannot drop preferences it had no evidence to
  judge, and leaves the stale-key cleanup as an explicit consumer-repo edit.
- `D7` No version bump or changelog entry: the package is installed as a Git
  package, has no `CHANGELOG.md`, and repository guidance defines no release-note
  convention.
- `D8` One serial unit, no slices. The picker, the save policy, and their docs share
  `index.ts` and a single predicate, so there is no independently ownable path and
  parallel worktrees would only create merge conflicts.

## Files

- `packages/pi-toolkit/src/features/tools/format.ts` — add
  `DECLARED_SWITCH_EXPOSURES` and `isDeclaredSwitch()` with a comment tying them to
  Pi's exposure contract.
- `packages/pi-toolkit/src/features/tools/index.ts` — filter picker rows with the
  predicate, drop the now-unreachable `(unavailable)` label branch, add the footer
  line, and reuse the predicate in `savableToolNames()`.
- `packages/pi-toolkit/test/tools/format.test.ts` — boundary cases for
  `isDeclaredSwitch`.
- `packages/pi-toolkit/test/tools/project-persistence.test.ts` — exposure-aware
  fixture; replace the `[mcpTool]: false` expectation; add the mixed-exposure save
  case.
- `packages/pi-toolkit/src/features/tools/README.md` — status-reporting and command
  sections describe the filtered picker and the narrowed save scope.
- `packages/pi-toolkit/src/features/tools/AGENTS.md` — replace the implicit
  "save records the session" rule with the declared-switch scope.
- `packages/pi-toolkit/src/features/tools/CONTEXT.md` — align the Reporting and
  Writing paragraphs.
- `packages/pi-toolkit/README.md` — the `.pi/tools.json` sentence states what a
  save now records.

## Acceptance Criteria

- [x] In a session registering `direct`, `model-only`, `deferred`, `codemode`, and
      `hidden` tools, `/tools` lists only the `direct` and `model-only` ones.
- [x] The picker states how many tools it withheld, and that line fits the terminal
      width through `fitPickerLine`.
- [x] Every listed row still toggles the session set and is read back from
      `getActiveTools()`; a `hidden` tool can no longer be presented as switchable.
- [x] `/tools print` keeps the full catalog and still shows `inactive (indirect via
      deferred)` and `unavailable (hidden)` rows.
- [x] `/tools save` in a session with inactive `deferred`/`codemode` tools writes no
      entry for them, rewrites declared-switch tools to their current state, and
      preserves unknown keys, the malformed-file refusal, the child-session refusal,
      and the preset/loadout skip rules unchanged.
- [x] `npm run test --workspace=packages/pi-toolkit` and
      `npm run typecheck --workspace=packages/pi-toolkit` pass.

## Validation

Detailed cases are in the companion test plan. Summary: two new/updated automated
cases (predicate boundaries; mixed-exposure save), existing print/width/registration
suites stay green (117 tests), and picker/print verification against the real
component plus a real Pi process in melon-labs confirmed the filtered rows, the
withheld count, the save scope, and an unchanged catalog dump.

## Rollout

- Shipped as `2d3d393` on `main` in this repository.
- Local consumer `~/.pi/agent` and remote consumer `/data/pi-agent` (melon-remote
  Paseo host) were updated to `2d3d393` through `scripts/pi-sync.py
  --toolkit-only --apply`; the remote run reported its `PI_SYNC_RESULT` marker and
  the sync verified the installed revision.
- melon-labs dropped its 17 stale `mcp__*: false` keys (commit `c706192c4`); the
  other project `.pi/tools.json` files never carried any.
- Active sessions need `/reload` or a restart to pick up the new extension code.

## Open Questions
None

---
status: done
owner: engineering
last_reviewed: 2026-10-21
canonical_ref: none
---

# Tools picker: list only declared-switch tools and stop saving unenforceable decisions — To-Do

Single serial unit (`D8`): the picker filter, the save scope, and their
documentation share `index.ts` and one predicate, so there is no path an
independent slice could own.

## Tasks

- [x] Add `DECLARED_SWITCH_EXPOSURES` and `isDeclaredSwitch(tool)` to
      `src/features/tools/format.ts`, next to `INDIRECT_EXPOSURES`, with a comment
      stating Pi's exposure contract (`direct`/`model-only` are declared while
      active; `codemode`/`deferred` stay reachable indirectly; `hidden` cannot be
      activated). Treat an absent `exposure` as `direct`.
- [x] In `src/features/tools/index.ts`, build the picker `items` from
      `pickerTools = allTools.filter(isDeclaredSwitch)`, drop the
      `exposure === "hidden"` `(unavailable)` label branch, and keep `allTools` as
      the complete catalog for print.
- [x] Add the picker footer line with the withheld count (`N tools not listed ·
      exposure set in /mcp · see /tools print`) as a child rendered after the
      `SettingsList`; the whole component still goes through `fitPickerLine`, and
      nothing renders when the count is zero.
- [x] Reuse the predicate in `savableToolNames()` so a save writes only
      declared-switch decisions; `mergeProjectTools`, the atomic write, the
      malformed-file refusal, and unknown-key preservation are untouched.
- [x] Confirm the picker's toggle path is unchanged otherwise: `setActiveTools`,
      immediate read-back from `getActiveTools()`, and the `i` / `s` / hint
      handling still behave as today.

## Validation

- [x] `isDeclaredSwitch` boundary coverage in `test/tools/format.test.ts`.
- [x] Exposure-aware fixture and the mixed-exposure save case in
      `test/tools/project-persistence.test.ts`; the old `[mcpTool]: false`
      expectation is replaced, not kept beside the new one.
- [x] `npm run test --workspace=packages/pi-toolkit` passes (117 tests), including
      `tui-width.test.ts`, `non-tui.test.ts`, and `registration.test.ts` unchanged.
- [x] `npm run typecheck --workspace=packages/pi-toolkit` passes.
- [x] Picker check in a project with deferred MCP servers: the real picker
      component renders only declared-switch rows, reports `3 tools not listed` in
      a synthetic catalog and fits 80/40 columns, the toggle reads back from Pi,
      and a real Pi process in melon-labs lists 49 tools with 17
      `inactive (indirect via deferred)` in `/tools print` — exactly the 17 the
      picker withholds. The project `.pi/tools.json` cleanup kept saving free of
      `mcp__*` keys.

## Docs

- [x] `src/features/tools/README.md`: status-reporting section explains that the
      picker lists only declared-switch tools and where the rest are managed; the
      Commands and session tables note that a save covers those tools only.
- [x] `src/features/tools/AGENTS.md`: the save rule and the status rule now state
      the declared-switch scope, so the file and the code no longer disagree.
- [x] `src/features/tools/CONTEXT.md`: Reporting and Writing paragraphs aligned
      with the filtered picker and the narrowed write scope.
- [x] `packages/pi-toolkit/README.md`: the `.pi/tools.json` sentence states what a
      save now records.

## Completion

- [x] Every acceptance criterion is verified
- [x] The test plan records the coverage decision and evidence
- [x] All three files set to `done`, `last_reviewed` updated
- [x] Package moved to `docs/work/finished`

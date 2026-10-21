---
status: done
owner: engineering
last_reviewed: 2026-10-21
canonical_ref: none
---

# Tools picker: list only declared-switch tools and stop saving unenforceable decisions — Test Plan

## Coverage Decision

Automated coverage required

Reason: a save is the only writer of a durable, cross-session file, and a wrong
`false` entry actively disables a tool at the next session start. The predicate is
also the single gate that decides whether a real switch stays visible, so an
exposure misclassification silently removes a control rather than failing loudly.
Both risks are pure logic and provable at the unit layer. The picker's actual TUI
rendering has no headless harness in this package and is checked manually.

## Risk Coverage

| Material failure risk | Existing coverage | Cheapest stable proof | Planned change |
|---|---|---|---|
| A save writes `false` for `deferred`/`codemode` tools again (the regression that produced 17 stale keys) | `test/tools/project-persistence.test.ts:97` currently asserts the buggy behavior | unit (extension harness with a temp cwd) | update |
| Predicate misclassifies an exposure: a real switch is hidden (`model-only`), or an inert row returns (`deferred`/`codemode`/`hidden`) | none | unit | add |
| `/tools print` loses the full catalog while the picker narrows | `test/tools/format.test.ts` (`formatToolsDump` cases), `test/tools/non-tui.test.ts` | unit, existing | none |
| Session-start application of saved decisions still works (enable/disable/unmentioned/child/preset/loadout) | `test/tools/project-persistence.test.ts` (6 cases) | unit, existing | none |
| Picker width and the new footer line overflow a narrow terminal | `test/tools/tui-width.test.ts` covers `fitPickerLine` | unit, existing | none |
| Picker rendering, footer count, and read-back behavior in a real session | none | manual | manual only |

## Automated Cases

- `isDeclaredSwitch` returns true for `direct`, `model-only`, and an absent
  `exposure`; false for `codemode`, `deferred`, and `hidden`
  (`test/tools/format.test.ts`).
- A save in a session with an active `direct` tool and an inactive `deferred` tool
  writes only the `direct` decision; the `deferred` name gains no entry, and a
  pre-existing key for an unregistered tool survives
  (`test/tools/project-persistence.test.ts`, replacing the current
  `[mcpTool]: false` expectation and extending the fixture to carry per-tool
  exposure).

## Verification Runs

No interactive TUI was available on this host (no tmux), so the picker was driven
headlessly against the real extension factory: a stub `ui.custom` receives the
actual picker component, renders it, sends input, and reads back `setActiveTools`.
The same script was run twice — against the development checkout and against the
installed Git-package copy in `~/.pi/agent` (byte-identical, `diff -rq`). The
`/tools print` path was verified in a real Pi process with
`pi --mode rpc --no-session` in melon-labs, where both deferred MCP servers
connect.

| Check | Result | Evidence |
|---|---|---|
| Picker rows in a catalog of `direct`, `model-only`, `codemode`, `deferred`, `hidden` | passed | Rendered component listed only `read`, `bash`, `tool_search`; `crawl` and both `mcp__*` names absent |
| Withheld count and width | passed | Footer `3 tools not listed · exposure set in /mcp · see /tools print`; every line ≤ 80 and ≤ 40 columns |
| Toggle read-back | passed | Enter on `read` set the active set to `["tool_search"]` and the row re-rendered as `disabled` |
| Save scope through `/tools save` | passed | File written: `{"bash":false,"read":true,"tool_search":true}` — no entry for the `codemode`, `deferred`, or `hidden` tool |
| `/tools print` keeps the catalog | passed | Real Pi process in melon-labs: 49 tools, 19 `enabled`, 13 `disabled`, 17 `inactive (indirect via deferred)` including all 17 `mcp__*` rows |
| Picker withholds exactly those 17 | passed | 49 registered − 32 declared-switch rows = the 17 the footer reports; melon-labs `.pi/tools.json` now holds the same 32 decisions |

## Commands

```sh
npm run test --workspace=packages/pi-toolkit
npm run typecheck --workspace=packages/pi-toolkit
```

## Acceptance Evidence

| Check | Result | Evidence |
|---|---|---|
| Predicate boundary unit case | passed | `test/tools/format.test.ts`, 117/117 package tests pass |
| Mixed-exposure save unit case | passed | `test/tools/project-persistence.test.ts` (`a save writes only decisions Pi enforces`) |
| Package test suite | passed | `npm run test --workspace=packages/pi-toolkit` — 117 pass, 0 fail |
| Package typecheck | passed | `npm run typecheck --workspace=packages/pi-toolkit` — clean |
| Picker/print/save verification | passed | Verification Runs table above |

## Explicitly Not Testing

- `SettingsList`, `Container`, and theme rendering: framework behavior, already
  exercised indirectly by `tui-width.test.ts`.
- The exact footer copy: ordinary copy, not a contract.
- `mergeProjectTools` and `writeProjectToolsConfig` again: existing
  `project-config.test.ts` already covers merge and atomic write.
- Session-start application rules again: the six existing persistence cases cover
  enable, disable, unmentioned, partial catalog, child session, preset, and loadout
  ownership.
- `/mcp` exposure editing and `tool_search` ranking: owned by Pi, not this package.

## Open Questions

None

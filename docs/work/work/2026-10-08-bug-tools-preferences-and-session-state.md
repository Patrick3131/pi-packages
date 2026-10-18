---
status: backlog
owner: engineering
last_reviewed: 2026-10-18
canonical_ref: none
---

# Predictable tools preferences and session state

## Type

bug

## Problem

The tools feature rewrites project defaults from each process's live catalog.
Concurrent sessions and background MCP registration can erase valid preferences.
Sessions with a restricted or not-yet-complete catalog delete names they cannot
see; those names register again later and are appended as false. The picker also
calls inactive tools "disabled" even when Pi permits indirect calls, and reload
reapplies defaults over session choices.

## Outcome

/tools is a small, honest session loadout selector. Project preferences change
only on explicit save, unavailable preferences survive, and a partial or
restricted catalog can never delete or flip them. Reload/resume preserve session
choices. Keep the existing boolean JSON format and commands.

## Scope

### Included

- Explicit-only, atomic project preference saves; preserve unavailable names,
  including names missing from a restricted or still-connecting catalog.
- Preserve malformed config and report actionable errors.
- Separate active declarations from indirect availability and hidden tools.
- Fresh-session defaults without overriding restored loadouts or presets.
- Branch-local preset ownership and regression coverage.
- Update tools documentation and local policy alongside behavior.

### Excluded

- A permissions engine, hard tool-call blocking, or changed Pi/MCP exposure.
- Core Pi changes, a new config schema, file watchers, locks, or migrations.
- Tool installation, automatic removal of old preferences, a new cleanup command.
- Cache telemetry, cost attribution, remote rollout, or changes to live user config.

## Implementation Notes

Planning checkout: /Users/patrick/Development/pi-packages, main at f76e5ce;
working tree was clean before this package. One serial writer: persistence,
lifecycle, and picker state are coupled, so no parallel slices.

Reused evidence from this discussion's direct investigation:
- src/features/tools/index.ts under packages/pi-toolkit reconciles and writes at
  session_start, before_agent_start, and terminal picker open; non-TUI print does not.
- src/features/tools/project-config.ts prunes unknown names, adds names as false,
  treats parse errors as missing, and uses direct writeFileSync.
- src/features/tools/format.ts labels membership in the active set as enabled/disabled.
- Direct temporary-directory reproductions confirmed preference loss across two
  catalogs, late-active/saved-false divergence, reload resets, and malformed-file
  replacement. These were harness checks, not end-to-end Pi tests.
- Installed Pi docs/extensions.md and dist/core/agent-session.js under
  /opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent confirm inactive
  codemode/deferred tools remain callable and hidden activation is ignored.
- Existing toolkit suite passed 105 tests before planning; it does not establish
  correctness for the new contract.

Newly checked for this package:
- docs/work/{AGENTS.md,CONTEXT.md} mandates the three-file open package here.
- packages/pi-toolkit/src/features/tools/AGENTS.md currently mandates automatic
  reconciliation: explicitly update this policy as part of the approved fix.
- packages/pi-toolkit/src/features/presets/index.ts and tools/index.ts use
  getEntries for preset detection; use getBranch in both.
- Installed SessionStartEvent distinguishes startup/new/resume/fork/reload.
  Startup can load existing history: do not classify freshness by reason alone.
- packages/pi-toolkit/package.json provides test/typecheck, not a build script.
  The package supports Pi >=0.99.1; avoid an unnecessary minimum-version bump.

Rechecked 2026-10-16 against the installed Pi 1.3.0 bundle and the reported
"preferences flip to false" symptom:
- Deferred MCP tools are registered and indirectly reachable once their server
  has connected, not unavailable. `pi mcp list --json` in
  /Users/patrick/Development/melon-labs shows both servers connected and offering
  exactly the 17 mcp__ names in that project's tools.json. MCP registerTools calls
  pi.registerTool per tool from connection data (dist/extensions/mcp/index.js);
  getAllTools returns every definition without filtering exposure
  (dist/core/agent-session.js). While a server is still connecting or has failed,
  its names are absent from the catalog; that is the window the write cycle below
  writes through. Toggling one in /tools declares it to the model; leaving it
  false does not make it unreachable (tool_search and codemode scripts still
  reach it).
- Dropped tools cannot be pruned in-session. Pi has no unregister API; the MCP
  extension re-registers withdrawn tools with hidden exposure, so they stay in
  getAllTools and the current reconcile keeps them.
- Reproduced the write cycle with the real project-config module: a session-start
  catalog without mcp__ names pruned 17 entries and wrote; the post-connection
  catalog re-added them as false. A saved true for mcp__admin__admin_save_brief
  became false. Melon Labs tools.json mtime 2026-10-15 23:57:20 versus session
  start 23:56:54 corroborates the before_agent_start re-add write.
- Registry filtering explains other flips. --tools/--exclude-tools filter
  _toolDefinitions in _refreshToolRegistry (dist/core/agent-session.js), so a
  restricted session sees a smaller catalog; reconcile deletes names it cannot
  see and later sessions append them as false. Melon Labs history shows
  9/20/19/9 true-count flips; sessions there declare 20 tools (file trues 19 plus
  subagents_enable) on 2026-10-13 and 14 (file trues 9 plus grep/find/ls/
  tool_search/subagents_enable) from 2026-10-14 17:58, consistent with catalog
  differences plus native activation, not deliberate saves.
- The picker ignores exposure metadata; packages/pi-toolkit/src/features/overview/
  collect.ts already maps exposure to reachability facts. The tools picker should
  mirror those semantics; the mapping is inline there, so no overview file change
  is required.
- state.ts resolveEnabledTools has no production caller; applyProjectDefaults
  uses enabledProjectToolNames instead.
- MCP ensureDiscoveryActive activates tool_search/codemode from configuration at
  session_start; tools applyProjectDefaults then calls setActiveTools from
  tools.json. Both run in the same event, so a saved false tool_search can
  deactivate the reachability MCP just enabled.

Rechecked 2026-10-18 — dominant cause identified and reproduced: async
subagent children prune the repo's tools.json.
- A background (`async: true`) subagent runs in a detached runner with
  host "runner", so pi-subagents loads ambient extensions
  (`ambientExtensions = host === "runner" && !disableAmbientExtensions`;
  `noExtensions: !launch.ambientExtensions` in DefaultResourceLoader), keeps the
  parent cwd, and applies the agent's tool list as the session allowlist
  (`session.tools = toolPlan.effectiveToolAllowlist`). Pi then filters the child's
  registry by that allowlist (`_isAllowedTool` / `_refreshToolRegistry`), so the
  child's getAllTools returns only its own tools. The /tools extension is loaded
  in that child, and its before_agent_start reconcile then deletes every name the
  child cannot see from <cwd>/.pi/tools.json.
- Reproduced end to end in a disposable directory: a fixture with 24 keys and 14
  true values became 6 keys with 4 true values after one async reviewer child ran
  with that directory as cwd; the survivors were exactly the child's tools
  (find, grep, ls, read). Nothing else ran in that directory.
- Same signature in this checkout: .pi/tools.json was rewritten while an async
  reviewer child (cwd = pi-packages, declared tools find/grep/ls/read) was
  running, leaving exactly those four true.
- Explains the reported symptom at scale in Melon Labs: tools.json holds nine true
  names (bash, codemode, crawl, crawl_read, fffind, ffgrep, read,
  web_search_searxng, write), which is exactly the `web-researcher` agent's nine
  tools, with all other names false; 177 async child sessions ran with that repo
  as cwd. Children prune to their own catalog, and the parent's next turn
  re-adds the missing names as false — every earlier preference becomes false
  without the user changing anything.
- Foreground children are unaffected: for host "parent" ambient extensions are
  not loaded, so /tools is not present in those sessions.
- Trigger belongs to pi-subagents; the fix belongs to pi-toolkit, which must never
  write on a catalog it cannot prove complete (D8, D9).

## Decisions and Assumptions

- D1: No automatic writes, including first-run file creation. Missing config
  leaves Pi's native selection alone until explicit save. Reading defaults is
  allowed; printing/opening the picker never mutates disk.
- D2: Explicit save reads the latest valid file, preserves keys absent from this
  catalog, and updates known, non-hidden tools from Pi's actual active set.
  Hidden entries keep any saved preference but cannot be toggled on. Do not
  automatically clean unavailable entries. Use a same-directory temporary file
  and rename; no new dependency. Same-key saves are last-writer-wins. Atomic
  replacement is not a cross-process merge guarantee; locking is out of scope.
- D3: Invalid existing config is distinct from missing config. Notify and leave
  native/restored session state and original bytes intact; explicit save refuses
  to overwrite invalid data until the user fixes or removes it.
- D4: Apply saved defaults only to genuinely fresh sessions, unless a preset owns
  the selection. Preserve host-restored state on resume/fork/reload, including
  startup with existing session history. No per-turn reapplication. Late tools
  follow native registration/exposure behavior for this session; saved defaults
  apply when present at fresh-session initialization, not as a runtime denylist.
- D5: Keep toggles as activation/deactivation, not access controls. Show exposure,
  direct-active status, and indirect callability using Pi metadata; label hidden
  tools unavailable and omit/disable their toggle. Read back actual active state
  after changing it. Report saved-only names separately as unavailable, without
  inserting fake registered tools. Treat absent optional metadata as unknown.
- D6: Keep /tools, /tools print, /tools save, picker shortcuts, and preset-state
  format. A save under a preset is still an explicit user choice. Read ownership
  and preset restoration from the current branch only.
- D7: Changing tools affects subsequent requests, not already-sent requests or
  cancellation of running calls. Document indirect exposure and possible cache
  effects without promising cache preservation.
- D8: Registry membership is not availability. A session catalog can be missing
  names because of a restricted allowlist, a still-connecting MCP server, or a
  failed extension load. Missing names are unknown, never evidence of removal;
  no automatic path may delete or flip them. Deliberate cleanup of genuinely
  obsolete names stays out of scope (D2, Excluded).
- D9: Keep the fix in pi-toolkit: no automatic write may rely on the session
  catalog being complete. Async subagent children are the main way a filtered
  catalog appears, but the extension must not assume which process wrote it.
  Changing pi-subagents' child extension loading or cwd is out of scope.

## Files

All paths below are relative to the planning checkout.

- packages/pi-toolkit/src/features/tools/{index.ts,project-config.ts,state.ts,format.ts} — persistence, lifecycle, accurate status.
- packages/pi-toolkit/src/features/presets/index.ts — branch-local preset restoration.
- packages/pi-toolkit/test/tools/{project-config,project-persistence,non-tui,state,format}.test.ts — adapt existing risk coverage.
- packages/pi-toolkit/test/presets/preset-state.test.ts — active-branch regression.
- packages/pi-toolkit/src/features/tools/{AGENTS.md,CONTEXT.md,README.md} — replace reconciliation policy and document the contract.
- packages/pi-toolkit/src/features/presets/CONTEXT.md — document branch-local restoration.
- packages/pi-toolkit/README.md — user-facing defaults and session semantics.

## Acceptance Criteria

- [ ] AC1: Startup, agent runs, picker open/toggles, and printing leave tools.json
  unchanged, or absent if missing; explicit save is the only write path.
- [ ] AC2: With different session catalogs, read-only activity preserves all saved
  preferences. A sequential save from a smaller catalog preserves unavailable
  keys and updates only current non-hidden tools. Output remains valid boolean
  JSON after atomic replacement.
- [ ] AC3: Invalid config survives reads and explicit save byte-for-byte, with an
  actionable warning/error instead of replacement or default application.
- [ ] AC4: Fresh sessions honor valid defaults without overriding a preset;
  reload/resume/fork and startup with restored history preserve session loadouts.
  Late registration does not write disk or silently reapply defaults.
- [ ] AC5: Picker/print distinguish direct activation, indirect access, hidden
  state, and saved-only unavailable names. Hidden tools cannot be presented as
  successfully activated; toggle status reflects Pi's accepted state.
- [ ] AC6: An abandoned branch's preset entry cannot control tools or preset
  restoration on the current branch.
- [ ] AC7: Updated policy/docs explain explicit saves, unavailable preference
  retention, fresh/restored session behavior, exposure, and mid-run limitations;
  toolkit tests and typecheck pass.
- [ ] AC8: A session with a restricted or incomplete catalog (--tools/
  --exclude-tools, MCP servers still connecting, a failed extension load) cannot
  delete or flip saved preferences; read-only lifecycle paths leave the file
  byte-identical.

## Validation

Extend the existing harness tests for persistence and lifecycle risks; use a
real Pi manual check for exposure and reload behavior. Include a restricted
catalog (as with --tools) and a late MCP-style connection. Detailed cases and
commands are in the companion test plan. Do not claim host execution semantics
are proven by a mocked API.

## Open Questions

None

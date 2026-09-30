---
status: done
owner: engineering
last_reviewed: 2026-09-30
canonical_ref: none
---

# Web researcher crawl-specialist handoffs Test Plan

## Coverage Decision

No automated test needed for new Markdown guidance. Existing coverage is sufficient for installation/protection behaviour.

Reason: this is descriptive agent guidance, not new tools or executable routing. Tests freezing exact wording would be low-value. Actual role-contract review and unchanged frontmatter prove the intended boundary; restore regressions cover preservation/idempotence.

## Risk Coverage

| Material failure risk | Existing coverage | Cheapest stable proof | Planned change |
|---|---|---|---|
| False specialist capabilities or implicit nested delegation | Source role contracts and explicit current tools | Fresh source review plus parent frontmatter comparison | Markdown only |
| Overwriting personal settings/variants on activation | configs/global/restore.test.mjs agents-only tests | Existing test:configs and targeted byte/discovery checks | None |
| Wrong requested model or thinking | Native subagent metadata/session headers | Inspect both child records after completion | No model default edits |

## Automated Cases

None added. Reuse configs/global/restore.test.mjs and other existing config tests.

## Browser Or Manual Verification

| Step | Expected result |
|---|---|
| Compare descriptions with package agent definitions | Exact role boundaries; extract is interpretation, no JS guarantee |
| Compare agent frontmatter to /tmp/web-researcher-specialists/web-researcher.before.md | Byte-identical tools, model/authority/context fields |
| Inspect proposed handoff | Specific role/question/output, URLs/saved paths, bounds, prior evidence and unresolved gap; parent verifies availability/authorization |
| Install only an expected-before global definition | Updated bytes match source, personal JSON/config bytes unchanged; different variants retained |
| Native discoverAgentsAll in local/remote Pi | One user web-researcher, existing role source preserved |
| Inspect delegated child metadata | opencode-go/deepseek-v4.1-flash, thinking max, fresh reviewer |

## Commands

```sh
npm run test:configs
bash -n configs/global/restore.sh
git diff --check -- configs/global docs/work/work/2026-09-30-technical-web-researcher-crawl-handoffs.md docs/work/work/2026-09-30-technical-web-researcher-crawl-handoffs-to-do-list.md docs/work/work/2026-09-30-technical-web-researcher-crawl-handoffs-test.md
configs/global/restore.sh --agents-only --force
node /tmp/shared-work-migration/check-global-researcher.mjs /Users/patrick/Development/pi-packages
```

Force is only allowed after verifying current installed file equals the saved expected-before source, with automatic backup. Remote uses the same reviewed installer and PI_CODING_AGENT_DIR=/data/pi-agent. No whole-snapshot force.

## Explicitly Not Testing

- No exact-copy/prose snapshots, live web searches/crawls, paid research delegation or fabricated behavioural benchmark.
- No crawl transport, JS rendering, restored historic roles, unrelated product tests or model configuration changes.

## Execution Evidence

- Worker `b5b29133-c627-4047-b517-4c0d3a9de2d3` and fresh reviewer `b896820b-adfc-4f5e-ac38-b2205d32c3b9` completed in native workflow `d6f88bf7-3ecc-43d6-95b3-87688ca4d785`. Both actual session headers record provider `opencode-go`, model `deepseek-v4.1-flash`, thinking `max`; no global model settings changed.
- Source edits: only agent guidance and its config README. Frontmatter byte-identical to expected-before source. Native discovery confirms each crawl4ai role once and no `subagent` tool in the researcher.
- Fresh review: OK with notes. All three P2 notes accepted: saved-path availability qualifier, explicit saved-path passing/reuse, and prohibition of bash/CLI agent launches. Parent additionally clarified that only a separable slice benefiting from specialist work warrants a recommendation; routine reads remain direct. Parent rechecked the affected contracts/authority after these narrow edits.
- `npm run test:configs`: 17/17 passed, repeated after final wording changes. `bash -n configs/global/restore.sh`, scoped `git diff --check`, and direct whitespace checks on untracked work docs passed. No new automated cases/prose snapshots or network research.
- Guarded agents-only activation verified expected-before bytes, backed up the old definition, and installed the reviewed source locally and remotely. Final SHA256 in all three locations: `46df3754be3bee66a501119cd59df4e45b2e77601e530ccdd6bf649b437e3045`. Hashes of personal settings/auth/models/presets/subagent configuration are unchanged.
- Actual local and remote native `discoverAgentsAll` checks resolve the user web-researcher once in Pi Packages and remote Melon Labs. Remote success captured from authenticated Paseo terminal `4845b041-0f4b-4ba3-add5-17bc60869a2d`. Initial capture assertion failed only because the terminal wrapped the SHA across lines; joined-line recheck passed. No activation failure was hidden.
- Local backup: `~/.pi/agent/agents/web-researcher.md.bak.20260930-220125`; remote backup: `/data/pi-agent/agents/web-researcher.md.bak.20260930-200133`. Different project variants were not changed.
- Logs/reports: `/tmp/web-researcher-specialists/{worker.md,review.md,config-tests-final.log,remote-activation-capture.json,workflow.md}`; native child metadata/session headers retain requested/effective model/thinking evidence.
- Plan checkpoint and implementation commit/push skipped: not authorized by this request. Source and finished work package remain working-tree changes; local/remote global activation is complete. No full snapshot restore, added permissions, restored phase roles, provider changes or unrelated-code edits.

## Open Questions

None

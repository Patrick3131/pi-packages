---
status: done
owner: engineering
last_reviewed: 2026-10-22
canonical_ref: none
---

# Global Crawl4AI configuration validation

## Risks and checks

1. Credential exposure or loss: extend existing pi-sync fixture for target-local token resolution/preservation, missing-token refusal, redacted preview and private installed/backup modes. Never use real credentials in fixtures.
2. Persistence/config drift: retain existing check-before-apply, revision, backup and idempotence coverage; verify only reviewed Crawl4AI config changes at both live preflights.
3. Wrong runtime config: validate actual Pi loader registration and authenticated ordinary acquisition from a temporary non-project cwd locally and on melon-remote. Confirm the remote agent-directory lookup before changing it; add a focused loader regression only if a real mismatch is found.

Existing npm test/test:configs cover shared behavior. Check documentation links and whitespace. No new tests for prose/JSON shape or duplicated provider/parser contracts.

## Evidence

Full repository npm test passed; 11 pi-sync cases and six restore cases passed, including target-local credentials, redacted diffs, preservation under --force, private file/backup modes and idempotence. Final credential-backup creation uses 0600 from first creation rather than tightening permissions after copying.

Published implementation/source: ed5ee17d00e126e3f6f0726c30560c62fb0b3dae. Both live preflights showed exactly one shared config addition and no unrelated drift. Verified apply updated local and /data/pi-agent installed packages/config to that revision. Repeat check reports zero config changes at both targets; all temporary disabled tasks completed with matching markers and were removed.

Local config: ~/.pi/agent/extensions/crawl4ai.json. Remote config: /data/pi-agent/extensions/crawl4ai.json; the remote home-directory alias resolves to the same directory, so no lookup code change was required. Native Pi loaders on both hosts registered crawl, crawl_read and crawl_interact from an empty temporary cwd. With CRAWL4AI_API_TOKEN removed from the probe environment, actual authenticated acquisition through the deployed service passed using each private 0600 installed config. Probe artifacts were removed.

Melon Labs production commit 240f155f814dc3ac6edc30b4e14fe9206c1bdbe2 removes its project override and updates guidance. Direct config lookup from the real repository cwd selects the global file with acquisition/interaction enabled. Relative output/retention were preserved; the ignored legacy tokenBudget block was omitted. Unrelated user edits and settings were retained. Active sessions need restart/reload to pick up changed installed resources; sessions were not interrupted.

## Open Questions

None

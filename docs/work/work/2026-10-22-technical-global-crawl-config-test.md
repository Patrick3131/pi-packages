---
status: in_progress
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

Pending implementation and live sync. Remote credential is already available in its environment; neither target has a global crawl config. Local existing shared config drift is empty. All Dokploy probes use disabled temporary tasks with verified completion/removal.

## Open Questions

None

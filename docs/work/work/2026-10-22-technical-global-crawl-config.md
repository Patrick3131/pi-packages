---
status: in_progress
owner: engineering
last_reviewed: 2026-10-22
canonical_ref: none
---

# Shared global Pi Crawl4AI configuration

Move the existing Melon Labs Pi service configuration to each machine's global Pi extensions directory and retain its sanitized backup in pi-packages. Update local Pi and melon-remote through the existing verified Dokploy pi-sync path, then remove the Melon project override.

## Scope and decisions

- D1 Preserve the configured service, relative output directory, retention and enabled acquisition/interaction capabilities. Drop the obsolete ignored tokenBudget block.
- D2 Snapshot uses an environment placeholder. Sync materializes a private installed credential from the target environment or preserves an existing literal credential. Never print or commit its value; protect installed files/backups with mode 0600.
- D3 Use full sync only if both preflights show no unrelated drift; otherwise narrow the operation before applying. Keep model/preset/session/auth preferences intact. No workspace scanning, SSH/sudo or automatic session restarts.
- D4 Project config remains an optional override, but Melon Labs should inherit the shared global configuration. Saved output stays relative to each tool working directory.

## Acceptance

- [ ] AC1 Global config and sanitized restore/sync snapshot exist; secret handling is redacted, private and idempotent.
- [ ] AC2 Actual local and remote Pi load all three crawl tools from global configuration without a project config; authenticated read acquisition works.
- [ ] AC3 Melon project override is removed, guidance is current, changes committed/pushed and temporary operation tasks removed.

## Open Questions

None

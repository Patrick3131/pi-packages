---
status: in_progress
owner: engineering
last_reviewed: 2026-10-22
canonical_ref: none
---

# Global Crawl4AI configuration checklist

One serial unit: snapshot/sync contract, target activation, then consumer override removal.

- [ ] Add sanitized snapshot, restore mapping and credential-safe sync handling.
- [ ] Extend existing sync risk cases; verify global config lookup on remote's actual agent directory.
- [ ] Publish on main, check both targets, apply only reviewed changes and verify terminal operation logs.
- [ ] Verify authenticated global acquisition and native tool registration locally/remotely.
- [ ] Remove Melon project override, update documentation, commit/push and complete all three documents.

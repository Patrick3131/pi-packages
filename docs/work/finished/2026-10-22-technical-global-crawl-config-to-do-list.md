---
status: done
owner: engineering
last_reviewed: 2026-10-22
canonical_ref: none
---

# Global Crawl4AI configuration checklist

One serial unit: snapshot/sync contract, target activation, then consumer override removal.

- [x] Add sanitized snapshot, restore mapping and credential-safe sync handling.
- [x] Extend existing sync risk cases; verify global config lookup on remote's actual agent directory.
- [x] Publish on main, check both targets, apply only reviewed changes and verify terminal operation logs.
- [x] Verify authenticated global acquisition and native tool registration locally/remotely.
- [x] Remove Melon project override, update documentation, commit/push and complete all three documents.

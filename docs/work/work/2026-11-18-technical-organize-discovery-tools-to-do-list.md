---
status: backlog
owner: engineering
last_reviewed: 2026-11-18
canonical_ref: 2026-11-18-technical-organize-discovery-tools.md
---

# Organize discovery tools by capability

One serial work item. The feature moves and the two entry points share import changes.

## Tasks

- [ ] Inventory existing source-path references, public JS and type exports, and Pi registration order. Record the baseline before moving files.
- [ ] Group implementation and Pi registration by capability. Update the extension entry point, the root research exports, and test imports together.
- [ ] Run the Discovery tests, workspace typecheck, and existing configuration checks. Compare the before and after export surfaces and verify the packed import in a clean consumer.

## Docs

- [ ] Update the Discovery architecture and package notes where they name moved files. Document the import path for consumers and the Pi registration boundary.

## Completion

- [ ] Record verification in the test companion and confirm the primary acceptance criteria.
- [ ] Mark the three documents done and move them together after implementation and verification.

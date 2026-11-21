---
status: done
owner: engineering
last_reviewed: 2026-11-21
canonical_ref: none
---

# Implementation checklist

1. Capture current tool registrations, public research exports, preset selections and representative provider responses. Confirm deployed cursor behavior for Meta domain resolution.
2. Add the documented TypeBox input and output schemas, pre-dispatch validation, and one registrar. Reuse existing transport and formatters. Fix the LinkedIn client’s payer/account-owner cursor restriction and add published targeting disclosures to its typed output.
3. Build next_request and consistent result text. Remove the old registrations and descriptors; keep the provider clients.
4. Run the companion checks and update the package README with a Meta domain example and a LinkedIn advertiser-name example.
5. On release, publish the versioned package, update Melon Labs’ exact dependency and lockfile, migrate its applicable presets, tools and subagent allowlists, and update local Pi. Verify from fresh Pi sessions after replacing the old names.

The package contract precedes consumer migration. Keep package and Melon Labs changes in their respective repositories.

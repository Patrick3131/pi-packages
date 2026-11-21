---
status: done
owner: engineering
last_reviewed: 2026-11-21
canonical_ref: none
---

# Verification

| Production risk | Cheapest proof |
| --- | --- |
| The agent guesses a selector or dispatches to the wrong route | Table-driven registered-tool test with injected fetch. Exercise all three existing Meta entry paths (keyword, domain and direct page_id), LinkedIn account owner alone, and LinkedIn keyword. Assert that the Meta body matches the legacy tool for the same arguments, including active_only=false, country, max_ads and timeout_ms. Reject mixed selectors and cross-platform options with an actionable correction and zero calls. |
| Continuation loses filters, rejects payer-only searches, or silently restarts | Round-trip emitted next_request through the same tool against a two-page fake. Check route, selector, filters, cursor, dropped count and absence of continuation on completion. Exercise both resumable Meta selectors (keyword and page_id). Reject domain plus cursor. Cover the Meta domain cursor contract observed during implementation. |
| Model and codemode receive inconsistent or lossy evidence | Check structuredContent against outputSchema for success, partial, ambiguous and error results. Check model text for cap adjustment, continuation and partial flags. Preserve disclosure inclusion/exclusion wording and bounded previews. Extend existing registration, abort and compatibility tests where applicable. |

Reuse the existing Meta fixtures through the unified registration. Verify that a keyword result exposes a reusable advertiser page_id, an ambiguous domain returns candidates and a page_id retry hint, and a not_found domain remains a normal lookup outcome. Compare the full ads and advertiser rollups, including landing links, media/cards, representative-card provenance and truncation flags. Check that only the unified name is registered.

Run the Discovery workspace tests and typecheck, config tests and research bundle build. Smoke-test the packed research export from a clean consumer. Keep provider traffic out of CI.

In a fresh local Pi research session inspect the tool schema and active names. Search Meta by domain and LinkedIn by advertiser name against the deployed API. Resume a paginated result using exactly the returned arguments. Check a LinkedIn transparency request separately and confirm ordinary searches omit detail fetching. Verify Melon Labs presets and its resolved dependency after migration. Use existing transport coverage for retries, timeouts and sanitization.

## Release verification

Version 0.2.0 passed the release workflow, including the full workspace tests,
typecheck, research build, packing, publication and public registry check.
The Discovery suite passed 141 tests with seven opt-in live cases skipped.
Separate live checks from the installed Pi runtime returned 10 Meta keyword
ads and 10 on continuation, and 24 LinkedIn advertiser ads and 24 on
continuation. Both used the emitted next_request verbatim. The Meta domain
check returned ambiguity candidates. A LinkedIn transparency request fetched
24 details. Both Melon Labs research presets exposed only ad_library. Melon
Labs pinned and verified the published package in commit f767f7b47.

---
status: backlog
owner: engineering
last_reviewed: 2026-11-21
canonical_ref: none
---

# One Ad Library tool for Pi

## Outcome

Offer one discoverable tool, `ad_library`, for searching Meta or LinkedIn. Its description is “Search Meta or LinkedIn ads by keyword or advertiser to find ad copy, creatives, and advertiser details.” One call searches one platform. Discovery already owns the two HTTP routes. This work changes the Pi interface and its consumers.

## Input contract

Follow the installed Reddit tool’s single top-level TypeBox object. Require `platform`, reject unknown properties, and identify the platform in each platform-specific field description. Enforce selector combinations before any fetch. A static Pi schema shows both platforms’ fields. Short descriptions and specific validation errors guide the first call.

| Field | Model-facing guidance |
| --- | --- |
| platform | Choose meta or linkedin. |
| keyword | Search either library by topic or phrase. |
| page_id | Numeric advertiser page ID on the selected platform, as a string. |
| domain | Meta only. Find an advertiser by website hostname. |
| active_only | Meta only. Limit results to active ads. Defaults to true. |
| account_owner | LinkedIn only. Advertiser account name, for example Microsoft. |
| linkedin_url | LinkedIn only. Company page URL or slug for a known advertiser. |
| payer | LinkedIn only. Find or filter ads by the entity paying for them. |
| date_option | LinkedIn only. Choose last-30-days, current-month, current-year, last-year or custom-date-range. |
| start_date, end_date | LinkedIn custom date range. Supply both as YYYY-MM-DD, at most 364 days inclusive, ending before today. |
| sort | LinkedIn only. Newest or oldest first, default newest. |
| include_transparency | LinkedIn only. Fetch detail pages for payer, run dates, impression estimates and available targeting disclosures. Defaults to false. |
| country | Two-letter lookup country, default US. LinkedIn also accepts ALL. |
| max_ads | Integer 1–300. When omitted the unified tool sends 10 for Meta and 24 for LinkedIn. Meta raises values below 10 to 10. LinkedIn raises values below 24 to 24. |
| timeout_ms | Server time budget, 5000–180000 milliseconds, default 120000. |
| cursor | Continue a previous search by passing its next_request unchanged. |

Meta requires exactly one of keyword, domain or page_id. LinkedIn allows at most one of keyword, page_id or linkedin_url. Payer and account_owner also work alone or as filters. Use provider defaults and keep detail fetching opt-in. Employer targeting is disclosure data when available. The Ad Library has no verified employer reverse-lookup selector.

## Execution and results

- Register with Pi’s native defaultActive policy using the existing Ad Library gate. Dispatch directly to the existing clients and propagate the AbortSignal. Preserve timeout margins, error sanitization and single-dispatch behavior.
- Return concise model-visible content, useful details for expanded rendering, and a declared outputSchema matching structuredContent for codemode. Include platform, outcome, the full provider result on success, and a directly reusable next_request when valid. Preserve Meta ambiguity candidates, receipt IDs, partial results, dropped counts, cap adjustments and LinkedIn disclosure rows and shortening flags.
- Show the next_request to ordinary model callers as well as scripts. Build it from the original filters and server cursor. Meta domain lookups return no cursor. Omit next_request and use the resolved page_id to start a fresh search. A restart is a separate operation.
- Return actionable corrections for validation errors and typed provider failures. Preserve Pi cancellation. Partial data and ordinary lookup misses remain usable outcomes.

## Migration and acceptance

Keep Meta and LinkedIn clients and schemas separate under the existing feature. Introduce a single registration and dispatch path. Replace the three former tool names and descriptors outright. Update Melon Labs lists and active callers to the unified tool. The package clients also default to Meta 10 and LinkedIn 24.

Acceptance requires a first-call advertiser-name lookup, a copyable continuation, and a validated structured result in Pi. See the companion checklist and tests. No blocking design decisions remain.

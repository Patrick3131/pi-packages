---
status: done
owner: engineering
last_reviewed: 2026-10-07
canonical_ref: none
---

# Clearer crawl connection errors To-Do

## Tasks

- [x] Centrally format fetch transport failures in `http.ts` with the sanitized service URL, top-level message, and only the immediate `cause` code/message; tolerate missing causes and non-Error rejections.
- [x] Sanitize bearer tokens and URL userinfo across the complete diagnostic before truncating to the existing 2,000-character shared limit; keep endpoint and cause code visible.
- [x] Preserve cancellation/deadline diagnostics and keep body-limit, HTTP-status, and response-parsing errors outside the transport formatter.
- [x] Verify the existing crawl tool and `/crawl-status` wrappers surface the shared text with their current prefixes; change callers only if needed (no caller changes needed).
- [x] Extend `crawlTool.test.ts` with transport/fallback variants and an oversized full-message credential-redaction case.
- [x] Extend `index.test.ts` with rejected-fetch `/crawl-status` coverage using the existing command mock.

## Validation

- [x] Refused-connection text names the sanitized service URL and immediate cause, not only `fetch failed`.
- [x] Tokens and URL userinfo are absent from the complete displayed message, including repeated URLs in error/cause text.
- [x] Oversized diagnostics stay within the shared limit plus caller prefix and retain endpoint/cause code.
- [x] Nested causes are not traversed; missing causes and non-Error rejections remain useful.
- [x] `/crawl-status` displays the same sanitized transport diagnostic through its existing delivery path.
- [x] Existing HTTP status/no-retry, cancellation, deadline, body-limit, and malformed-response cases pass without mislabeling non-transport failures.
- [x] Run `npm run test --workspace=packages/pi-crawl4ai` and record actual outcomes in the test plan (217 passed; 3 out-of-scope live tests skipped).

## Docs

- [x] No README change needed; error wording adds diagnostics, not setup guidance.

## Completion

- [x] Every acceptance criterion is verified.
- [x] Test plan records coverage decisions and evidence.
- [x] Typecheck, build, and diff whitespace checks passed; final diff reviewed directly.

Completed 2026-10-07: intended RED failures established before the fix; full package validation GREEN. Only `http.ts` and the two existing test suites changed. No publication requested. Archive all three artifacts together to `docs/work/finished` (no `PI_WORK_*` overrides set).

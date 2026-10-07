---
status: done
owner: engineering
last_reviewed: 2026-10-07
canonical_ref: none
---

# Clearer crawl connection errors

## Type

bug

## Problem

A failed crawl reports only `Crawl failed: fetch failed`. That string is Node's `TypeError` message. The useful cause (`ECONNREFUSED`, DNS, TLS) stays on `error.cause` and is dropped.

Verified on 2026-10-01 from `melon-remote`: `crawl` POSTed to the default service, not to the target sites. Those sites answered `200` via curl. Nothing was listening on `http://localhost:11235` (`connection refused`). The configured WireGuard service at `http://10.8.0.1:11235` answered `/health` with `200`. The tool text did not say which endpoint failed or why.

`fetchCrawlApi` in `packages/pi-crawl4ai/src/features/crawl/http.ts` lets fetch failures propagate unchanged. `crawlTool.ts` and `/crawl-status` in `src/index.ts` then render only `error.message`, dropping the cause. `redactError` accepts a string and does not read `cause`.

## Outcome

A connection failure names the credential-free service URL and the immediate transport cause (code and message when present), still redacts bearer tokens, and stays bounded. HTTP status errors keep their current shape. This improves diagnosis; correcting service configuration remains separate work.

## Scope

### Included

- Connection and transport failures from `fetchCrawlApi`, including the crawl tool and `/crawl-status`.
- Redaction of tokens and URL userinfo in the complete displayed transport diagnostic: endpoint, top-level message, and immediate cause.
- Regression coverage in the existing crawl tool and command suites.

### Excluded

- Moving or changing config search order. See `D1`.
- Per-checkout setup. `melon-remote` gets a local gitignored `.pi/crawl4ai.json` outside this package.
- Retry, proxy, or server-side crawl4ai changes.
- Rewording successful crawls or HTTP status errors beyond keeping token redaction.

## Implementation Notes

Checked 2026-10-01:

- `packages/pi-crawl4ai/src/config/loader.ts` defaults `baseUrl` to `http://localhost:11235` when no JSON `url` and no `CRAWL4AI_BASE_URL`.
- `packages/pi-crawl4ai/src/config/files.ts` searches the working directory, `<cwd>/.pi/`, then `~/.pi/agent/extensions/`, `crawl4ai.json` before `.crawl4ai.json`. It does not walk parent repos.
- `packages/pi-crawl4ai/README.md` Configuration already documents that order and says not to commit secrets.
- `packages/pi-crawl4ai/src/features/crawl/crawlTool.test.ts` covers HTTP status errors and token redaction. It does not cover a rejected `fetch`.
- `credentialFreeBaseUrl` in `saveOutput.ts` strips embedded userinfo. Reuse that, or the same rule, for the endpoint. Also sanitize credential-bearing URLs repeated in error/cause text; sanitizing only the appended endpoint is insufficient.
- `packages/pi-crawl4ai/src/index.test.ts` already exercises `/crawl-status` with mocked fetch and checks bounded/redacted HTTP errors.

Keep formatting centralized in the existing HTTP path; do not add a new error framework. Include the top-level message plus only its immediate `cause` code/message when present. Do not recursively traverse nested causes or dump stacks. Missing causes and non-Error rejections must still produce a useful bounded message.

Limit the transport formatter to fetch failures. Preserve caller cancellation and deadline diagnostics without relabeling them as connection failures. Keep body-size limits, HTTP status handling, and response parsing outside that formatter. Sanitize the complete diagnostic before applying the existing 2,000-character shared error limit; put endpoint and cause code early enough that long messages cannot hide them. Existing caller prefixes may add a small fixed overhead.

## Decisions and Assumptions

- `D1` Do not move config to global in this package. The global file `~/.pi/agent/extensions/crawl4ai.json` is already the last search stop and is absent on this machine, so checkouts silently use localhost. A later change may document or install that file, but project JSON must still override it. This package only makes the missed endpoint visible. Correct this decision if the global file should become the default before the error-message work.
- `D2` The operator-facing message includes the credential-free base URL plus cause code/message. It does not include a setup guide or a guessed config path.

## Files

- `packages/pi-crawl4ai/src/features/crawl/http.ts` — centrally format fetch transport failures with sanitized endpoint, top-level message, and immediate cause; preserve abort and non-transport errors.
- `packages/pi-crawl4ai/src/features/crawl/crawlTool.ts` — verify the existing `Crawl failed:` wrapper surfaces the shared message; no substantive change expected.
- `packages/pi-crawl4ai/src/index.ts` — verify `/crawl-status` surfaces the same shared message; no substantive change expected.
- `packages/pi-crawl4ai/src/features/crawl/crawlTool.test.ts` — add transport diagnostic and sanitization coverage; retain existing deadline, cancellation, body-limit, and HTTP-status coverage.
- `packages/pi-crawl4ai/src/index.test.ts` — add rejected-fetch `/crawl-status` coverage.

## Acceptance Criteria

- [x] A refused connection names the configured service URL and `ECONNREFUSED` (or the actual cause code/message), not only `fetch failed`.
- [x] The complete displayed diagnostic never includes the bearer token or URL userinfo, even when repeated in the top-level message or immediate cause.
- [x] Oversized transport diagnostics remain within the 2,000-character shared limit plus caller prefix, without hiding the endpoint and cause code.
- [x] Only the immediate cause is included; missing causes and non-Error rejections are handled without formatter failures.
- [x] HTTP status errors still report `crawl4ai API error (<status>)` and stay redacted and bounded.
- [x] Cancellation, deadlines, body-size limits, and response parsing retain their existing meaning and are not mislabeled as connection failures.
- [x] `/crawl-status` reports the same sanitized endpoint and transport cause when the service is unreachable, verified in the command suite.

## Validation

Readiness verified against all three artifacts on 2026-10-07: ready; concrete scope and test plan, no blocking questions.

Completed 2026-10-07. `http.ts` now formats fetch failures centrally. Existing tool/command wrappers required no changes. Direct final-diff review confirmed the catch excludes body/status/parsing errors and preserves signal abort reasons; no config or retry changes.

- RED: targeted tool/command suites failed with 5 intended failures (missing endpoint/cause and exposed URL userinfo); 78 tests passed.
- GREEN: `npm run test --workspace=packages/pi-crawl4ai -- --runInBand` — 13 suites passed, 217 tests passed; 1 opt-in live suite / 3 tests skipped as out of scope.
- `npm run typecheck --workspace=packages/pi-crawl4ai` — passed.
- `npm run build --workspace=packages/pi-crawl4ai` — passed.
- `git diff --check` — passed.

See the companion test plan for risk-specific acceptance evidence. No live service check required.

## Open Questions

None

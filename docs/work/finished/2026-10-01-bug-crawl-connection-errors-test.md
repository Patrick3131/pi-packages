---
status: done
owner: engineering
last_reviewed: 2026-10-07
canonical_ref: none
---

# Clearer crawl connection errors Test Plan

## Coverage Decision

Automated coverage required

Reason: the production failure is a dropped `error.cause` on the crawl client. Existing suites mock fetch and cover HTTP errors, but not rejected-fetch diagnostics. Three new cases cover transport rendering, full-message sanitization/bounding, and the separate `/crawl-status` delivery path. Parameterize the transport case for cause-shape fallbacks; reuse existing non-transport tests rather than duplicate them.

## Risk Coverage

| Material failure risk | Existing coverage | Cheapest stable proof | Planned change |
|---|---|---|---|
| Transport failure hides endpoint/cause or mishandles cause shape | no rejected-fetch diagnostic coverage | parameterized case in `crawlTool.test.ts` | add |
| Complete diagnostic leaks tokens/userinfo or grows unbounded | response-body token redaction only | oversized rejected-fetch case with credentials repeated in message/cause | add |
| `/crawl-status` drops or changes shared transport text | command tests cover health and HTTP errors only | rejected-fetch case in `index.test.ts` | add |
| HTTP status wording or abort/body/parse semantics regress | existing HTTP, cancellation, deadline, body-limit, and malformed-response cases | rerun existing suite; strengthen negative transport-label assertions where relevant | reuse |

## Automated Cases

1. **Transport rendering and fallbacks (`crawlTool.test.ts`, parameterized):** reject fetch with `TypeError: fetch failed` and an immediate cause containing code `ECONNREFUSED` and a message. Assert the sanitized service URL, code, top-level message, and immediate cause message are present. Add a nested-cause marker and assert it is absent. Include missing-cause and non-Error rejection variants to prove formatting does not fail or produce an empty diagnostic.
2. **Sanitization and bounds (`crawlTool.test.ts`):** configure a service URL with synthetic userinfo and a bearer token. Repeat the credential-bearing URL and token in both the top-level message and immediate cause; make the message oversized. Assert neither token nor userinfo survives anywhere, the sanitized endpoint and cause code remain visible, and output is at most 2,000 characters plus the `Crawl failed: ` prefix. Redaction must precede truncation.
3. **Command delivery (`index.test.ts`):** reject fetch with the same transport cause and a synthetic token in cause text. Invoke `/crawl-status` through its existing mock registration. Assert its displayed message includes the sanitized endpoint and cause, excludes the token, and uses the existing command prefix/delivery behavior. This proves the command path without duplicating the full tool test matrix.

Rerun existing HTTP-status/no-retry, cancellation, deadline, oversized-body, and malformed-response tests. Where appropriate, assert those diagnostics are not labeled as connection failures; do not introduce duplicate standalone cases.

## Browser Or Manual Verification

| Step | Expected result |
|---|---|
| None for the code change | Mocked tool and command tests are the proof. A live refused port is optional and not required to close the package. |

## Commands

```sh
npm run test --workspace=packages/pi-crawl4ai
```

Verified in `pi-packages/AGENTS.md` and `packages/pi-crawl4ai/AGENTS.md`.

## Acceptance Evidence

| Check | Result | Evidence |
|---|---|---|
| Transport cause, endpoint, and fallback variants | passed | `renders service transport diagnostics and immediate cause only` — 3 variants: refused connection, absent cause, string rejection; nested marker absent |
| Complete-message token/userinfo redaction and bounds | passed | `sanitizes the complete transport diagnostic before bounding it` — synthetic endpoint/token repeated, oversized message, endpoint/code retained, <= 2,000 characters plus prefix |
| `/crawl-status` rejected-fetch delivery | passed | `delivers shared transport diagnostics from crawl-status` — endpoint/code/message present, token absent, headless delivery preserved |
| Existing HTTP status/no-retry and non-transport cases | passed | Package suite; strengthened deadline, pending-body cancellation, body-size, malformed-response and HTTP-status cases reject connection-failure labeling |

RED on 2026-10-07: `npm run test --workspace=packages/pi-crawl4ai -- --runInBand --runTestsByPath src/features/crawl/crawlTool.test.ts src/index.test.ts` — 5 intended failures, 78 passing tests. Existing text lacked endpoint/cause and exposed synthetic URL userinfo.

GREEN on 2026-10-07: full package command above with `-- --runInBand` — 13 passing suites, 217 passing tests; 1 opt-in live suite / 3 tests skipped (live third-party crawling is explicitly out of scope). Typecheck, build, and `git diff --check` also passed. Direct final-diff review completed; no outstanding findings.

## Explicitly Not Testing

- Config file search order and global vs project precedence (`D1`, out of scope).
- Live crawl of third-party sites.
- Exact full sentence copy beyond required diagnostic content, existing prefixes, sanitization, and bounds.
- Recursive cause traversal or stack rendering; only the immediate cause is included.
- A separate `http.test.ts`; existing tool and command suites already invoke `fetchCrawlApi`.

## Open Questions

None

---
status: backlog
owner: engineering
last_reviewed: 2026-10-01
canonical_ref: none
---

# Clearer crawl connection errors Test Plan

## Coverage Decision

Automated coverage required

Reason: the production failure is a dropped `error.cause` on the crawl client. `crawlTool.test.ts` already mocks `fetch` for HTTP status errors and does not cover a rejected fetch. One tool-level case proves the operator-visible string. A second case protects token leakage once cause text is included.

## Risk Coverage

| Material failure risk | Existing coverage | Cheapest stable proof | Planned change |
|---|---|---|---|
| Transport failure hides endpoint and cause | none; HTTP status cases in `crawlTool.test.ts` do not reject `fetch` | unit via existing crawl tool mock | add |
| Cause text leaks the bearer token | token redaction for response bodies in `crawlTool.test.ts` | same tool mock | add |
| HTTP status wording regresses | `HTTP errors are bounded/redacted and never retried` | existing case | none |

## Automated Cases

- Given a configured base URL and `fetch` rejecting `TypeError: fetch failed` with cause `ECONNREFUSED`, when crawl runs, the thrown message contains that URL and `ECONNREFUSED`, not only `fetch failed`.
- Given the same rejection whose cause text includes the configured bearer token, the thrown message does not contain the token.

## Browser Or Manual Verification

| Step | Expected result |
|---|---|
| None for the code change | The tool test is the proof. A live refused port is optional and not required to close the package. |

## Commands

```sh
npm run test --workspace=packages/pi-crawl4ai
```

Verified in `pi-packages/AGENTS.md` and `packages/pi-crawl4ai/AGENTS.md`.

## Acceptance Evidence

| Check | Result | Evidence |
|---|---|---|
| Transport cause and URL | skipped | not implemented |
| Token redaction in cause | skipped | not implemented |
| Existing HTTP status case | skipped | not re-run |

## Explicitly Not Testing

- Config file search order and global vs project precedence (`D1`, out of scope).
- Live crawl of third-party sites.
- Exact full sentence copy beyond the URL, cause code, and absence of the token.
- A separate `http.test.ts`; the existing tool suite already invokes `fetchCrawlApi`.

## Open Questions

None

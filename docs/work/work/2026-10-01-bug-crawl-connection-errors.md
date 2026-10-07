---
status: backlog
owner: engineering
last_reviewed: 2026-10-01
canonical_ref: none
---

# Clearer crawl connection errors

## Type

bug

## Problem

A failed crawl reports only `Crawl failed: fetch failed`. That string is Node's `TypeError` message. The useful cause (`ECONNREFUSED`, DNS, TLS) stays on `error.cause` and is dropped.

Verified on 2026-10-01 from `melon-remote`: `crawl` POSTed to the default service, not to the target sites. Those sites answered `200` via curl. Nothing was listening on `http://localhost:11235` (`connection refused`). The configured WireGuard service at `http://10.8.0.1:11235` answered `/health` with `200`. The tool text did not say which endpoint failed or why.

`fetchCrawlApi` in `packages/pi-crawl4ai/src/features/crawl/http.ts` returns `error.message` only. `crawlTool.ts` and `/crawl-status` in `src/index.ts` wrap that string. `redactError` does not read `cause`.

## Outcome

A connection failure names the credential-free service URL and the transport cause (code and message when present), still redacts bearer tokens, and stays bounded. HTTP status errors keep their current shape.

## Scope

### Included

- Connection and transport failures from `fetchCrawlApi`, including the crawl tool and `/crawl-status`.
- Redaction of tokens that appear in the cause chain.
- One regression test on the existing crawl tool suite.

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
- `credentialFreeBaseUrl` in `saveOutput.ts` strips embedded userinfo. Reuse that, or the same rule, so the error cannot print credentials. Do not print the bearer token.

Keep the change in the existing HTTP error path. Do not add a new error framework. Include `cause` one level deep; do not dump stacks.

## Decisions and Assumptions

- `D1` Do not move config to global in this package. The global file `~/.pi/agent/extensions/crawl4ai.json` is already the last search stop and is absent on this machine, so checkouts silently use localhost. A later change may document or install that file, but project JSON must still override it. This package only makes the missed endpoint visible. Correct this decision if the global file should become the default before the error-message work.
- `D2` The operator-facing message includes the credential-free base URL plus cause code/message. It does not include a setup guide or a guessed config path.

## Files

- `packages/pi-crawl4ai/src/features/crawl/http.ts` — attach cause and credential-free base URL on transport failure; redact the cause chain.
- `packages/pi-crawl4ai/src/features/crawl/crawlTool.ts` — surface that message unchanged, still via the existing `Crawl failed:` wrapper.
- `packages/pi-crawl4ai/src/index.ts` — `/crawl-status` uses the same transport error text.
- `packages/pi-crawl4ai/src/features/crawl/crawlTool.test.ts` — extend the existing HTTP error coverage.

## Acceptance Criteria

- [ ] A refused connection names the configured service URL and `ECONNREFUSED` (or the actual cause code/message), not only `fetch failed`.
- [ ] The message never includes the bearer token, even when the cause text contains it.
- [ ] HTTP status errors still report `crawl4ai API error (<status>)` and stay redacted and bounded.
- [ ] `/crawl-status` reports the same transport cause when the service is unreachable.

## Validation

See the companion test plan. Workspace test command is `npm run test --workspace=packages/pi-crawl4ai` (`AGENTS.md`).

## Open Questions

None

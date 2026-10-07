---
status: backlog
owner: engineering
last_reviewed: 2026-10-01
canonical_ref: none
---

# Clearer crawl connection errors To-Do

## Tasks

- [ ] Format transport failures in `http.ts` with the credential-free base URL and one-level `cause` code/message, and redact tokens in that chain.
- [ ] Use that text from the crawl tool wrapper and `/crawl-status` without a second error style.
- [ ] Extend `crawlTool.test.ts` so a rejected fetch fails the build until the cause and URL are present, and a token in the cause is absent from the message.

## Validation

- [ ] Refused-connection text names the service URL and cause, not only `fetch failed`.
- [ ] Token in the cause is redacted.
- [ ] Existing HTTP status error case still passes.

## Docs

- [ ] No README change unless the error wording becomes operator guidance. `D1` says it does not.

## Completion

- [ ] Every acceptance criterion is verified
- [ ] Test plan records coverage decisions and evidence

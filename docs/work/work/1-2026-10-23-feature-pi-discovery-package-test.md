---
status: in_progress
owner: engineering
last_reviewed: 2026-10-23
canonical_ref: 1-2026-10-23-feature-pi-discovery-package.md
---

# Test plan — `pi-discovery`

**Coverage decision: automated coverage required.** Six distinct new runtime
risks justify exceeding the default three-case budget. Use table-driven variants
at one layer per risk; reuse useful search coverage and update it to the final
contract. No old API parity tests or compatibility matrix.
Documentation-only review of this plan needs no new tests.

| Risk | Cheapest proof and scope |
| --- | --- |
| A: contract drift spends quota or rejects valid calls | answer client test: normalized query/instructions, strict bounds/defaults, exact JSON keys including timeout_ms, no context_size/auth header, exactly one fetch; parse a production-shaped response with searches.queries/source_type/id/timings, optional usage and empty-source gaps; reject malformed JSON/required fields. |
| B: misleading failure/retry advice | client error table: 400, both documented 401s, both 429s, 502, 504, unknown codes/statuses; safe serverCode/requestId, absent/seconds/date/invalid Retry-After; never read error gaps or invent quota/token diagnosis. Adapter boundary checks isError:true and abort rethrow, without duplicating the HTTP table. |
| C: cancellation or timeout leaves an in-flight request | injected fetch/body-read cases: pre-abort makes zero calls, caller abort preserves AbortError, local deadline returns timeout; both cancel fetch/blocked body read and release listeners/timer. Invalid server/HTTP deadline relationship fails before fetch. |
| D: query/config escapes intended service or appears in diagnostics | config/client test: default VPN HTTP and HTTPS accepted; URL credentials/query/fragment/path/invalid protocol rejected; redirect:error set and redirect/network failure sanitized. Sentinel config/body strings never appear in serialized tool errors/details. No RFC1918 detector or token requirement to test. |
| E: search evidence is upgraded into fabricated citations | normalization/render test: prose-only URL never added; trim/exact dedupe/http(s) filter/requested/default/hard cap; rendered Search results list equals details.sources; empty sources and unknown gap remain visible; no spans or synthetic usage. |
| F: lifecycle clobbers an explicit selection | registration/lifecycle test with existing toolkit/preset handlers in actual order: fresh env/default/project true/false using the new enablement names, active preset on current branch, resumed/reloaded loadout, delegated child, host-excluded tool and later /tools choice. Assert only owned names can be filtered and lifecycle never writes project preferences. |

## Reused and compiler/build proof

- Reuse/adapt search tests for the new contract; delete obsolete alias/parity
  expectations. Add the ownership regression in F without duplicating the suite.
- Strict compile includes index.ts/toolDefinition.ts; do not add tests that merely
  mirror TypeBox/compiler guarantees. Runtime validation remains necessary for
  harness-neutral callers and untrusted server JSON (A).
- Build research and inspect declaration exports including the runtime error
  class; import built artifact without Coding Agent/TUI host dependencies.
- Post-deletion clean install and lockfile/path inspection prove workspace cleanup.
  This is a release check, not a permanent source-grep unit test.

## Live release proof

Normal automated tests make no network calls. Opt-in `DISCOVERY_LIVE=1` performs
one bounded source-bearing query against the configured production service;
verify answer, Luna model, search_results provenance, consistent result list and
visible gaps. If the operator opts in, unreachable service/HTTP failure fails the
check; default mode skips without spending quota. No forced quota exhaustion,
account logout, server gate toggle or duplicate backend latency/load tests.

After the root registry release, smoke its installed artifact and one Pi session
with each tool opted in. Direct SearXNG must work without discovery account auth.
Record source/version/integrity and separate newly observed results from reused
server acceptance. Verify Melon Labs' exact registry pin/lockfile and affected
agent checks/build after updating affected imports/config/adapters to the new
contract. Do not require the old adapter interface or behavior to remain intact.

## Installed local/remote acceptance

Run existing pi-sync checks/tests if its narrow migration changes; do not add a
new deployment framework or tests merely for moving package paths. Independently
verify both the local global Pi install and melon-remote Pi/Paseo installation:

- Installed published source revision and new pi-discovery extension reference;
  no removed pi-searxng path or stale discovery enablement key.
- Completed remote Dokploy task with terminal success/completion logs, not merely
  dispatch success; local update result also recorded.
- Fresh/reloaded Pi actually registers the intended tools and respects enablement.
- One source-bearing web_answer and one direct SearXNG query from each target,
  proving remote network access as well as local operation. Do not copy backend
  Codex credentials; retain target-local unrelated settings and secrets.

Record a separate result for local and melon-remote. Publishing a release, editing
settings or validating a test Pi session elsewhere does not prove these installs
were updated. These live checks are required before the work package is finished.

## Not tested

TUI snapshots, exact descriptive copy, server subprocess isolation, server queue/
quota semantics, universal answer quality, citation entailment and provider model
availability. These are presentation, backend-owned or model-evaluation concerns.
No fake claim that a retrieved URL proves a generated assertion. No backward-
compatibility tests, legacy env alias tests or old/new version matrix.

## Commands

```bash
npm run typecheck --workspace=packages/pi-discovery
npm run test --workspace=packages/pi-discovery
npm run typecheck
npm run test
npm run build
npm run build:research
# Only with explicit live-test intent after the package exists:
DISCOVERY_LIVE=1 npm run test --workspace=packages/pi-discovery
```

No implementation or live request was performed during the 2026-10-23 plan
review. Sources were the existing Pi client/toolkit, current Melon Labs import/
registry pin, deployed service source and its recorded acceptance evidence.

Implementation finding: installed Pi 1.3.0 ToolDefinition.defaultActive natively
implements default-off/environment defaults while host/toolkit owns explicit
selection. Use it instead of a custom discovery session_start filter; verify
with real Pi session loading plus toolkit project overrides.

Local implementation evidence (2026-10-23): clean npm ci, root typecheck/test/
build/build:research passed. New client/real Pi lifecycle tests pass, live
production Luna + SearXNG check passed. Built research imports without host
dependencies; pack inspection contains the new extension, no old package.
Release 0.1.7, consumer pin and local/remote activation remain pending.

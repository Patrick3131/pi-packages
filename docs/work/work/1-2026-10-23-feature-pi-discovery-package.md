---
status: in_progress
owner: engineering
last_reviewed: 2026-10-23
canonical_ref: none
---

# Feature: `pi-discovery` — direct package replacement and `web_answer`

## Outcome

Replace `pi-searxng` with `pi-discovery` and add
`web_answer` for the deployed discovery-services API. Export its harness-neutral
client and schema from `@patrick3131/pi-packages/research`. This is an
implementation plan; implementation is in progress.

## Verified baseline — 2026-10-23

- `packages/pi-searxng/src/{search,config,index,toolDefinition,types}.ts` owns the
  current search client/extension. Root `src/research.ts` already exports its
  client and schema. Environment enablement accepts `PI_SEARXNG_ENABLED` and
  fallback `SEARXNG_SEARCH_ENABLED`, values `1` or case-insensitive `true`.
- `packages/pi-toolkit/src/features/tools/{index,state}.ts` owns project overrides,
  preset/loadout ownership and child-session protection. `pi.getFlag` sees only
  flags owned by the calling extension; `getFlag("preset")` in another extension
  is not a valid preset signal. Current search handler needs that narrow fix.
- Discovery production is live at `http://10.8.0.1:18080`. Runtime source
  `discovery-services@3a238ae`: `apps/discovery/app/features/web_answer/{models,errors,router}.py`
  and `apps/discovery/README.md` are the contract. Prior rollout acceptance:
  20/20 successful Luna requests, p95 8.357 s; this is prior evidence, not a new test.
- The API uses private bridge/VPN access, **no API bearer authentication**.
  Server-owned Codex auth must never be copied to Pi or Melon Labs.
- Melon Labs `apps/agents/package.json` pins registry version `0.1.6`;
  `apps/agents/src/features/agency-research/tools/web-search-searxng.ts` already
  imports `searchSearxng` and `searxngToolDefinition` from the research export.
  There is no local search HTTP glue to replace.

## Operator direction — rough update

Breaking changes are accepted. Update the package and its consumers directly;
remove obsolete exports, configuration aliases and code instead of maintaining
old contracts. No compatibility shim, staged copy/parity migration, dual support
or backward-compatibility acceptance gate. Reuse useful code and tests, but do
not preserve an API merely because it existed. Normal correctness checks still
apply to the new contract.

## Scope and decisions

| ID | Decision |
| --- | --- |
| D1 | One `pi-discovery` package for search and answer; keep `pi-crawl4ai` separate. |
| D2 | Keep the useful tool names `web_search_searxng` and `web_answer`; schemas, exports, output and config may change. Update callers directly; no legacy aliases. |
| D3 | Both tools default off. Search remains direct to SearXNG; the retired `/v1/web-search` route is not a transport option. |
| D4 | `web_answer` returns model-written text and structured search evidence. No citation spans, annotation reconstruction or answer-URL parsing. |
| D5 | No retries, fallback model, queue in the client, or per-call model selection. The server always selects `gpt-6-luna`. |
| D6 | Move/replace the old package directly, delete it, and update root exports/registration and consumers to the final contract. No temporary duplicate package or parity stage. |
| D7 | Publish a new exact root registry version through existing tagged-release CI; do not overwrite `0.1.6` or convert registry consumers to Git pins. |
| D8 | Update Melon Labs to the released version and adapt its imports, config and affected tool adapters as needed. Verify the updated behavior, without requiring the old contract to survive. |
| D9 | Update the local global Pi install and melon-remote's Pi/Paseo installation to use pi-discovery, then verify actual tool loading and calls on both. Publication alone is incomplete. |

`web_open`, API search proxy, model traffic proxy, crawler merge, unrelated
consumer features and discovery-services production deployment are out of scope.
Local global Pi and melon-remote package activation are explicitly in scope, as
are consumer pin/lockfile, imports/config and affected adapter updates;
follow that repository's instructions. Do not modify installed caches. A future
consumer feature can wire the new answer tool into additional workflows.

## Layout and exports

`packages/pi-discovery/` contains package metadata, `.env.example`, README,
AGENTS, CONTEXT, LICENSE, `src/{config,types,search,answer,toolDefinition,index}.ts`
and Node/tsx `test/*.test.ts` (including an extension registration/lifecycle test).
Reuse the current search implementation where useful; move it directly and remove dead code.

`config.ts` is the only environment reader. Client receives injected env/fetch/
signal; feature code never reads process.env. No new runtime dependencies beyond
existing TypeBox peer/Node built-ins. Strict tsconfig includes **all** src and
tests, including registration/schema files; use `.js` import specifiers for
NodeNext. Harness-neutral files must not import Coding Agent/TUI runtime modules.

Root `src/research.ts` exposes the final search API and adds `askWeb`,
`webAnswerToolDefinition`, `WebAnswerClientError` (a runtime class), and the
params/options/result/details/error-code types. Exporting only the error's type
would prevent consumers using `instanceof`. Remove obsolete exports and update callers.
Update root extension path, package
list/navigation and lockfile; the research declaration bundle must expose these
exports and remain usable without Coding Agent/TUI peers.

## Request and client API

```ts
interface WebAnswerParams {
  query: string;                 // trim, 1–8000 characters
  instructions?: string;         // trim, max 4000
  max_sources?: number;          // integer 1–20, default 10
  timeout_ms?: number;           // integer 5000–120000, default 60000
}
interface WebAnswerOptions {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;            // HTTP deadline; default from config
}
askWeb(params: WebAnswerParams, options?: WebAnswerOptions): Promise<WebAnswerResult>
```

POST `/v1/web-answer` with those snake_case JSON keys only. Reject unsupported
keys/invalid bounds before fetch in the harness-neutral API as well as the tool
schema. **No `context_size`**; the server rejects extra fields. Keep instructions
optional rather than sending null. Client validates server JSON as unknown before
accessing fields. No bearer header or API-token requirement.

Default HTTP timeout is 90,000 ms; explicit option overrides the env default.
Send a concrete server `timeout_ms` (default 60,000); HTTP timeout must exceed it
by at least 5,000 ms so the server can return its error. Reject inconsistent
configuration before spending quota. Callers needing a shorter total deadline
must lower both values within bounds. Deadline includes fetch **and body read**;
keep caller cancellation connected until parsing finishes and release timers/
listeners in finally. Caller abort propagates `AbortError`; local deadline is a
typed `timeout` error. Pre-aborted signal performs no fetch. Never retry.

## Response and evidence

```ts
interface WebAnswerResult {
  id: string;
  query: string;
  answer: string;
  provider: "codex_cli";
  model: string;
  source_type: "search_results";
  sources: Array<{ url: string; title?: string }>;
  searches: Array<{
    action: "search" | "open_page" | "find_in_page";
    queries?: string[];
    url?: string;
    pattern?: string;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    web_search_calls: number;
  };
  gaps: string[];
  timings: { queue_ms: number; agent_ms: number; total_ms: number };
}
```

Mirror wire casing; do not introduce a second camelCase usage/search contract.
Absent optional fields stay absent. Missing answer/sources/searches/gaps/identity/
provenance/timings or wrong types are `malformed`, not a success with invented
empty values. Usage is optional; unknown success gap strings remain visible for
diagnostics. Ignore unrelated response fields without introducing version adapters.

Sources: trim URL/title, filter non-http(s), exact-URL dedupe and cap at requested
`max_sources` (default 10, hard max 20). No broad URL canonicalization. Empty
sources is a valid success; preserve `no_sources`/`no_search_performed`, never
manufacture a source or usage value. Search actions use `queries[]`, not `query`.
No span fields. Provider results can be unrelated to the final answer; a URL in
`sources` does not establish support for a claim.

Tool content: answer, then `Search results:` with the normalized title/URL list,
then available gap codes (or an explicit no-results note). The answer may itself
contain URLs absent from sources; preserve the text without upgrading those URLs
to evidence. Guidelines tell the consuming model to assess relevance, use crawl
for page verification, and avoid citing unsupported claims. Describe the tool as
“Web research answer with search results; usually takes seconds and consumes
shared account quota.” Do not promise annotated citations or a fixed 5–30 s bound.

`WebAnswerDetails` is the result metadata without answer text, plus `latencyMs`
(client wall time, distinct from server timings) and `answerChars`. Tool text and
`details.sources` use the same normalized list. Success gaps remain visible in
model-facing content as well as details; expanded TUI shows results and gaps.

## Configuration and access

| env | default | contract |
| --- | --- | --- |
| DISCOVERY_BASE_URL | http://10.8.0.1:18080 | absolute http(s) origin, no credentials/query/fragment/path except `/`; strip trailing slash |
| DISCOVERY_WEB_ANSWER_ENABLED | unset | `1`/`true` permits fresh-session default enablement; not a force override |
| DISCOVERY_WEB_ANSWER_TIMEOUT_MS | 90000 | finite positive integer HTTP deadline, subject to request deadline relationship |
| SEARXNG_URL | http://10.8.0.1:18089 | direct SearXNG origin |
| SEARXNG_ENGINES | brave,duckduckgo | direct engine selection |
| DISCOVERY_WEB_SEARCH_ENABLED | unset | `1`/`true` enables fresh-session search default; replaces old search enablement vars |

Keep the URL rule simple: the operator configures a trusted service origin;
private VPN HTTP is supported directly. No invented `DISCOVERY_API_TOKEN`,
RFC1918 detector, `DISCOVERY_ALLOW_INSECURE`, or context-size env knob. Reject
embedded URL credentials before fetch and never echo raw configured URLs or
provider payloads in errors. Use `redirect: "error"` so an origin redirect cannot
forward query/instructions to another host. Network failure names the service,
not secret-bearing configuration. No account authentication material enters Pi.

## Failures

`WebAnswerClientError extends Error` exposes `code`, optional HTTP `status`,
optional `serverCode`, `requestId`, and `retryAfterMs`. Export the runtime class.
Codes: `invalid_request | disabled | auth | busy | quota | upstream | timeout |
transport | malformed`. Parse only the documented `error` envelope; keep raw
body/stack/cause out of model content and details. Use bounded safe messages.

| HTTP/server code | client code and guidance |
| --- | --- |
| 400 / invalid_request | invalid_request; check request bounds |
| 401 / web_answer_disabled | disabled; operator must enable backend |
| 401 / codex_auth_expired | auth; operator must reauthenticate server Codex CLI |
| 429 / web_answer_queue_full | busy; shared capacity occupied, Retry-After: 1 |
| 429 / codex_rate_limited | quota; account limit, honor Retry-After if present |
| 502 / codex_transport | upstream; backend could not finish |
| 504 / codex_timeout | timeout; backend deadline exceeded |
| unknown status/code or unrecognized 401/429 body | upstream with status; do not guess token rejection/quota exhaustion |
| network/redirect failure | transport |
| invalid JSON/wrong success shape | malformed |

Retry-After accepts nonnegative seconds or an HTTP date relative to an injectable
clock; past dates clamp to zero, invalid values are absent. No suggested delay
when absent. Success `gaps` do not exist on error bodies. Pi adapter catches typed
client errors into a safe `isError: true` tool result; caller abort is rethrown.
Harness-neutral `askWeb` always rejects on failures, never wraps them as success.

## Enablement and lifecycle

Use the toolkit's current ownership rules for the new package. Explicit host/child selection, active preset and a resumed/forked/
reloaded loadout own their tool set; do not add/remove tools behind them. In a
fresh unowned session: explicit project true/false overrides env defaults; absent
project key uses env/default-off. Later `/tools` selections remain authoritative.
Never write `.pi/tools.json` during lifecycle.

Use native ToolDefinition.defaultActive for both tools, populated from config env
at registration. No discovery session_start filter or second tool manager is
needed. Root registration order remains presets, discovery, tools. Pi owns host/
child/history loadouts, toolkit owns fresh project overrides. Installed SDK tests
proved toolkit project false could override explicit CLI --tools; the narrow fix
skips project startup overrides when CLI tool-selection arguments own the set.
Real Pi SDK sessions test this with discovery + toolkit/preset factories.

## Release and acceptance

1. The old package and config aliases are gone. New search/answer tools and public
   exports work; affected callers use the final contract. No old-contract parity gate.
2. Live `web_answer` returns Luna text plus search-result provenance; rendered
   list/details match and empty-source gaps remain actionable.
3. Disabled/auth/busy/quota/deadline errors are distinguishable. Cancellation
   aborts transport/body read; no retry or raw config/body/token disclosure.
4. Root typecheck/test/build and build:research pass. Built export imports with
   only Node/TypeBox bundled, without Coding Agent/TUI host installation.
5. Delete old workspace, regenerate lockfile after deletion, verify no operational
   path references survive (including configs, scripts, bundler metadata). Historic
   work notes are exempt. New registry artifact ships the new extension and export.
6. Record exact version/source/workflow/artifact integrity; smoke the installed
   artifact's search/answer exports. Update Melon Labs' exact registry pin and
   lockfile, run affected agent checks/build, and verify existing research imports.
   Adapt affected imports/config/tool adapters to the new API; test the resulting behavior.

7. Local global Pi and melon-remote both run the new pi-discovery package at the
   recorded published source revision. Old extension references are removed;
   reloaded sessions on each target register and successfully call both tools.

Default live tests skip when not opted in. With `DISCOVERY_LIVE=1`, unreachable
service or contract failure is a **failure**, never an opportunistic skip. Use
one bounded real query, no bursts; the backend already owns load/latency acceptance.
Do not change the server gate or reauthenticate accounts as part of client tests.

## Local global and melon-remote rollout

After publishing the source/release, update **both** the local global Pi install
(default `~/.pi/agent`) and melon-remote's Pi/Paseo install (`/data/pi-agent`,
Pi runtime `/data/pi-runtime/bin`). Verify the current configured targets before
applying; these are installed consumers, separate from the Melon Labs npm pin.
They must load the new `pi-discovery` extension and stop referencing the removed
`packages/pi-searxng` path. Update affected package filters, explicit extension
paths and discovery enablement settings directly; no legacy alias support.

Use the existing `scripts/pi-sync` workflow documented in `configs/global/README.md`:
`./scripts/pi-sync --toolkit-only --check`, inspect both target previews, then
`./scripts/pi-sync --toolkit-only --apply`. Extend its narrow reference/config
update only if needed for the discovery rename/new enablement keys. Do not use
`--local-only`, full restore `--force`, or unrelated shared-config replacement.
Remote execution uses temporary disabled/manual Dokploy API tasks; verify terminal
status and completion logs. No SSH/sudo, workspace scan or cache editing.

Reload/start fresh on both installations so the new code is actually loaded.
Check installed source revision, registered tools and default/project enablement;
with discovery tools opted in, run one `web_answer` and one direct SearXNG call on
each target. The remote call must reach the production service over its configured
network. Record each target's installed revision, reload and actual call results;
updating source/settings alone does not satisfy acceptance. Keep credentials,
models, MCP settings, unrelated presets and sessions target-local and unchanged.
No server Codex credential needs to be copied to either Pi installation.

## Open Questions

None. Package/tool names retained from the supplied plan. A new registry patch
version is selected from the current released version at implementation time.

## Review corrections — 2026-10-23

This review supersedes earlier review tables and token/citation/context-size
assumptions. It aligns requests, source_type/search actions, deadline coupling and
error codes with the deployed API; preserves toolkit session ownership; removes
the retired API-search follow-up; and corrects registry/consumer release scope.
The operator then explicitly accepted a rough breaking update: legacy contract/
alias preservation and staged migration requirements are removed.
See the [task list](1-2026-10-23-feature-pi-discovery-package-to-do-list.md) and
[test plan](1-2026-10-23-feature-pi-discovery-package-test.md).

Implementation finding: installed Pi 1.3.0 ToolDefinition.defaultActive natively
implements default-off/environment defaults while host/toolkit owns explicit
selection. Use it instead of a custom discovery session_start filter; verify
with real Pi session loading plus toolkit project overrides.

Local implementation evidence (2026-10-23): clean npm ci, root typecheck/test/
build/build:research passed. New client/real Pi lifecycle tests pass, live
production Luna + SearXNG check passed. Built research imports without host
dependencies; pack inspection contains the new extension, no old package.
Release 0.1.7, consumer pin and local/remote activation remain pending.

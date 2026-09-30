---
status: done
owner: engineering
last_reviewed: 2026-09-30
canonical_ref: packages/pi-crawl4ai/CONTEXT.md
---

# Crawl4AI simplified Test Plan

Contract: [spec](2026-09-30-epic-crawl4ai-reliability-and-extraction.md). Tracking: [tasks](2026-09-30-epic-crawl4ai-reliability-and-extraction-to-do-list.md).

## Coverage Decision

**Automated coverage required** for implementation. Planning edits require consistency/link checks, not runtime tests proving Markdown creation.

Extend existing regression tests first. New coverage may exceed the usual three-case preference only for distinct risks below: BM25 relevance and Python output/lifecycle introduce genuinely new behavior. Do not duplicate local invariants in browser tests or recreate the repaired ESM test failure.

Earlier 2026-09-30 baseline: 11 suites / 150 tests and typecheck passed; the live case used HTTPS fallback. This is historical planning evidence, not a fresh run or proof that the proposed implementation/service behavior works. Refresh before implementation.

## Risk Coverage

Paths are under packages/pi-crawl4ai/src/features/crawl except index/config tests.

| Risk | Existing proof | Cheapest change / AC |
|---|---|---|
| Hung queue/fetch/body, wrong failure reporting | requestPacing.test.ts and crawlTool.test.ts | Extend fake-clock/fetch deadline, queued abort, subsequent request, partial/total failure and malformed-response cases; AC1 |
| Oversized context or lost source on presentation truncation | tokenBudget.test.ts and crawlTool.test.ts | Replace adaptive-policy expectations with file-first/save matrix and exhausted/multibyte/large-index cap assertions; AC2 |
| Overwritten/escaped/deleted artifacts or stale URL lookup | saveOutput.test.ts, cleanup.test.ts, crawlReadTool.test.ts | Extend filesystem cases for same-time allocation/full-URL identity, manifest-last failure, path escape, newest/strict context and protected returned session; AC3 |
| BM25 removes relevant structure or misrepresents no-match | outline.test.ts keyword/section cases only | New pure BM25/fence/table/no-heading fixtures and extend saved read query case; AC4 |
| Trafilatura loses source/structure or leaves child running | None | New wrapper tests with controlled executable and fixtures; actual configured Python smoke; AC5 |
| Wrong API wait/depth/filter/cache semantics | crawlTool.test.ts payload mocks; current live fallback | One explicitly opt-in genuine service suite, no fallback; AC1 |
| Activation/discovery/mode regressions | index.test.ts plus existing tools/presets suites | Remove obsolete command tests, retain no-policy-mutation proof, short real Pi/package checks; AC6 |

## Automated Cases

Use parameterized cases where they expose the same risk; no fixed new test-count target.

1. **Extend HTTP/pacing cases:** pre-abort, queued abort, delayed headers/body and deadline failure release resources and let the next call proceed. Auth preserved; errors redacted; mixed vs all-failed pages distinguish partial result from failure. Invalid combos/numbers/response envelopes fail safely.
2. **Update output policy cases:** omitted save persists even a tiny page; auto returns bounded paths, explicit inline saves full body, save=false never writes, explicit files+no-save rejects preflight. Zero remaining cap never expands output; long/multibyte/index output respects host limits and retains pointer. Legacy smaller caps are honored.
3. **Extend artifact/read/cleanup cases:** simultaneous same-domain saves allocate distinct directories; differing queries/ports get distinct files; failed write does not publish manifest. Legacy sessions work, newest URL wins, wrong explicit context cannot fall back. Escaped/symlink paths rejected; custom session works; newly returned oversized session survives cleanup. These are separate filesystem risks—use focused tests rather than one giant assertion chain.
4. **New BM25 fixtures:** relevant vs unrelated/no-match sections; Unicode/repeated terms; headingless paragraphs; headings in fenced code ignored; table/code contents remain complete in saved filtered artifact and sections retain source order. Oversized read excerpts are labelled with source range/path, not claimed complete. No decorative snapshots or full parser conformance suite.
5. **New Python wrapper fixtures:** explicit executable receives HTML stdin without shell/URL fetching; expected native Markdown/text/table/link behavior. Missing dependency/error preserves original. Pre-abort spawns nothing; controlled hanging/IO-heavy child is terminated within deadline and resources cleaned. Assert actual child exit, not only a mocked kill call.
6. **Update existing live test:** external service requested explicitly; unavailable service fails instead of HTTPS fallback. Controlled small page/linked fixture verifies rendered JS delay, maxDepth translation, maxPages, domain/include/exclude and cache behavior. Record service version if known. No additional deployment harness or capability endpoint required; serve a simple fixture where the configured browser can reach it.

Show known regression cases fail before applying fixes where practical. Preserve existing tests that protect unchanged behavior; remove budget benchmarks/expectations only when they depend on the intentionally replaced auto policy, not as a shortcut to green tests.

## Browser Or Manual Verification

| Step | Expected result |
|---|---|
| Crawl actual configured service: small page, delayed JS and bounded linked pages | Service/auth/rendering/depth/filter behavior observed, not inferred from mocked payload. Record date/version when available; keep secrets external. |
| Ordinary crawl → crawl_read query/window/full; unrelated BM25 query | Full saved source recoverable, concise result, correct selected page/sections, explicit valid empty filter result. No outline-first requirement. |
| Optional real Python extraction then BM25; repeat without Python configured | Useful native cleanup and source recovery; missing dependency actionable; ordinary crawl unaffected. Note observed table/content losses instead of heuristic repairs. |
| /tools and preset transitions, /reload and explicit CLI tool selection | crawl-on/off absent; extension does not override external activation. On-demand status changes no tools and performs no startup network request. |
| Basic interactive and print/JSON session | Tools work without UI-dependent prompts or unsolicited stdout logs. No custom renderer certification needed. |
| Root Git resource discovery and standalone tarball inspection | Three agents included, pi.subagents.agents recognized; no extra prompts/global symlinks. |
| Explicitly authorized scrape child with parent crawling inactive | Provider loads and strict crawl/crawl_read allowlist resolves; inherited model, source-backed report, no bash/subagent. Extract role labels model-inferred facts honestly. |

Do not delegate or launch children for the planning edit itself. Runtime child smoke is an implementation validation step with normal operator authorization.

## Commands

Existing repository scripts; run from root. Keep live tests opt-in during implementation. No lint script or new validation dashboard is required.

```sh
npm run test --workspace=packages/pi-crawl4ai -- --runInBand
npm run typecheck --workspace=packages/pi-crawl4ai
npm run build --workspace=packages/pi-crawl4ai
npm run test --workspace=packages/pi-tools
npm run test --workspace=packages/pi-presets
npm pack --workspace=packages/pi-crawl4ai --dry-run
npm run test
```

Strict service test (endpoint/auth configured externally; update existing case to remove fallback):

```sh
CRAWL4AI_LIVE=1 npm run test --workspace=packages/pi-crawl4ai -- --runInBand src/features/crawl/liveCrawl.integration.test.ts
```

Documentation checks:

```sh
rg -n 'crawl-on|crawl-off|enabledByDefault|disabled by default' packages/pi-crawl4ai README.md
git diff --check
```

## Evidence To Record During Implementation

- Test/typecheck/build commands and results, including relevant regression cases.
- Actual configured service smoke, version/date and observed wait/depth/filter/cache behavior; unavailable service remains an open verification gate.
- Actual optional Python version/output/process cleanup and documented losses.
- Brief activation/headless/package/child discovery evidence and migration diff.

### Recorded implementation results — 2026-09-30

- Root `npm run test`: **passed**, including crawl **12 suites / 213 tests passed, 3 opt-in live cases skipped**, other workspaces and 13 restore-config tests. Separate tools/presets runs passed (34 / 12 tests). Logs: `/tmp/crawl-final-root-tests.log`, `/tmp/crawl-tools-regression.log`, `/tmp/crawl-presets-regression.log`.
- Crawl `npm run typecheck --workspace=packages/pi-crawl4ai` and `npm run build --workspace=packages/pi-crawl4ai`: **passed**; ESM and declarations built. `npm pack --workspace=packages/pi-crawl4ai --dry-run --json`: passed; all three agents and compiled provider included (`/tmp/crawl-final-pack.json`).
- TDD handoffs record material red-before-green deadline/save/abort/newest-read regressions, cached-null response normalization, indented-code preservation and `.txt` sidecar correction. Independent reviewer rechecked both final findings and reported **no issues found**. Review artifact: `/Users/patrick/.pi/agent/sessions/--Users-patrick-Development-pi-packages--/subagent-artifacts/outputs/1a67e7dd-d99f-4bf8-8c39-64c6b4933458/reviews/final.md`.
- Five resource/provider checks passed using actual installed discovery and actual Pi SDK, covering checkout/Git/standalone payload discovery, namespace/model inheritance/two-tool definitions and source/dist startup without network/stdout (`/tmp/crawl-final-resources.log`). These checks inspect a dry-run payload, not an npm publication.
- Actual SDK crawl/read/query/reload and real Trafilatura 2.2.0 text extraction passed, including generated `.txt` outline, relevant capped query output and full/raw-source recovery (`/tmp/crawl-final-sdk.log`). Character counts in the summary include typed details; model-facing cap assertions are separate.
- Actual interactive CLI/PTY passed: crawler and disabled presets, authenticated status, real `/tools` picker and enabled/disabled dumps, reload/status (`/tmp/crawl-interactive-smoke-retry.log`). An initial harness sent Escape and the next command together; the corrected event-driven harness waited for editor restoration. No extension workaround was added.
- Actual print CLI with only `crawl,crawl_read` fetched the known fixture and returned `# Allowed child marker` (`/tmp/crawl-print-tool.log`); actual JSON status emitted valid requested custom-message events without unsolicited startup logging (`/tmp/crawl-json-status.log`). Print status alone exits cleanly but the host does not print custom messages as final assistant text; JSON/TUI expose status.
- Explicitly authorized `crawl4ai.scrape` child **passed** with parent `crawl,crawl_read` inactive. The real session records exactly `crawl` then `crawl_read`, inherited `openai-codex/gpt-6.1-sol`, and a source-backed heading/body report with saved paths. Child run `2c5de6eb-cdb9-498c-ad52-1c0a35af2853`; native status/transcript under `/var/folders/px/t5gd1pzs7sv9wq74bkk0jhb40000gn/T/pi-subagents-uid-501/async-subagent-runs/2c5de6eb-cdb9-498c-ad52-1c0a35af2853`. Initial isolated SDK launch could not resolve the host; the same governed protocol succeeded with the supported `PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT` override, not a foreground/shell fallback (`/tmp/crawl-authorized-child-smoke-retry.log`).
- Native Trafilatura quality/composition check passed on rendered linked prose plus a separate article with headings/table/fenced code: Markdown retained table values/code, `includeLinks=false` omitted the link target and true retained it. Text intentionally lacks Markdown presentation; navigation was dropped. BM25 composition selected the relevant budget section, kept predecessor/raw HTML, and an unrelated query produced a recoverable empty file. Missing dependency preserved exact HTML and ordinary crawling still worked. Python 3.14 / Trafilatura 2.2.0 installed only in validation venv `/tmp/pi-crawl-validation-venv`; no runtime installer/global configuration change. Log `/tmp/crawl-native-quality-smoke.log`, outputs `/var/folders/px/t5gd1pzs7sv9wq74bkk0jhb40000gn/T/crawl-native-quality-JZSlcE/quality.json`. Native extraction is not a universal reconstruction guarantee.
- `git diff --check` passed; nothing staged, committed or pushed. Starting and timeout patches were retained for provenance; unrelated host/ESM changes and external HEAD transition from `1292dc1e` to `036ef2d0` were not reverted. Current-tree source was reviewed independently; this is not an assertion that unrelated externally edited files stopped changing.

### Historical service blocker — resolved in production

Authenticated service health reports Crawl4AI **0.9.4**. Genuine live rendered-delay and typed cache miss→hit/bypass tests **passed**. Deep traversal test **failed** with HTTP 400: `field 'deep_crawl_strategy' is not permitted on CrawlerRunConfig from an untrusted request`. No depth/maxPages/include/exclude/domain success is claimed; actionable rejection is not AC1 completion. No HTTPS fallback, alternate browser or server-security bypass was used.

The planned workspace live command initially selected a global configuration from its package working directory and could not fetch; project JSON takes precedence over environment settings. Running the same strict suite from the actual configured project root yielded **2 passed / 1 failed**, isolating the genuine server-policy blocker:

```sh
CRAWL4AI_LIVE=1 CRAWL4AI_LIVE_TARGETS_FILE=/tmp/crawl-live-targets.json \
  node node_modules/jest/bin/jest.js --config packages/pi-crawl4ai/jest.config.cjs \
  --runInBand packages/pi-crawl4ai/src/features/crawl/liveCrawl.integration.test.ts
```

Evidence: `/tmp/crawl-final-live-root.log`. Public controlled HTML/link fixtures used httpbin base64 because the production browser correctly rejects private targets. Fixture size was bounded to avoid the public service's long-URL limits; credentials stayed outside logs.

**Production resolution — 2026-09-30:** user explicitly approved completing the deployment. Discovery-services source `52d583da93ee51670507fc4e7d10fb277eab3f35` was pushed to staging, and production deployment pin `0b81e4a` changed only Crawl4AI to immutable digest `sha256:185df5dae5091775c4345ef037e252b89ccfdf60815b5a7bfc1fb6a4c93319bd`. Registry manifest config matches locally tested image `sha256:8a75456b0fc04485333c5787570ae77a657c21e66514fd314b05fd0c136a94e7`. Dokploy auto-deployment `03Gn75um_sBzWK6I6cSmF` completed; container `f5f499f9e978` is healthy, while SERP/SearXNG kept their existing containers and seven-hour uptimes.

The same genuine root-configured command above now **passes all three live cases**, including actual seed-only depth, maxPages and domain/include/exclude traversal (`/tmp/crawl-production-deep-live.log`). Parent separately reran all 40 installed upstream/helper tests, nine patched-source/API checks and the immutable-image browser test (`/tmp/discovery-deep-parent-tests.log`, `/tmp/discovery-deep-parent-source.log`, `/tmp/discovery-deep-parent-container.log`). The browser gate verified branching attempted-page budgets, deep-stream rejection and zero direct/private target hits. Final security review found no issues; seven unmodified upstream security-file hashes match the exact pinned source.

Production checks (`/tmp/discovery-deep-production-security.json`): unauthenticated crawl 401; loopback and metadata targets 400; HTTP/HTTPS IP-echo targets 200 with ISP origins `166.0.50.212` / `46.203.153.149`, not host `95.216.34.110`; public :11235 closed/unreachable. Remote container inspection confirms only `172.18.0.1` and `10.8.0.1` port bindings and the published digest. Recent logs were checked against configured API/proxy secret values in memory without printing them: no leak. Production credentials/configuration were not changed.

The final independent acceptance audit confirms AC1–AC6 with no remaining behavioral gate. All three work files are done and moved together to the finished directory; no deferred engine/UI/parser features were added. The original and rollout repositories retain unrelated work; source/pin releases use isolated, explicitly scoped worktrees. Isolated client release at base `e2e58e1` passed clean `npm ci`, root tests (213 Crawl4AI passed / three opt-in skipped, plus other workspace regressions), typecheck/build, two actual SDK source/dist provider tests, npm pack dry-run and diff checks. With the existing operator configuration supplied as ignored readonly symlinks, the isolated release also passed all three strict production live cases (`/tmp/crawl-release-live.log`). Only Crawl4AI source/docs/agents, its required host-peer/Jest prerequisites, regenerated lockfile and the three completed work files are included; unrelated skill/config work is excluded. The repository defines no lint script (`npm run lint` reports Missing script), so no lint success is claimed. `npm audit` reports nine existing dependency warnings including two critical; every affected version already exists at base HEAD and remains unchanged. Broad unrelated dependency upgrades were not included.

## Explicitly Not Testing

- Deferred JSON/schema/provider engines, outputSchema/codemode contracts, prompts, custom renderers, capability registry, manifest migration or parser completeness.
- Exact copy/colors, framework/TypeScript guarantees, source-string absence as runtime command proof or tests proving Markdown files exist.
- Universal extraction/token savings across arbitrary websites, network/proxy uptime or anti-bot bypass.
- Duplicate browser tests of local budget/ranking/filesystem logic.
- A guarantee that client HTTP abort cancels server-side browser work.
- Unrelated configs or already repaired ESM tooling.

## Open Questions

None. The required operator-approved deployment and original genuine traversal gate are complete; upstream SSRF/egress protections remain intact.

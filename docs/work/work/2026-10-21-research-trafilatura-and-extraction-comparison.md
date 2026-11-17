---
status: backlog
owner: engineering
last_reviewed: 2026-10-21
canonical_ref: none
---

# Competitive review: romek-rozen/pi-crawl4ai and the Trafilatura pipeline

## Type

research

## Trigger

Follow-up to [2026-10-21-research-crawl-package-landscape.md](2026-10-21-research-crawl-package-landscape.md).
While deciding whether to keep maintaining `packages/pi-crawl4ai`, a user asked to inspect the
only credible third-party substitute, then to compare its extraction implementation with ours
against the issues already documented in
[2026-10-21-bug-crawl-content-preservation-and-contract.md](../finished/2026-10-21-bug-crawl-content-preservation-and-contract.md).

This document **supersedes** the "name collision" row of the landscape note, which could only
describe the third-party package from its registry description.

## Method and evidence quality

Cloned `https://github.com/romek-rozen/pi-crawl4ai` at commit `0800955` (v0.3.2, 2026-09-29) into
`/tmp/romek-inspect`. All thirteen extension source files, the five test files, `README.md`,
`ROADMAP.md`, `TODO.md` and `CHANGELOG.md` were read. Distribution facts came from the npm registry
API (`registry.npmjs.org/pi-crawl4ai`), `api.npmjs.org/downloads`, and the GitHub REST API. Nothing
was installed; nothing in this repository was modified.

All line citations below refer to that commit. Our side is cited from the current working tree.

Evidence grading: **SOURCE-READ** (upstream code at the pinned commit), **VERIFIED HERE** (checked
against our code at the cited line), **INFERRED**.

## 1. Distribution and maintenance facts

| Fact | Value |
| --- | --- |
| npm name / version | `pi-crawl4ai` @ `0.3.2` (11 versions, first published 2026-04-24) |
| Maintainer | `romek_rozen` (single maintainer) |
| License / runtime deps | MIT / **none** (4 peer deps: `typebox`, `pi-ai`, `pi-tui`, `pi-coding-agent`) |
| Downloads | 420 in the last month |
| Repo | 33 commits, **1 contributor**, 9 stars, 2 forks, created 2026-04-22 |
| Issues / PRs / releases | 2 issues ever (both closed), 0 open, 1 tagged release (`v0.3.1`) |
| CI | **None** — `.github/` contains only `FUNDING.yml` |
| Last push | 2026-09-29 |
| Commits per month | 14 (Apr) → 12 (Jul) → 6 (Aug) → **1 (Sep)** |
| Own `TODO.md` | Admit the three shipped agents are untested end-to-end ("needs a live `crwl` install + real crawl") |

Size comparison (extension source vs tests):

| | Files | Source lines | Test lines |
| --- | --- | --- | --- |
| Theirs | 13 src / 5 test | 1,847 | 636 |
| Ours | 25 src / 14 test | 3,622 | 2,412 |

We carry roughly twice the source and nearly four times the test surface. That is the real cost of
the keep-or-adopt decision and it is not offset by anything in this document.

## 2. What it is architecturally

**SOURCE-READ.** A local CLI wrapper. `runner.ts` spawns `crwlPath`; `args.ts` maps parameters to
`crwl crawl` flags; `resolve.ts:15-46` searches `$CRAWL4AI_VENV`, `<cwd>/.pi/extensions/crawl4ai/.venv`,
`~/.pi/extensions/crawl4ai/.venv`, a legacy path, `which crwl`, then `/tmp/crawl4ai-venv`.
`/crawl4ai-install` builds isolated Python venvs for `crawl4ai>=0.9.4` and `trafilatura>=2.2.0`.
A repository-wide search for `fetch(`, an HTTP client, `base_url`, `apiToken` or `bearer` returns
nothing but documentation URLs — there is no remote Crawl4AI client.

**Consequence (the decisive structural difference).** Because `crwl` runs as a trusted local
process, it never passes through Crawl4AI's `Provenance.UNTRUSTED` gate. It therefore offers
`question` (LLM Q&A), `json_extract` (LLM extraction), `schema_path` + `extraction_config`
(CSS/XPath), and raw `browser_config`/`crawler_config` key=value passthrough — capability that is
**permanently closed to us** by the remote design. They traded governance for capability; we traded
capability for governance. A search for `proxy`, `ssrf` or `allowlist` in their extension returns
zero hits: the concepts do not exist in their codebase.

## 3. Capability comparison

| Dimension | Theirs | Ours |
| --- | --- | --- |
| Egress | Local Python + browser subprocess | Operator-managed remote service; client never sends proxy settings |
| URLs per call | **Single URL only** | Arrays, with deep crawl |
| Deep crawl controls | `max_pages` only | strategy, depth, pages, globs, domains, `scoreThreshold`, bounded server capability |
| Output | Files under `./.crawl4ai/outputs/<domain>/<format>/`; inline reply is a path + "use the read tool" | Session directory + `crawl-manifest.json`, announced last |
| Session / manifest | **None** (zero hits for `manifest`, `retention`, `cleanup`, `provenance`, `redact`) | Session isolation, retention, provenance, credential redaction, path containment |
| Uniqueness | 6-char SHA-1 path suffix (`resolve.ts:226-262`) | Unique session directories |
| Read-back | Plain Pi `read` on a path | `crawl_read`: outline/chunks/window/full, BM25 query ranking, URL→file resolution |
| Harness neutrality | Pi-runtime coupled (`pi-coding-agent`, `pi-ai`, `pi-tui` end to end) | Harness-neutral cores exported from root `src/research.ts` |
| Prompt templates | 4 (`/crawl4ai`, `-scrape`, `-extract`, `-scrape-and-extract`) | None (agents only) |
| Status / test commands | `/crawl4ai-status` with a persistent footer, `/crawl4ai-test` runs a real crawl | `/crawl-status` (on-demand only, no footer), no end-to-end smoke command |

Both ship three agents (`scrape`, `crawl`, `extract`) with the same names and the same
inherit-the-active-model rule. Independent convergence.

## 4. The extraction pipelines side by side

| | Ours (`src/features/crawl/trafilatura.ts`, 127 lines) | Theirs (`extensions/crawl4ai/trafilatura.ts`, 248 lines) |
| --- | --- | --- |
| Invocation | `python -c <script> <format> <includeLinks>` — Trafilatura **Python API** | the `trafilatura` **CLI**: `--output-format`, `--links`, `--formatting`, `--images`, `--no-tables` (`:178-181`) |
| Option surface | `include_tables=True`, `include_formatting=True` **hardcoded** (`:19-20`); only links toggles | all four toggleable |
| Images | not supported at all | `--images` plus metadata-driven supplementation |
| After extraction | output is final | `appendMarkdownTables` + `appendImageReferences` repair it |
| Extra payload reads | none | `media.images` and `markdown.raw_markdown` via `parseCrawlDocument` (`:28-59`) |
| I/O bounds | 20 MiB in (`:3`), 20 MiB out (`:4`), 64 KiB stderr (`:5`) | none — unbounded string accumulation |
| Timeout model | caller's **absolute crawl deadline** (`:36-37`, `:122-124`) | a **fresh** `timeoutSec` per extraction (`runner.ts:47-52`) |
| Kill grace | 250 ms (`:6`, `:72`) | 5,000 ms (`runner.ts:51`) |
| Teardown | removes every listener and timer on close (`:97-104`) | `settled` guard only |

## 5. What their implementation does better

### 5.1 Table and image supplementation

This lands directly on a limitation our README states as permanent ("There is no table/image
supplementation or full Markdown parser"). They built it.

- **`appendImageReferences` (`trafilatura.ts:67-101`)** — scans the extracted content for existing
  `![alt](src)` targets, resolves each `media.images[].src` against the page URL, dedupes on the
  *resolved* href, then appends only the images Trafilatura pruned with its DOM section, with an
  `alt || "Image"` fallback and a text-mode rendering.
- **`appendMarkdownTables` (`trafilatura.ts:104-160`)** — extracts GFM table blocks from Crawl4AI's
  own Markdown (requiring a real `-{3,}` separator row), computes a signature from
  whitespace-normalized flattened cells joined by `\u001f`, and for each absent table does something
  subtle: **if its flattened cell text appears in the extracted content it replaces in place**
  (position-preserving) rather than appending; otherwise it appends. Text mode renders tab-separated
  rows.
- Call order in `tool.ts:309-313`: supplement first, then BM25 (`:317-323`), then write (`:327-328`).

Their README states the intent plainly: "Trafilatura can prune an image section or flatten table
cells. The extension therefore supplements images from Crawl4AI media metadata and table structure
from Crawl4AI Markdown."

Why this is cheap for us: both inputs are **already in the Crawl4AI response we receive and discard**
(`media.images`, `markdown.raw_markdown`). Client-only, no server change, no new dependency. Our
Python-API script needs only more argv, since `include_images=` and `include_tables=` are already
real `extract()` parameters.

### 5.2 Other learnings

- **A real end-to-end smoke command.** `/crawl4ai-test` performs an actual crawl. We have no
  equivalent, and our own docs concede that a health GET is not proof of traversal.
- **Published per-mode token measurements.** Their README carries a tiktoken `o200k_base` table
  against a live page (2,681 → 307 tokens across modes, up to 88.5% reduction). We publish none.
- **Prompt templates.** Four, including a chained scrape→extract. Our `AGENTS.md` defers prompt
  templates deliberately, so this is a decision to revisit, not an oversight.
- **Cache-eviction command** (`/crawl4ai-clear-cache`). Their `args.ts` forces `-c cache_mode=enabled`
  because "Crawl4AI CLI starts with cache_mode=BYPASS by default" — independent corroboration of the
  cache-default divergence recorded in the landscape note.
- **Pairing invariant for artifacts.** `ensureUniqueTrafilaturaOutputPaths` (`resolve.ts:226-245`)
  keeps the extracted file and its `.raw.html` sibling on one shared stem, allocated under a
  directory-scoped `withFileMutationQueue` lock (`tool.ts:238-239`) so the raw file reserves the stem
  before another crawl can take it. We get the same guarantee structurally from session directories
  plus `pages[].rawHtmlFile` (crawlCore.ts:196), so this is a design equivalence, not a gap — but the
  explicit pairing rule is worth stating in our own docs.

## 6. What our implementation does better

1. **Filtering does not destroy the source.** Their Trafilatura branch filters and then writes:
   `extractedOutput = filtered.content` (`tool.ts:323`) → `writeFile(extractedPath, …)` (`:327-328`).
   The pre-filter text is never persisted; the non-Trafilatura branch behaves the same
   (`:349-350`, `:353`). A threshold that matches nothing therefore empties the artifact with no
   recovery path. Our equivalent keeps the pre-filter content as `sourceFile` and
   `artifact.sourceContent` (`crawlCore.ts:205-207`), which is exactly the recovery contract our
   README marks non-negotiable. Independent evidence that this design decision is load-bearing.
2. **Extraction shares the crawl deadline.** They start a fresh `timeoutSec` budget
   (`runner.ts:47-52`), so a call can exceed the caller's timeout by up to a full extraction window.
   We pass the crawl's absolute deadline and reject before spawning if it has passed
   (`trafilatura.ts:36-37`, `:50-51`, `:122-124`).
3. **Bounded I/O.** We cap input, output and stderr; they accumulate unbounded strings.
4. **Listener and timer teardown** on close (`trafilatura.ts:97-104`) versus a `settled` guard alone.

Both implementations converged independently on the two things that matter conceptually: writing
raw HTML **before** extraction and returning its exact path when extraction cannot run
(ours: `crawlCore.ts:196-197`; theirs: `tool.ts:232-253`), and tolerating stdin `EPIPE` instead of
reporting it as an extraction failure (ours: `trafilatura.ts:76-79`; theirs: `tool.ts`/trafilatura
stdin error handler).

## 7. Mapping onto our documented issues

| Documented issue | Does their code solve it? | Action for us |
| --- | --- | --- |
| README: "no table/image supplementation" | **Yes** — `trafilatura.ts:67-160` | Adopt the mechanism; expose the three toggles we currently hardcode |
| AC1: Trafilatura kept the roster heading but dropped the nine cards; a Press page dropped an explicit list | **No.** Their repair covers tables and images only; lost `<div>`/list *text* is not recovered, because they never diff plain blocks against `raw_markdown` | Our planned work stands: render text from acquired HTML with a real parser, default to raw Markdown, keep the unfiltered original |
| AC2: extraction/filtering preserve independent originals and provenance | **Partially** — raw HTML is preserved beside the extraction, but nothing is preserved for filtering | Keep our `sourceFile` contract. If we adopt supplementation, `sourceFile` must be the **supplemented pre-filter** content so recovery does not hand back a lossier version |
| AC5: match-centered reads of oversized sections | **No equivalent** — their read path is plain `read` on a path | Unchanged; we remain ahead |
| AC6: HTTP status/content-type, `unsupported_document` | **No** — they have no HTTP layer | Unchanged |

## 8. What to adopt, in order

1. **Expose the toggles we hardcode** — `includeTables`, `includeImages`, `includeFormatting`. A few
   argv slots in our Python script; it is the precondition for the rest.
2. **Add table and image supplementation**, using their position-preserving signature
   reconciliation, and record it: `extractor: { name, supplemented: { tables, images } }` in the
   manifest and result, so native and restored content are never ambiguous. Keep the Python-API
   invocation rather than switching to the CLI.
3. **Add drop-detection** (block-level diff of the extracted output against `raw_markdown`) and fold
   it into the usable-content reporting already planned in AC6. This is the higher-value
   generalization: it would have caught the nine-roster-cards incident at the moment it happened,
   and a reported omission is actionable whereas an undetected repair is still an unprovable fidelity
   claim.
4. **Add `/crawl-status smoke`** — a real end-to-end crawl plus extraction, mirroring their
   `/crawl4ai-test`.
5. **Publish measured token numbers** for our modes, as their README does.
6. **Preserve our four advantages with regression tests**: bounded I/O, remaining-deadline
   budgeting, listener/timer teardown, and `sourceFile` surviving a zero-match filter.

**Ordering constraint.** Supplement before BM25, then persist the pre-filter supplemented content as
`sourceFile` (their order). If drop-detection is added, its report must describe the
pre-supplementation diff, or the reported omission will understate what Trafilatura actually dropped.

## 9. Verdict

Not a substitute. A competent, well-executed alternative with eleven releases still has no manifest,
no retention, no provenance, no session isolation and no harness-neutral export — structurally out of
reach for a trusted-local-subprocess design, not accidental gaps. Its `ROADMAP.md` (crawl history
search, dashboard, usage statistics, parallel crawl, crawl profiles) is our current feature set,
which suggests the ecosystem re-derives this design rather than replacing it.

Two honest caveats, both recorded rather than argued away:

- We carry about 2× the source and 4× the test surface, against a single-maintainer upstream.
- Their trusted-local design does more than ours structurally can whenever the task is *LLM or
  CSS/XPath extraction of structured data*. If that need ever becomes primary, the answer is a
  second, explicitly authorized package, not a replacement of this one.

## 10. Sources and open items

**Primary:** `github.com/romek-rozen/pi-crawl4ai` @ `0800955` — `extensions/crawl4ai/{tool,types,args,resolve,runner,trafilatura,bm25,commands,index,render,format,validate}.ts`,
`test/{args,bm25,resolve,trafilatura,validate}.test.ts`, `README.md`, `ROADMAP.md`, `TODO.md`,
`CHANGELOG.md`, `package.json`; `agents/*.md`, `prompts/*.md`.

**Metadata:** `registry.npmjs.org/pi-crawl4ai`, `api.npmjs.org/downloads/point/last-month/pi-crawl4ai`,
`api.github.com/repos/romek-rozen/pi-crawl4ai` (+ `/issues?state=all`, `/releases`).

**Read-only local:** `packages/pi-crawl4ai/src/features/crawl/{trafilatura,crawlCore,presentation,bm25}.ts`
and `packages/pi-crawl4ai/README.md`.

**Not determined:** whether their shipped agents work end-to-end (their own TODO says untested);
whether `crwl` behaviour differs across the Crawl4AI versions they permit (`>=0.9.4`); the token
cost of supplementation on real pages (unmeasured here); and their issue-response latency, given
only two issues have ever been filed.

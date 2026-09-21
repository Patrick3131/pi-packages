---
status: done
owner: engineering
last_reviewed: 2026-09-21
canonical_ref: 2026-09-21-feature-pi-recap-user-messages.md
---

# pi-recap: browse a session as user questions with short, expandable answers — To-Do

## Slices

| Slice | Owns (paths) | Depends on |
| ----- | ------------ | ---------- |
| Core parsing | `packages/pi-recap/src/args.ts`, `packages/pi-recap/src/session.ts`, `packages/pi-recap/src/text.ts`, `packages/pi-recap/test/args.test.ts`, `packages/pi-recap/test/session.test.ts`, `packages/pi-recap/test/text.test.ts` | - |
| Rendering | `packages/pi-recap/src/html.ts`, `packages/pi-recap/src/text-report.ts`, `packages/pi-recap/src/escape.ts`, `packages/pi-recap/src/markdown.ts`, `packages/pi-recap/test/html.test.ts`, `packages/pi-recap/test/markdown.test.ts`, `packages/pi-recap/test/text-report.test.ts` | - |
| Summarize | `packages/pi-recap/src/summarize.ts`, `packages/pi-recap/src/config.ts`, `packages/pi-recap/test/summarize.test.ts`, `packages/pi-recap/test/config.test.ts` | - |
| Extension wiring | `packages/pi-recap/src/index.ts`, `packages/pi-recap/test/extension.test.ts`, `packages/pi-recap/package.json`, `packages/pi-recap/tsconfig.json` | Core parsing, Rendering, Summarize |
| Repo registration | `package.json`, `README.md`, `AGENTS.md`, `packages/pi-recap/README.md`, `packages/pi-recap/AGENTS.md`, `packages/pi-recap/CONTEXT.md` | Extension wiring |

## Tasks

- [x] Create package skeleton (`package.json`, `tsconfig.json`, `AGENTS.md`, `CONTEXT.md`, `README.md`).
- [x] Implement `/recap` argument parsing with help, aliases, and validation.
- [x] Implement JSONL parsing, branch walking, session-file resolution, and exchange extraction that drops tool/thinking/system noise.
- [x] Implement truncation with line-boundary previews and full-text retention.
- [x] Implement the escaping-first Markdown subset renderer and fence-aware preview split.
- [x] Implement the standalone HTML renderer with TOC, search, expand/collapse, and safe escaping.
- [x] Implement the plain-text renderer.
- [x] Implement transcript building, chunking, response parsing, summary cache (hash-keyed), incremental planning, and cost estimation.
- [x] Implement the model runner with cheap-model selection, `reasoning: "off"`, capped `maxTokens`, session id forwarding, confirm gate, usage reporting, and failure fallback.
- [x] Wire the extension: register `/recap` + `/user-messages`, resolve current/past sessions, write files, open browser, notify.
- [x] Implement `/recap auto on|off|status` persistence and the `turn_end` background summarizer.
- [x] Rework the HTML UI: toolbar with search/filters, scrollspy TOC, keyboard navigation, theme toggle, copy buttons, accessibility landmarks.
- [x] Register the package in root `package.json` and update root and package docs.

## Validation

- [x] `npm test --workspace=packages/pi-recap` passes — 61 tests, 0 failures.
- [x] `npm run typecheck --workspace=packages/pi-recap` passes; full-repo `npm run typecheck --workspaces` clean.
- [x] `npm run lint --workspace=packages/pi-recap` and `npm run build --workspace=packages/pi-recap` pass.
- [x] Mutation evidence: neutralized `escapeHtml` fails 2 HTML tests; relaxed summary cache hashing fails 2 summarize tests.
- [x] UI evidence: toolbar/filter/scrollspy/keyboard/theme markers asserted in `html.test.ts`; both inline scripts syntax-checked from a real generated page; browser review on the current session.
- [x] Live summarize through real provider auth (`opencode-go/deepseek-v4-flash`): 284 input/284 output tokens, $0.000213; second run 0 calls with 2 cached.
- [x] Manual browser check on real sessions (3, 19, and 46 MB inputs): 98.0–99.94% smaller HTML, rendered Markdown, TOC/search/expanders intact.
- [x] `/recap --text` E2E writes a `.txt` recap; `--no-open` suppresses the browser.
- [x] Full workspace test run: all packages pass.

## Docs

- [x] `packages/pi-recap/README.md` documents commands, flags, files, and config.
- [x] `packages/pi-recap/CONTEXT.md` records module boundaries, Markdown safety model, and cache format.
- [x] Root `README.md` and `AGENTS.md` list the package.

## Completion

- [x] Every acceptance criterion is verified
- [x] Test plan records coverage decisions and evidence
- [x] All three package files moved to `docs/work/finished` with `status: done`

---
owner: repo-maintainers
last_verified: 2026-04-15
applies_to: packages/pi-work/**
inherits_from: ../../AGENTS.md
canonical_for: pi-work package conventions
---

# pi-work — AGENTS.md

## Purpose

General-purpose docs-as-work package: skills + `/work` extension + scaffold.

## Scope

- `src/` — extension and pure discovery/parse helpers
- `skills/` — operator skills plus bundled templates and testing policy (project-agnostic paths only)
- `scaffold/docs/work/` — templates copied by `/work init`
- `test/` — node:test unit tests

## Rules

- Keep the package **project-agnostic**. Defaults may be `docs/work`, but never hardcode a company/product name.
- Prefer pure functions in `config` / `parse` / `discover` / `format` / `prompts` / `scaffold` for testability.
- Extension UI stays thin: select → detail → `sendUserMessage` handoff.
- Skills remain `disable-model-invocation: true`.
- Do not overwrite user files in scaffold.
- Companion naming is part of the public contract: `-to-do-list.md`, `-test.md`.
- `/work` handoffs must embed full skill bodies (`formatSkillBlock`); never rely on `/skill:` expansion for extension messages.
- Flat folders only; type grouping is UI-only via `formatSelectItems`.
- Readiness logic lives in `src/readiness.ts` and must stay aligned with the skills.
- Templates under `skills/_shared/templates/` are the canonical output shape; update them and the package README/CONTEXT together when the work-document contract changes.
- `skills/_shared/testing-policy.md` is the canonical guidance for avoiding speculative or duplicate tests.

## Commands

```bash
npm test --workspace=packages/pi-work
npm run typecheck --workspace=packages/pi-work
```

## Change Policy

- Update `README.md` when commands or env vars change.
- Update scaffold templates carefully; init never overwrites existing files, but new projects get the new text.

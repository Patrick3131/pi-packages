---
owner: repo-maintainers
last_verified: 2026-09-17
applies_to: packages/pi-delegation/**
inherits_from: ../../AGENTS.md
canonical_for: pi-delegation package conventions
---

# pi-delegation — AGENTS.md

## Purpose

Make the delegation policy a standing instruction for sessions that can
delegate, without putting Pi-specific mechanics into a repository's `AGENTS.md`
where other harnesses would read them.

## Scope

- `src/guidance.ts` — the policy text and the pure injection decision, no pi API
- `src/index.ts` — the only place that touches pi: one `before_agent_start`
  handler
- `test/` — node:test unit tests

## Rules

- **Gate on the capability, never on the repository.** The policy applies when
  the `subagent` tool is active in the session. Do not add path or `cwd` checks:
  the same extension runs in every repository, and a repository that has nothing
  to delegate to simply has no `.pi/agents`.
- **Return `undefined` to decline.** The handler must never return a
  `systemPrompt` that drops or reorders what Pi and earlier extensions built.
  Append to `event.systemPrompt`, never replace it.
- **Keep the heading and the marker the same constant.** `DELEGATION_HEADING` is
  both the injected heading and the idempotence check. Renaming one without the
  other silently allows a duplicated policy when an `APPEND_SYSTEM.md` copy
  exists.
- **Keep the "keep with the parent" limits.** Without them, "delegate by default"
  becomes ceremony on small sequential edits. Reviewers are named as
  fresh-context and read-only for the same reason.
- **Name agents that actually resolve.** Repository agents (`work-item-*`,
  `implement-tdd-review-*`, `test-validator`) must stay phrased as conditional on
  the repository providing them; user and builtin agents (`reviewer`, `scout`,
  `oracle`, `researcher`, `delegate`) ship with `pi-subagents` and are always
  available when `subagent` is.
- **Stay dependency-free.** No imports beyond pi's type-only `ExtensionAPI`, and
  no dependency on another pi-packages package.
- **Never do work in the handler.** It runs once per user prompt: no I/O, no
  discovery, no logging.

## Commands

```bash
npm test --workspace=packages/pi-delegation
npm run typecheck --workspace=packages/pi-delegation
```

## Change Policy

- Update `README.md` and `CONTEXT.md` together when the policy, the gate, or the
  command surface changes.
- The policy text is operator-facing behaviour, not prose: change it only with an
  explicit reason, and update the tests that assert the parent-owned limits.

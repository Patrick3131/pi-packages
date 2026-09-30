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
  the same extension runs in every repository. This gate controls guidance
  visibility only; tool availability never grants delegation authority.
- **Return `undefined` to decline.** The handler must never return a
  `systemPrompt` that drops or reorders what Pi and earlier extensions built.
  Append to `event.systemPrompt`, never replace it.
- **Keep the heading and the marker the same constant.** `DELEGATION_HEADING` is
  both the injected heading and the idempotence check. Renaming one without the
  other silently allows a duplicated policy when an `APPEND_SYSTEM.md` copy
  exists.
- **Keep direct execution and the authority gate.** Delegation requires the
  current request or applicable user/project instructions. Retain parent-owned
  decisions, verification, acceptance, publication, and small sequential edits.
  Reviewers are fresh-context and read-only; extra stages must earn their cost.
- **Use existing builtin roles, not required project phase agents.** `worker`,
  `reviewer`, `scout`, `researcher`, and `oracle` ship with `pi-subagents`.
  Resolution may be overridden or restricted; availability is not authority.
- **Recover from actual state.** Bound authorized work with exact paths and
  concise evidence; preserve completed work after interruption rather than
  replaying phases. Per-run controls remain host-owned, not a new runtime.
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

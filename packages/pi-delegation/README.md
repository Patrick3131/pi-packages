# pi-delegation

Injects the delegation policy into Pi's system prompt, **only in sessions that
can actually delegate**.

## What it does

Pi assembles a system prompt per turn and fires `before_agent_start` before the
agent loop, giving extensions the chance to replace it. This extension appends a
short policy to that prompt when the `subagent` tool is active:

- direct execution by default; delegation only when authorized by the current request or applicable user/project instructions, never tool availability alone;
- bounded handoffs to existing builtin worker/reviewer/scout/researcher roles, with task-selected fresh or forked context and concise evidence rather than required project phases; fork may reuse current investigation to avoid repeated reads, while independent reviewers remain fresh and read-only;
- parent-owned decisions, verification, acceptance, publication, and actual-state recovery after interruption.

It returns `undefined` when the policy does not apply, which leaves the prompt
exactly as Pi and any earlier extension built it.

## Why it is an extension and not `APPEND_SYSTEM.md`

`APPEND_SYSTEM.md` applies to every session in every repository, and it lives
outside Pi's package mechanism. This extension is capability-gated and travels
with the rest of the Melon Pi packages:

| Property | Behaviour |
| --- | --- |
| Capability-gated | Appends only when `selectedTools` includes `subagent`, so a preset without subagents stays untouched |
| Pi-only | Never runs outside Pi, so nothing Pi-specific leaks into `AGENTS.md` or a Codex/Claude Code session |
| Idempotent | A prompt that already carries the heading is left alone, so an `APPEND_SYSTEM.md` copy cannot double up |
| Updateable | Ships inside the `pi-packages` git package, so `pi update --extensions` updates it everywhere at once |

## Session shape

```text
before_agent_start (once per user prompt)
  selectedTools includes "subagent"?         no  ─▶ return undefined (prompt untouched)
  prompt already has "## Delegation policy"? yes ─▶ return undefined (no duplication)
  otherwise                                      ─▶ systemPrompt + policy
```

## Tuning the policy

`src/guidance.ts` holds the text as one exported constant, so the policy is
reviewable and testable without a Pi runtime. `DELEGATION_HEADING` is both the
injected heading and the idempotence marker; change them together or a duplicated
policy stops being detected.

Keep both the authorization gate and the "keep with the parent" limits. Capability controls whether guidance is visible, not whether a child may launch. No project phase agents, chain files, scripted workflow, or new runtime are required.

## Commands

```bash
npm test --workspace=packages/pi-delegation
npm run typecheck --workspace=packages/pi-delegation
```

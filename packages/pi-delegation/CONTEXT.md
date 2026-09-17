# pi-delegation — CONTEXT.md

## Purpose

Explain how the delegation policy reaches the system prompt, what it depends on,
and which alternative placements were rejected. Package rules live in
`AGENTS.md`.

## Why the policy is injected, not written down in the repository

The obvious home for "delegate by default" is the repository's `AGENTS.md`. That
file is loaded by every harness that reads the `AGENTS.md` convention, so the
instruction would also land in Codex and Claude Code sessions, where `.pi/agents`
and the `subagent` tool do not exist. An instruction nothing can act on is worse
than no instruction: it invites an agent to claim it delegated.

The second obvious home is `~/.pi/agent/APPEND_SYSTEM.md`. That one is correctly
Pi-only, but it is global to every repository and preset and lives outside Pi's
package mechanism, so it needs a manual restore step on a new machine and cannot
be conditional.

An extension has neither problem. It ships inside the `pi-packages` git package,
so `pi update --extensions` updates it everywhere at once, and it can decide per
turn whether the policy applies.

## How Pi's hook is used

Pi builds the system prompt before the agent loop and fires
`before_agent_start`, whose result may replace the prompt for that turn:

```ts
export type ExtensionHandler<E, R = undefined> = (
  event: E,
  ctx: ExtensionContext,
) => Promise<R | void> | R | void;
```

with `BeforeAgentStartEvent.systemPrompt` (the fully assembled prompt),
`BeforeAgentStartEvent.systemPromptOptions` (the same structured options Pi used,
including `selectedTools`), and `BeforeAgentStartEventResult.systemPrompt` as the
replacement. Handlers from several extensions chain, and each later handler sees
the prompt as of the previous one, which is why declining with `undefined` matters:
returning the prompt unchanged would still count as a replacement by this
extension and could fight another one.

The check order is deliberate:

1. **Capability first.** `selectedTools.includes("subagent")` — `selectedTools`
   reflects the active preset and CLI flags, so `plan` or a `--tools` allowlist
   without subagents gets nothing.
2. **Idempotence second.** If the prompt already contains
   `## Delegation policy`, decline. That keeps a personal `APPEND_SYSTEM.md` copy
   of the same policy from being injected twice, which would waste tokens and
   read like two competing instructions.

## What is deliberately not here

- **No repository detection.** Checking for `.pi/agents` would make the policy
  depend on the working directory rather than on whether delegation is possible.
  In a repository without those agents the routing lines fall back to the
  user-level and builtin agents that ship with `pi-subagents`, which is the
  correct behaviour rather than an error state.
- **No agent definitions.** This package carries policy only. Agents stay where
  they are: repository workflow agents in `.pi/agents`, and the reusable ones in
  `pi-subagents`. Moving the melon-labs workflow agents here would make this
  package depend on one repository's process.
- **No model or preset awareness.** Thinking level, model, and tool counts are not
  evidence about whether delegation is appropriate; the operator's request is.

## Failure modes and their handling

| Failure | Behaviour | Why acceptable |
| --- | --- | --- |
| `systemPromptOptions.selectedTools` is absent | Declines; the prompt is untouched | Conservative: no policy is worse than a policy in a session that cannot act on it |
| The extension throws | Pi's extension loading already contains errors; the policy is missing rather than the turn failing | The policy is guidance, not a gate |
| Two copies installed (global and project package) | Pi deduplicates packages by source, and the heading check makes the second decline | No duplicated text |

## Verification

`src/guidance.ts` is pure, so the injection decision is unit-tested without a Pi
runtime: append when the tool is active, decline without it, decline when the
heading is already present, and one-blank-line separation. The handler itself is
typechecked against Pi's own `ExtensionHandler<BeforeAgentStartEvent,
BeforeAgentStartEventResult>`, which is the strongest available check over the
hook contract short of running Pi.

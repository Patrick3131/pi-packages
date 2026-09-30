# pi-delegation — CONTEXT.md

## Purpose

Explain how the delegation policy reaches the system prompt, what it depends on,
and which alternative placements were rejected. Package rules live in
`AGENTS.md`.

## Why the policy is injected, not written down in the repository

The shared method works directly by default in any host. Pi-specific delegation
mechanics belong in this extension, not repository `AGENTS.md` files also read
by other harnesses. Repositories retain their local scope, commands, architecture,
and permissions; no project phase-agent definitions are required.

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
   reflects the active preset and CLI flags, so a preset or `--tools` allowlist
   without subagents gets nothing. This is a visibility gate, not delegation
   authorization; the policy requires the current request or applicable
   user/project instructions to authorize a launch.
2. **Idempotence second.** If the prompt already contains
   `## Delegation policy`, decline. That keeps a personal `APPEND_SYSTEM.md` copy
   of the same policy from being injected twice, which would waste tokens and
   read like two competing instructions.

## What is deliberately not here

- **No repository detection.** Guidance visibility depends on capability, not
  `.pi/agents` or a working-directory allowlist. Authorized handoffs use existing
  builtin roles, subject to actual resolution and capability restrictions.
- **No agent definitions or workflow engine.** This package carries policy only.
  Bounded worker/reviewer handoffs need no project phase agents or scripted
  stages. Worker/research context is chosen per task: fork can reuse relevant
  current investigation and decisions to avoid repeated reading; fresh fits a
  bounded brief or avoids noisy/stale inherited history. Neither is the blanket
  worker preference. Independent reviewers remain fresh and read-only. Select
  context explicitly where supported; inheritance does not widen authority or
  replace current-file checks. Per-run deadline/checkpoint controls
  remain the installed host's responsibility, not global timeout changes.
- **No phase restart recovery.** Inspect actual worktree, validation, and handoff
  state after failure, preserve completed work, and distinguish infrastructure
  interruption from external blockers. Parent decisions and publication
  authority remain unchanged.
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

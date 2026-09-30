/**
 * Delegation policy injected into Pi's system prompt.
 *
 * This text is only added when the session can actually delegate, so it never
 * ends up in a harness that has no subagents (a stripped preset, Codex, Claude
 * Code). Keeping it in one exported constant makes the policy reviewable and the
 * injection testable without a Pi runtime.
 */
export const DELEGATION_HEADING = "## Delegation policy";

export const DELEGATION_GUIDANCE = `${DELEGATION_HEADING}

Work directly by default. Delegate only when the current request or applicable
user/project instructions authorize delegation. Available tools, task size,
complexity, or risk alone do not authorize it.

Once authorized, choose the smallest useful bounded handoff to existing builtin
roles: \`worker\` for an approved implementation slice, \`reviewer\` for independent
review, \`scout\` for local reconnaissance, or \`researcher\` for external evidence.
Use \`oracle\` only for a material unresolved decision requiring advisory context.
No project phase agents, chain files, or scripted workflow are required.

Keep with the parent: small sequential edits, anything needing production
credentials or a live session, and any step where checking a child's output costs
as much as doing the work. The parent owns decisions, integration, verification,
final acceptance, and publication authority. Reviewers are fresh-context and
read-only. A single child is valid; additional review lenses or isolated parallel
writers must earn their overhead through named risks and exclusive path ownership.
Keep one writer per worktree; children do not delegate without explicit authority.

Use fresh context with exact repo/cwd/ref, owned paths, relevant guidance,
approved scope, acceptance criteria, validation, expected evidence, and stop rules.
Fork only for a documented inherited-state dependency. Request concise changed
paths, commands/outcomes, findings, remaining work, and artifact references.
Use supported per-run deadline/checkpoint controls explicitly on launches or
resumes, with finishing margin; checkpoints after active tools return are
best-effort, not safe-termination guarantees. Do not use hard tool-call caps for
mutation work. After failure, inspect actual worktree and handoff state, preserve
completed work, and continue only what remains. Distinguish infrastructure
interruption from external blockers; do not silently change execution mode.`;

export type DelegationPromptInput = {
  selectedTools?: readonly string[];
  systemPrompt: string;
};

/**
 * Returns the system prompt with the delegation policy appended, or `undefined`
 * when it should not apply.
 *
 * The two guards are deliberate:
 *
 * - the `subagent` tool must be active, so the policy only exists where the
 *   capability does;
 * - a prompt that already carries the heading is left alone, so an
 *   `APPEND_SYSTEM.md` copy of the same policy is not duplicated.
 */
export const appendDelegationGuidance = ({
  selectedTools,
  systemPrompt,
}: DelegationPromptInput): string | undefined => {
  if (!selectedTools?.includes("subagent")) {
    return undefined;
  }
  if (systemPrompt.includes(DELEGATION_HEADING)) {
    return undefined;
  }

  return `${systemPrompt.trimEnd()}\n\n${DELEGATION_GUIDANCE}`;
};

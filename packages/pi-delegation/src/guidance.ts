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

Delegate by default rather than waiting to be asked, whenever a task has a
bounded lane that another agent can own end to end.

- Plans, work items, and document review: \`work-item-router\`,
  \`work-item-researcher\`, \`work-item-writer\`, \`work-item-reviewer\`, where the
  repository provides them.
- Independent review of a change: \`reviewer\`, \`test-validator\`, or the
  repository's \`implement-tdd-review-*\` reviewers.
- Wide read-only reconnaissance across files or subsystems: \`scout\`, or a
  bounded \`work-item-researcher\` fan-out.
- High-context decisions where inherited state could cause drift: \`oracle\`.

Keep with the parent: small sequential edits, anything needing production
credentials or a live session, and any step where checking a child's output costs
as much as doing the work. Reviewers are fresh-context and read-only. A single
child is valid; extra confidence from the same context is not.`;

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

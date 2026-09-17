import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { appendDelegationGuidance } from "./guidance.js";

/**
 * Adds the delegation policy to Pi's system prompt for sessions that can
 * delegate.
 *
 * `before_agent_start` runs once per user prompt and its result is chained with
 * other extensions, so returning `undefined` leaves the prompt untouched. That
 * is what keeps this extension inert in sessions without the `subagent` tool,
 * and it never runs at all outside Pi.
 */
export default function delegationExtension(pi: ExtensionAPI): void {
  pi.on("before_agent_start", (event) => {
    const systemPrompt = appendDelegationGuidance({
      selectedTools: event.systemPromptOptions.selectedTools,
      systemPrompt: event.systemPrompt,
    });

    return systemPrompt === undefined ? undefined : { systemPrompt };
  });
}

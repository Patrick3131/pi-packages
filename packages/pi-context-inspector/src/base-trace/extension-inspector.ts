import type { ExtensionToolContribution, LoadedExtension } from "./types.js";

export function extractContributions(
  extensions: LoadedExtension[]
): ExtensionToolContribution[] {
  const contributions: ExtensionToolContribution[] = [];

  for (const extension of extensions) {
    for (const [toolName, registered] of extension.tools) {
      contributions.push({
        toolName,
        snippet: registered.definition.promptSnippet,
        guidelines: registered.definition.promptGuidelines ?? [],
        extensionPath: extension.path,
      });
    }
  }

  return contributions;
}

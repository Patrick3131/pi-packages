import type { CrawlResult, CrawlFormat, MarkdownGenerationResult } from "./types";

/** Exact requested-view body shared by artifacts, evidence and presentation. */
export function formatContentForSave(
  result: CrawlResult,
  format: CrawlFormat,
  options?: { preferFitMarkdown?: boolean }
): string {
  if (!result.success) {
    return `# Error: ${result.url}\n\n${result.error_message || "Unknown error"}`;
  }

  switch (format) {
    case "html":
      return result.selected_html ?? result.html ?? "";
    case "links": {
      const internal = result.links?.internal || [];
      const external = result.links?.external || [];
      const lines = [
        `# Links from ${result.url}`,
        "",
        `## Internal Links (${internal.length})`,
        ...internal.map((l) => `- [${l.text}](${l.href})`),
        "",
        `## External Links (${external.length})`,
        ...external.map((l) => `- [${l.text}](${l.href})`),
      ];
      return lines.join("\n");
    }
    case "markdown":
    default:
      // Prefer fit_markdown (main content) when available and requested
      if (typeof result.markdown === "object" && result.markdown !== null) {
        const md = result.markdown as MarkdownGenerationResult;
        if (options?.preferFitMarkdown === true && md.fit_markdown?.trim()) {
          return md.fit_markdown;
        }
        return md.raw_markdown ?? "";
      }
      return result.markdown ?? "";
  }
}

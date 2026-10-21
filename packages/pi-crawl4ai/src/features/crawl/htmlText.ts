import { parse } from "parse5";
/** Broad rendered text, deliberately independent of article relevance heuristics. */
export function htmlToText(html: string, includeLinks = false): string {
  const root = parse(html);
  function visit(node: any): string {
    if (["script", "style", "template", "noscript"].includes(node.tagName)) return "";
    if (node.nodeName === "#text") return node.value;
    const text = (node.childNodes ?? []).map(visit).join("");
    const href = node.tagName === "a" && node.attrs?.find((a: any) => a.name === "href")?.value;
    const value = href && includeLinks ? `${text} (${href})` : text;
    return ["div", "p", "li", "tr", "section", "article", "header", "footer", "br", "h1", "h2", "h3"].includes(node.tagName) ? `\n${value}\n` : value;
  }
  return visit(root).replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

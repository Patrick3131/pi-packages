import { filterMarkdownBm25, rankSections, splitMarkdownSections, tokenizeBm25 } from "./bm25";

const STRUCTURED = `# Docker
Use Docker Compose.

~~~sh
# not a heading

printf docker
~~~

| Setting | Value |
| --- | --- |
| docker | enabled |

# News
Launch party photos.

# Compose
Docker compose reference.
`;

describe("structural BM25", () => {
  it("ignores fenced headings and preserves complete code, tables, ranges and source order", () => {
    const sections = splitMarkdownSections(STRUCTURED);
    expect(sections.map((s) => s.heading)).toEqual(["Docker", "News", "Compose"]);
    expect(sections[0]).toMatchObject({ startLine: 1, endLine: 13 });
    const result = filterMarkdownBm25(STRUCTURED, "docker", 0);
    expect(result.matchedSectionCount).toBe(2);
    expect(result.totalSections).toBe(3);
    expect(result.content).toBe([sections[0].text, sections[2].text].join("\n\n"));
    expect(result.content).toContain("~~~sh\n# not a heading\n\nprintf docker\n~~~");
    expect(result.content).toContain("| docker | enabled |");
  });

  it("uses Unicode terms, unique query terms and Okapi k1=1.5 b=.75", () => {
    expect(tokenizeBm25("CAFÉ café 東京 CRAWL4AI_BASE_URL")).toEqual(["café", "café", "東京", "crawl4ai_base_url"]);
    const sections = splitMarkdownSections("café café\n\nunrelated word");
    const ranked = rankSections(sections, "CAFÉ café");
    // N=2, df=1, tf=2, length=averageLength=2.
    expect(ranked[0].score).toBeCloseTo(Math.log(2) * (2 * 2.5 / 3.5), 10);
    expect(ranked[1].score).toBe(0);
  });

  it("splits headingless paragraphs without splitting fenced blocks or pipe tables", () => {
    const source = "Intro paragraph.\n\n```md\n# code\n\nstill code\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\nLast paragraph.";
    const sections = splitMarkdownSections(source);
    expect(sections).toHaveLength(4);
    expect(sections[1]).toMatchObject({ startLine: 3, endLine: 7 });
    expect(sections[1].text).toContain("\n\nstill code");
    expect(sections[2].text).toBe("| A | B |\n| - | - |\n| 1 | 2 |\n");
  });

  it.each([
    { indent: "    ", newline: "\n", blank: "", extraBlank: "", endLine: 3 },
    { indent: "\t", newline: "\r\n", blank: "  ", extraBlank: "\r\n", endLine: 4 },
    { indent: "  \t", newline: "\n", blank: "\t", extraBlank: "", endLine: 3 },
  ])("preserves indented code across internal blank lines ($indent)", ({ indent, newline, blank, extraBlank, endLine }) => {
    const code = `${indent}docker start${newline}${blank}${newline}${extraBlank}${indent}finish operation${newline}`;
    const markdown = `${code}${newline}Ordinary prose${newline}${newline}${indent}unrelated code`;
    const sections = splitMarkdownSections(markdown);
    expect(sections).toHaveLength(3);
    expect(sections[0]).toMatchObject({ text: code, startLine: 1, endLine });
    const result = filterMarkdownBm25(markdown, "docker", 0);
    expect(result.matchedSectionCount).toBe(1);
    expect(result.content).toBe(code);
    expect(result.content).not.toContain("Ordinary prose");
    expect(result.content).not.toContain("unrelated code");
  });

  it("handles long/mismatched fences and CRLF without losing original section text", () => {
    const source = "# Real\r\n````\r\n```\r\n# Hidden\r\n````\r\n# Visible\r\n";
    const sections = splitMarkdownSections(source);
    expect(sections.map((s) => s.heading)).toEqual(["Real", "Visible"]);
    expect(sections.map((s) => s.text).join("")).toBe(source);
  });

  it("returns a valid empty result and rejects invalid filtering settings", () => {
    expect(filterMarkdownBm25(STRUCTURED, "missing", 0).content).toBe("");
    expect(filterMarkdownBm25(STRUCTURED, "docker", 100).matchedSectionCount).toBe(0);
    expect(() => filterMarkdownBm25(STRUCTURED, " ")).toThrow(/query/i);
    for (const threshold of [-1, Infinity, NaN]) {
      expect(() => filterMarkdownBm25(STRUCTURED, "docker", threshold)).toThrow(/threshold/i);
    }
    expect(filterMarkdownBm25("", "docker").totalSections).toBe(0);
  });
});

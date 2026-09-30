/**
 * Tests for outline / chunk helpers.
 */

import { rankSections, splitMarkdownSections } from "./bm25";
import {
  buildOutlineMarkdown,
  buildPageMeta,
  extractHeadings,
  scoreChunk,
  selectChunks,
  splitIntoSections,
  truncateToBudget,
  windowLines,
} from "./outline";

const SAMPLE = `# Install Guide

Welcome to the project.

## Docker setup

Use Docker Compose for local installs.

Set CRAWL4AI_BASE_URL=http://localhost:11235

## Configuration

Timeout defaults to 60000ms.

## Unrelated blog

Launch party photos and marketing fluff.
`;

describe("extractHeadings", () => {
  it("ignores headings inside fenced code", () => {
    expect(extractHeadings("# Real\n```md\n# Code\n```\n## Next").map((h) => h.title)).toEqual(["Real", "Next"]);
  });

  it("finds ATX headings with line numbers", () => {
    const headings = extractHeadings(SAMPLE);
    expect(headings.map((h) => h.title)).toEqual([
      "Install Guide",
      "Docker setup",
      "Configuration",
      "Unrelated blog",
    ]);
    expect(headings[0].level).toBe(1);
    expect(headings[2].level).toBe(2);
  });
});

describe("buildOutlineMarkdown / buildPageMeta", () => {
  it("builds outline with previews", () => {
    const outline = buildOutlineMarkdown({
      url: "https://docs.example.com/install",
      title: "Install Guide",
      content: SAMPLE,
    });
    expect(outline).toContain("Source: https://docs.example.com/install");
    expect(outline).toContain("Docker setup");
    expect(outline).toContain("Docker Compose");
  });

  it("builds page meta", () => {
    const meta = buildPageMeta({
      url: "https://docs.example.com/install",
      content: SAMPLE,
    });
    expect(meta.title).toBe("Install Guide");
    expect(meta.charCount).toBe(SAMPLE.length);
    expect(meta.headings.length).toBe(4);
  });
});

describe("splitIntoSections / selectChunks", () => {
  it("splits on headings including preamble handling", () => {
    const sections = splitIntoSections(SAMPLE);
    expect(sections.length).toBeGreaterThanOrEqual(4);
    expect(sections.some((s) => s.heading === "Docker setup")).toBe(true);
  });

  it("ranks chunks by query and prefers docker section", () => {
    const selected = selectChunks({
      markdown: SAMPLE,
      query: "docker compose CRAWL4AI_BASE_URL",
      maxChars: 2000,
    });
    expect(selected.length).toBeGreaterThan(0);
    const text = selected.map((c) => c.text).join("\n");
    expect(text).toContain("CRAWL4AI_BASE_URL");
    expect(text.toLowerCase()).toContain("docker");
  });

  it("returns no content for an exhausted budget and labels partial source ranges", () => {
    expect(selectChunks({ markdown: SAMPLE, query: "docker", maxChars: 0 })).toEqual([]);
    const excerpt = selectChunks({ markdown: "# Docker\n" + "docker ".repeat(200), query: "docker", maxChars: 120 });
    expect(excerpt).toHaveLength(1);
    expect(excerpt[0].text).toContain("excerpt");
    expect(excerpt[0].text).toContain("L1–2");
    expect(excerpt[0].text.length + 80).toBeLessThanOrEqual(120);
  });

  it("returns early sections without query under budget", () => {
    const selected = selectChunks({
      markdown: SAMPLE,
      maxChars: 500,
    });
    expect(selected.length).toBeGreaterThan(0);
    expect(selected[0].startLine).toBeLessThanOrEqual(5);
  });

  it("uses the shared page corpus scores, positive Unicode matches and source ordering", () => {
    const markdown = "café café\n\nunrelated paragraph\n\ncafé";
    const selected = selectChunks({ markdown, query: "CAFÉ", maxChars: 2000 });
    const expected = rankSections(splitMarkdownSections(markdown), "CAFÉ")
      .filter((section) => section.score > 0).sort((a, b) => a.startLine - b.startLine);
    expect(selected).toEqual(expected);
    expect(selectChunks({ markdown, query: "absent", maxChars: 2000 })).toEqual([]);
  });

  it("selects the complete indented code block and original range for a headingless read query", () => {
    const code = "    docker start\n\n    finish operation\n";
    const selected = selectChunks({ markdown: `${code}\nOrdinary prose`, query: "docker", maxChars: 1000 });
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ text: code, startLine: 1, endLine: 3 });
    expect(selected[0].text).not.toContain("Ordinary prose");
  });

  it("scores term matches higher than unrelated content", () => {
    const sections = splitIntoSections(SAMPLE);
    const docker = sections.find((s) => s.heading === "Docker setup")!;
    const blog = sections.find((s) => s.heading === "Unrelated blog")!;
    expect(scoreChunk(docker, "docker")).toBeGreaterThan(scoreChunk(blog, "docker"));
  });
});

describe("windowLines / truncateToBudget", () => {
  it("returns a line window", () => {
    const win = windowLines(SAMPLE, 1, 3);
    expect(win.startLine).toBe(1);
    expect(win.endLine).toBe(3);
    expect(win.text.split("\n")).toHaveLength(3);
  });

  it("truncates over budget", () => {
    const { text, truncated } = truncateToBudget("a".repeat(200), 80);
    expect(truncated).toBe(true);
    expect(text).toContain("truncated");
    expect(text.length).toBeLessThanOrEqual(80);
  });

  it("treats zero/negative/tiny budgets as hard caps", () => {
    expect(truncateToBudget("body", 0)).toEqual({ text: "", truncated: true });
    expect(truncateToBudget("body", -1).text).toBe("");
    expect(truncateToBudget("a".repeat(200), 8).text.length).toBeLessThanOrEqual(8);
  });
});

/**
 * Tests for outline / chunk helpers.
 */

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

### Auth profiles

Configure cookies under authProfiles.

## Configuration

Timeout defaults to 60000ms.

## Unrelated blog

Launch party photos and marketing fluff.
`;

describe("extractHeadings", () => {
  it("finds ATX headings with line numbers", () => {
    const headings = extractHeadings(SAMPLE);
    expect(headings.map((h) => h.title)).toEqual([
      "Install Guide",
      "Docker setup",
      "Auth profiles",
      "Configuration",
      "Unrelated blog",
    ]);
    expect(headings[0].level).toBe(1);
    expect(headings[2].level).toBe(3);
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
    expect(meta.headings.length).toBe(5);
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

  it("returns early sections without query under budget", () => {
    const selected = selectChunks({
      markdown: SAMPLE,
      maxChars: 500,
    });
    expect(selected.length).toBeGreaterThan(0);
    expect(selected[0].startLine).toBeLessThanOrEqual(5);
  });

  it("scores heading matches higher", () => {
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
    const { text, truncated } = truncateToBudget("abcdefghij", 8);
    expect(truncated).toBe(true);
    expect(text).toContain("truncated");
  });
});

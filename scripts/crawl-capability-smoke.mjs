/** Explicit deployed/fixture smoke; never run at startup. Prints metrics, not content. */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { executeCrawl, executeCrawlInteract } from "../dist/research.mjs";

const [page, article, roster, pdf] = process.argv.slice(2);
if (![page, article, roster, pdf].every(Boolean) || !process.env.CRAWL4AI_BASE_URL || !process.env.CRAWL4AI_API_TOKEN) throw new Error("Usage: CRAWL4AI_BASE_URL=... CRAWL4AI_API_TOKEN=... node scripts/crawl-capability-smoke.mjs PAGE ARTICLE ROSTER PDF; explicit operator fixture/service required");
const cwd = mkdtempSync(join(tmpdir(), "crawl-smoke-"));
const raw = { baseUrl: process.env.CRAWL4AI_BASE_URL, timeout: 30000, outputDir: "artifacts", apiToken: process.env.CRAWL4AI_API_TOKEN, retention: { enabled: false, maxSessions: 20, maxAgeDays: 7, maxTotalMb: 512 }, capabilities: { acquisition: true, interaction: true } };
const config = { baseUrl: raw.baseUrl, timeout: raw.timeout, apiToken: raw.apiToken, raw };
try {
  const cases = [
    ["page", () => executeCrawl({ urls: [page] }, config, { cwd })],
    ["article", () => executeCrawl({ urls: [article], format: "text" }, config, { cwd })],
    ["roster", () => executeCrawlInteract({ url: roster, waitForSelector: ".card", scripts: ["window.scrollTo(0, document.body.scrollHeight)"], extractionSchema: { name: "cards", baseSelector: ".card", fields: [{ name: "name", selector: "", type: "text" }] } }, config, { cwd })],
    ["pdf", () => executeCrawl({ urls: [pdf], format: "text" }, config, { cwd })],
  ];
  for (const [name, run] of cases) {
    const started = performance.now();
    const result = await run();
    const views = result.details.evidence.pages.flatMap(page => page.views);
    const structured = views.find(view => view.kind === "structured");
    const candidates = structured?.path ? JSON.parse(readFileSync(structured.path, "utf8")).length : null;
    console.log(JSON.stringify({ case: name, toolCalls: 1, latencyMs: Math.round(performance.now() - started), modelVisibleChars: result.content.reduce((total, part) => total + part.text.length, 0), sourceViews: views.length, candidates, usability: result.details.evidence.pages.map(page => page.usability), tokenizer: null, providerCharges: "not measured" }));
  }
} finally { rmSync(cwd, { recursive: true, force: true }); }

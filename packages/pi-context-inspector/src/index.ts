import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { collectContextInspectionReport } from "./collect-report.js";
import { openInBrowser } from "./open-browser.js";
import { renderReportHtml } from "./report-html.js";
import { renderReportJson } from "./report-json.js";

function ensureReportDir(): string {
  const dir = path.join(os.tmpdir(), "pi-context-inspector");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeReportFiles(reportDir: string, reportId: string, html: string, json: string): {
  htmlPath: string;
  jsonPath: string;
} {
  const htmlPath = path.join(reportDir, `context-report-${reportId}.html`);
  const jsonPath = path.join(reportDir, `context-report-${reportId}.json`);
  fs.writeFileSync(htmlPath, html, "utf8");
  fs.writeFileSync(jsonPath, json, "utf8");
  return { htmlPath, jsonPath };
}

export async function generateContextReport(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  browserOpener: (targetPath: string) => { ok: boolean; command?: string; error?: string } = openInBrowser
): Promise<{ htmlPath?: string; jsonPath?: string; ok: boolean }> {
  try {
    const report = await collectContextInspectionReport(pi, ctx);
    const html = renderReportHtml(report);
    const json = renderReportJson(report);
    const reportDir = ensureReportDir();
    const { htmlPath, jsonPath } = writeReportFiles(reportDir, report.meta.reportId, html, json);

    const openResult = browserOpener(htmlPath);
    const notification = openResult.ok
      ? `Context report written: ${htmlPath} (JSON: ${jsonPath})`
      : `Context report written: ${htmlPath} (JSON: ${jsonPath}). Browser open failed: ${openResult.error ?? "unknown error"}`;

    ctx.ui.notify(notification, openResult.ok ? "info" : "warning");
    return { htmlPath, jsonPath, ok: openResult.ok };
  } catch (error) {
    ctx.ui.notify(
      `Failed to generate context report: ${error instanceof Error ? error.message : String(error)}`,
      "error"
    );
    return { ok: false };
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("context-report", {
    description: "Generate an HTML and JSON report for the current effective system prompt and context burden",
    handler: async (_args, ctx) => {
      await generateContextReport(pi, ctx);
    },
  });
}

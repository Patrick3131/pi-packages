import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { ContextInspectionReport, ReportDiagnostic, ReportSection, SourceFileRecord } from "./types.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatInt(value: number | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `${value.toFixed(1)}%`;
}

function readStyles(): string {
  const filePath = fileURLToPath(new URL("./shadcn/styles.css", import.meta.url));
  return fs.readFileSync(filePath, "utf8");
}

function renderSummaryCard(label: string, value: string, meta?: string): string {
  return `<div class="card"><div class="small">${escapeHtml(label)}</div><div style="font-size:28px;font-weight:700;margin-top:8px;">${escapeHtml(value)}</div>${meta ? `<div class="small" style="margin-top:8px;">${escapeHtml(meta)}</div>` : ""}</div>`;
}

function renderBadges(items: Array<{ label: string; className?: string }>): string {
  if (items.length === 0) {
    return "";
  }
  return `<div class="badges">${items
    .map((item) => `<span class="badge${item.className ? ` ${item.className}` : ""}">${escapeHtml(item.label)}</span>`)
    .join("")}</div>`;
}

function renderCodeBlock(text: string): string {
  return `<pre class="code-block">${escapeHtml(text)}</pre>`;
}

function renderSectionCard(section: ReportSection): string {
  return `
    <section id="${escapeHtml(section.id)}" class="card section">
      <h3>${escapeHtml(section.label)}</h3>
      ${renderBadges([
        { label: `${formatInt(section.tokens)} tokens` },
        { label: `${formatInt(section.chars)} chars` },
        { label: formatPercent(section.percentageOfPrompt) },
      ])}
      ${section.content ? `<details open><summary>Raw section</summary><div>${renderCodeBlock(section.content)}</div></details>` : ""}
      ${section.children && section.children.length > 0 ? `
        <details>
          <summary>Children (${String(section.children.length)})</summary>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Label</th><th>Tokens</th><th>Chars</th><th>Source</th></tr></thead>
              <tbody>
                ${section.children
                  .map(
                    (child) => `<tr><td>${escapeHtml(child.label)}</td><td>${formatInt(child.tokens)}</td><td>${formatInt(child.chars)}</td><td>${child.sourcePath ? escapeHtml(child.sourcePath) : "—"}</td></tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </details>` : ""}
    </section>`;
}

function renderSourceFile(file: SourceFileRecord): string {
  return `
    <div class="card">
      <h4>${escapeHtml(path.basename(file.path))}</h4>
      <div class="kv">
        <div><strong>Path:</strong> ${escapeHtml(file.path)}</div>
        <div><strong>Scope:</strong> ${escapeHtml(file.scope)}</div>
        <div><strong>Role:</strong> ${escapeHtml(file.role)}</div>
        <div><strong>Exists:</strong> ${String(file.exists)}</div>
        <div><strong>Readable:</strong> ${String(file.readable)}</div>
        <div><strong>Included in prompt:</strong> ${file.includedInPrompt == null ? "inferred unknown" : String(file.includedInPrompt)}</div>
      </div>
      ${renderBadges([
        { label: `${formatInt(file.tokens)} tokens` },
        { label: `${formatInt(file.chars)} chars` },
        ...(file.diagnostics ?? []).map((message) => ({ label: message, className: "warning" })),
      ])}
      ${file.content ? `<details><summary>File contents</summary><div>${renderCodeBlock(file.content)}</div></details>` : ""}
    </div>`;
}

function renderDiagnostics(diagnostics: ReportDiagnostic[]): string {
  if (diagnostics.length === 0) {
    return `<div class="card"><p>No diagnostics.</p></div>`;
  }
  return `<div class="list">${diagnostics
    .map(
      (diagnostic) => `<div class="card"><strong>${escapeHtml(diagnostic.level.toUpperCase())}</strong><div style="margin-top:8px;">${escapeHtml(diagnostic.message)}</div>${diagnostic.source ? `<div class="small" style="margin-top:8px;">${escapeHtml(diagnostic.source)}</div>` : ""}</div>`
    )
    .join("")}</div>`;
}

function renderTrace(report: ContextInspectionReport): string {
  if (!report.trace) {
    return `<div class="card"><p>Base prompt trace was not available.</p></div>`;
  }

  return `
    <div class="grid">
      <div class="card">
        <h3>Trace buckets</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Bucket</th><th>Tokens</th><th>Lines</th><th>% of base</th></tr></thead>
            <tbody>
              ${report.trace.buckets
                .map(
                  (bucket) => `<tr><td>${escapeHtml(bucket.label)}</td><td>${formatInt(bucket.tokens)}</td><td>${formatInt(bucket.lineCount)}</td><td>${formatPercent(bucket.pctOfBase)}</td></tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <h3>Trace evidence</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Kind</th><th>Bucket</th><th>Tokens</th><th>Contributors</th><th>Line</th></tr></thead>
            <tbody>
              ${report.trace.evidence
                .map(
                  (evidence) => `<tr><td>${escapeHtml(evidence.kind)}</td><td>${escapeHtml(evidence.bucket)}</td><td>${formatInt(evidence.tokens)}</td><td>${escapeHtml(evidence.contributors.join(", ") || "—")}</td><td><code>${escapeHtml(evidence.line)}</code></td></tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

export function renderReportHtml(report: ContextInspectionReport): string {
  const styles = readStyles();
  const reportJson = JSON.stringify(report, null, 2);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pi Context Inspector</title>
    <style>${styles}</style>
  </head>
  <body>
    <div class="layout">
      <aside class="sidebar">
        <h1>Pi Context Inspector</h1>
        <p>Inspect the current effective system prompt, prompt burden, source files, tool definitions, and inferred provenance.</p>
        <ul class="nav-list">
          <li><a href="#overview">Overview</a></li>
          <li><a href="#effective-prompt">Effective Prompt</a></li>
          <li><a href="#prompt-breakdown">Prompt Breakdown</a></li>
          <li><a href="#source-files">Source Files</a></li>
          <li><a href="#base-trace">Base Prompt Trace</a></li>
          <li><a href="#tool-definitions">Tool Definitions</a></li>
          <li><a href="#skills">Skills</a></li>
          <li><a href="#diagnostics">Diagnostics</a></li>
          <li><a href="#raw-json">Raw JSON</a></li>
        </ul>
      </aside>
      <main class="content">
        <header class="header" id="overview">
          <h2>Context report</h2>
          <p>Generated ${escapeHtml(report.meta.generatedAt)} for <code>${escapeHtml(report.meta.cwd)}</code></p>
        </header>

        <section class="summary-grid grid">
          ${renderSummaryCard("Prompt tokens", formatInt(report.prompt.totalTokens), `${formatInt(report.prompt.totalChars)} chars`)}
          ${renderSummaryCard("Tool definition tokens", formatInt(report.tools.totalTokens), `${formatInt(report.tools.count)} tools`)}
          ${renderSummaryCard("Skills", formatInt(report.skills.count), `${formatInt(report.skills.totalTokens)} tokens`)}
          ${renderSummaryCard("AGENTS files", formatInt(report.files.agents.filter((file) => file.exists).length), `${formatInt(report.files.agents.length)} discovered`)}
          ${renderSummaryCard("Context window", formatInt(report.meta.contextWindow), `used ${formatInt(report.meta.usedContextTokens)}`)}
          ${renderSummaryCard("Model", report.meta.modelId ?? "unknown", report.meta.reportId)}
        </section>

        <section id="effective-prompt" class="card section">
          <h3>Effective system prompt</h3>
          ${renderBadges([
            { label: `${formatInt(report.prompt.totalTokens)} tokens` },
            { label: `${formatInt(report.prompt.totalChars)} chars` },
          ])}
          ${renderCodeBlock(report.prompt.effective)}
        </section>

        <section id="prompt-breakdown" class="section grid">
          ${report.prompt.sections.map((section) => renderSectionCard(section)).join("")}
        </section>

        <section id="source-files" class="section">
          <div class="card"><h3>Source files</h3><p class="small">Discovered prompt-related files on disk. Inclusion is inferred where exact attribution is not available.</p></div>
          <div class="grid">
            ${[...report.files.system, ...report.files.appendSystem, ...report.files.agents]
              .map((file) => renderSourceFile(file))
              .join("")}
          </div>
        </section>

        <section id="base-trace" class="section">
          <div class="card"><h3>Base prompt trace</h3><p class="small">Inferred attribution for the base prompt using extension tool snippets and prompt guidelines.</p></div>
          ${renderTrace(report)}
        </section>

        <section id="tool-definitions" class="section">
          <div class="card">
            <h3>Tool definitions</h3>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Description</th><th>Tokens</th><th>Chars</th></tr></thead>
                <tbody>
                  ${report.tools.items
                    .map(
                      (tool) => `<tr><td>${escapeHtml(tool.name)}</td><td>${escapeHtml(tool.description || "")}</td><td>${formatInt(tool.tokens)}</td><td>${formatInt(tool.chars)}</td></tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
            <details><summary>Serialized definitions</summary><div class="list">${report.tools.items
              .map(
                (tool) => `<div><h4>${escapeHtml(tool.name)}</h4>${renderCodeBlock(tool.serialized)}</div>`
              )
              .join("")}</div></details>
          </div>
        </section>

        <section id="skills" class="section">
          <div class="card">
            <h3>Skills</h3>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Description</th><th>Location</th><th>Tokens</th></tr></thead>
                <tbody>
                  ${report.skills.items
                    .map(
                      (skill) => `<tr><td>${escapeHtml(skill.name)}</td><td>${escapeHtml(skill.description)}</td><td>${escapeHtml(skill.location)}</td><td>${formatInt(skill.tokens)}</td></tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="diagnostics" class="section">
          <div class="card"><h3>Diagnostics</h3></div>
          ${renderDiagnostics(report.diagnostics)}
        </section>

        <section id="raw-json" class="section">
          <div class="card">
            <h3>Raw JSON</h3>
            ${renderCodeBlock(reportJson)}
          </div>
        </section>
      </main>
    </div>
  </body>
</html>`;
}

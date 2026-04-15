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
      ${section.content ? `<details><summary>Raw section</summary><div>${renderCodeBlock(section.content)}</div></details>` : ""}
      ${section.children && section.children.length > 0 ? `
        <details>
          <summary>Children (${String(section.children.length)})</summary>
          <div class="list">
            ${section.children
              .map(
                (child) => `
                  <details>
                    <summary>${escapeHtml(child.label)} · ${formatInt(child.tokens)} tokens · ${formatInt(child.chars)} chars${child.sourcePath ? ` · ${escapeHtml(child.sourcePath)}` : ""}</summary>
                    <div>
                      ${child.sourcePath ? `<div class="small" style="margin-bottom:10px;">${escapeHtml(child.sourcePath)}</div>` : ""}
                      ${child.content ? renderCodeBlock(child.content) : `<div class="small">No raw child content.</div>`}
                    </div>
                  </details>`
              )
              .join("")}
          </div>
        </details>` : ""}
    </section>`;
}

function renderSourceFile(file: SourceFileRecord): string {
  const status = !file.exists ? "Not present" : file.readable ? "Present" : "Unreadable";
  return `
    <div class="card">
      <h4>${escapeHtml(path.basename(file.path))}</h4>
      <div class="kv">
        <div><strong>Path:</strong> ${escapeHtml(file.path)}</div>
        <div><strong>Scope:</strong> ${escapeHtml(file.scope)}</div>
        <div><strong>Role:</strong> ${escapeHtml(file.role)}</div>
        <div><strong>Status:</strong> ${status}</div>
        <div><strong>Included in prompt:</strong> ${file.includedInPrompt == null ? "inferred unknown" : String(file.includedInPrompt)}</div>
      </div>
      ${renderBadges([
        { label: `${formatInt(file.tokens)} tokens` },
        { label: `${formatInt(file.chars)} chars` },
        ...(file.diagnostics ?? []).map((message) => ({ label: message, className: !file.exists ? "" : "warning" })),
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

function estimateJsonSummary(value: unknown): { chars: number; tokens: number } {
  const serialized = value === undefined ? "undefined" : JSON.stringify(value, null, 2);
  return {
    chars: serialized.length,
    tokens: Math.ceil(serialized.length / 4),
  };
}

function renderJsonScalar(value: unknown, label?: string): string {
  const summary = estimateJsonSummary(value);
  if (typeof value === "string") {
    const isMultiline = value.includes("\n");
    const isLong = value.length > 160;
    if (isMultiline || isLong) {
      const lineCount = value.split("\n").length;
      return `
        <details>
          <summary>${label ? `<strong>${escapeHtml(label)}</strong>: ` : ""}string · ${formatInt(summary.chars)} chars · ~${formatInt(summary.tokens)} tok · ${formatInt(lineCount)} lines</summary>
          <div class="list">
            <div>
              <div class="small" style="margin-bottom:8px;">Formatted</div>
              ${renderCodeBlock(value)}
            </div>
            <details>
              <summary>Raw JSON string · ${formatInt(summary.chars)} chars · ~${formatInt(summary.tokens)} tok</summary>
              <div>${renderCodeBlock(JSON.stringify(value))}</div>
            </details>
          </div>
        </details>`;
    }
  }

  const rendered = value === undefined ? "undefined" : JSON.stringify(value);
  return `<div>${label ? `<strong>${escapeHtml(label)}:</strong> ` : ""}<code>${escapeHtml(rendered)}</code> <span class="small">(${formatInt(summary.chars)} chars · ~${formatInt(summary.tokens)} tok)</span></div>`;
}

function renderJsonTree(value: unknown, label?: string): string {
  const summary = estimateJsonSummary(value);
  if (value === null || typeof value !== "object") {
    return renderJsonScalar(value, label);
  }

  if (Array.isArray(value)) {
    return `
      <details>
        <summary>${escapeHtml(label ?? "array")} [${String(value.length)}] · ${formatInt(summary.chars)} chars · ~${formatInt(summary.tokens)} tok</summary>
        <div class="list">
          ${value.map((item, index) => renderJsonTree(item, String(index))).join("")}
        </div>
      </details>`;
  }

  const entries = Object.entries(value);
  return `
    <details>
      <summary>${escapeHtml(label ?? "object")} {${String(entries.length)}} · ${formatInt(summary.chars)} chars · ~${formatInt(summary.tokens)} tok</summary>
      <div class="list">
        ${entries.map(([key, child]) => renderJsonTree(child, key)).join("")}
      </div>
    </details>`;
}

export function renderReportHtml(report: ContextInspectionReport): string {
  const styles = readStyles();

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
          ${report.prompt.sections.filter((section) => section.kind !== "tools").map((section) => renderSectionCard(section)).join("")}
        </section>

        <section id="tool-definitions" class="section">
          <div class="card">
            <h3>Tool definitions</h3>
            <p class="small">Registered tool schemas discovered via <code>pi.getAllTools()</code>. These are separate from the visible tool bullets in the effective system prompt.</p>
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
            <details><summary>Detailed tool definitions</summary><div class="list">${report.tools.items
              .map(
                (tool) => `<details><summary>${escapeHtml(tool.name)} · ${formatInt(tool.tokens)} tokens · ${formatInt(tool.chars)} chars</summary><div>${renderCodeBlock(tool.serialized)}</div></details>`
              )
              .join("")}</div></details>
          </div>
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
            <details>
              <summary>Tree view</summary>
              <div>${renderJsonTree(report)}</div>
            </details>
            <details>
              <summary>Raw JSON text</summary>
              <div>${renderCodeBlock(JSON.stringify(report, null, 2))}</div>
            </details>
          </div>
        </section>
      </main>
    </div>
  </body>
</html>`;
}

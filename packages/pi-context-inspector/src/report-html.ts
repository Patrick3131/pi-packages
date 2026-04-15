import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  ContextInspectionReport,
  LatestPayloadCaptureReport,
  PayloadAnalysisSectionSummary,
  ReportDiagnostic,
  ReportSection,
  SourceFileRecord,
} from "./types.js";

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

function renderHelpBox(title: string, lines: string[]): string {
  return `<details class="card" style="margin-top:16px;"><summary><strong>${escapeHtml(title)}</strong></summary><div class="list" style="margin-top:12px;">${lines
    .map((line) => `<p class="small" style="margin:0;">${escapeHtml(line)}</p>`)
    .join("")}</div></details>`;
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

function shouldShowSection(summary: PayloadAnalysisSectionSummary): boolean {
  return summary.count > 0 || summary.tokens > 0 || summary.chars > 0;
}

function renderCurrentContextSummary(reportPayload: LatestPayloadCaptureReport): string {
  const summary = reportPayload.currentContextSummary;
  return `
    <div class="card">
      <h3>What is in context right now?</h3>
      ${renderBadges([
        { label: summary.bestAvailableView === "captured-payload" ? "best available: captured payload" : "best available: prompt only" },
        { label: summary.visibility },
        ...(summary.normalizationStatus ? [{ label: `normalization:${summary.normalizationStatus}`, className: summary.normalizationStatus === "full" ? "" : "warning" }] : []),
      ])}
      <div class="kv" style="margin-top:12px;">
        <div><strong>Effective system prompt:</strong> ~${formatInt(summary.effectiveSystemPromptTokens)} tokens (${formatInt(summary.effectiveSystemPromptChars)} chars)</div>
        <div><strong>Latest normalized system instructions:</strong> ${summary.normalizedPayloadSystemTokens == null ? "—" : `~${formatInt(summary.normalizedPayloadSystemTokens)} tokens (${formatInt(summary.normalizedPayloadSystemChars)} chars)`}</div>
        <div><strong>Latest conversation messages:</strong> ${summary.normalizedPayloadMessageCount == null ? "—" : `${formatInt(summary.normalizedPayloadMessageCount)} message(s), ~${formatInt(summary.normalizedPayloadMessageTokens)} tokens`}</div>
        <div><strong>Latest tool blocks:</strong> ${summary.normalizedPayloadToolCount == null ? "—" : `${formatInt(summary.normalizedPayloadToolCount)} tool block(s), ~${formatInt(summary.normalizedPayloadToolTokens)} tokens`}</div>
        <div><strong>Latest normalized payload estimate:</strong> ${summary.normalizedPayloadTokensEstimate == null ? "—" : `~${formatInt(summary.normalizedPayloadTokensEstimate)} tokens`}</div>
        <div><strong>Latest serialized request JSON estimate:</strong> ${summary.requestJsonTokensEstimate == null ? "—" : `~${formatInt(summary.requestJsonTokensEstimate)} tokens`}</div>
        <div><strong>Runtime context usage:</strong> ${summary.runtimeContextUsageTokens == null ? "—" : `${formatInt(summary.runtimeContextUsageTokens)} tokens${summary.contextWindow ? ` of ${formatInt(summary.contextWindow)}` : ""}`}</div>
      </div>
      <div class="list" style="margin-top:12px;">
        ${summary.summaryLines.map((line) => `<p class="small" style="margin:0;">${escapeHtml(line)}</p>`).join("")}
      </div>
      ${summary.caveat ? `<p class="small" style="margin-top:12px;"><strong>Caveat:</strong> ${escapeHtml(summary.caveat)}</p>` : ""}
    </div>`;
}

function renderSectionRows(reportPayload: LatestPayloadCaptureReport): string {
  if (!reportPayload.analysis) {
    return `<tr><td colspan="4">No payload analysis available.</td></tr>`;
  }

  const visibleSections = Object.values(reportPayload.analysis.sections).filter(shouldShowSection);
  if (visibleSections.length === 0) {
    return `<tr><td colspan="4">All normalized section buckets are empty for this capture.</td></tr>`;
  }

  return visibleSections
    .map(
      (section) => `<tr><td>${escapeHtml(section.label)}</td><td>${formatInt(section.count)}</td><td>${formatInt(section.tokens)}</td><td>${formatInt(section.chars)}</td></tr>`
    )
    .join("");
}

function renderMessages(reportPayload: LatestPayloadCaptureReport): string {
  const messages = reportPayload.normalization?.messages ?? [];
  if (messages.length === 0) {
    return `
      <div class="card" style="margin-top:16px;">
        <h3>Conversation messages</h3>
        <p class="small">No normalized conversation messages were captured in the latest payload.</p>
      </div>`;
  }

  return `
    <div class="card" style="margin-top:16px;">
      <h3>Conversation messages</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Role</th><th>Tokens</th><th>Chars</th><th>Preview</th></tr></thead>
          <tbody>
            ${messages
              .map(
                (message) => `<tr><td>${formatInt(message.index + 1)}</td><td>${escapeHtml(message.role)}</td><td>${formatInt(message.tokens)}</td><td>${formatInt(message.chars)}</td><td>${escapeHtml(message.text.slice(0, 140) || "—")}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
      <details>
        <summary>Expanded message blocks</summary>
        <div class="list">
          ${messages
            .map(
              (message) => `<details><summary>${escapeHtml(message.label)} · ${formatInt(message.tokens)} tokens · ${formatInt(message.chars)} chars</summary><div>${renderCodeBlock(message.text || "")}</div></details>`
            )
            .join("")}
        </div>
      </details>
    </div>`;
}

function renderSystemAndToolCards(reportPayload: LatestPayloadCaptureReport): string {
  const system = reportPayload.normalization?.system ?? [];
  const tools = reportPayload.normalization?.tools ?? [];
  const otherFields = reportPayload.normalization?.otherFields ?? [];

  const cards: string[] = [];

  if (system.length > 0) {
    cards.push(`
      <div class="card">
        <h3>Normalized system / developer instructions</h3>
        <details open>
          <summary>Instruction blocks (${String(system.length)})</summary>
          <div class="list">
            ${system
              .map(
                (section) => `<details><summary>${escapeHtml(section.label)} · ${formatInt(section.tokens)} tokens · ${formatInt(section.chars)} chars</summary><div>${renderCodeBlock(section.text)}</div></details>`
              )
              .join("")}
          </div>
        </details>
      </div>`);
  }

  if (tools.length > 0) {
    cards.push(`
      <div class="card">
        <h3>Normalized tools</h3>
        <details open>
          <summary>Tools (${String(tools.length)})</summary>
          <div class="list">
            ${tools
              .map(
                (tool) => `<details><summary>${escapeHtml(tool.name)} · ${formatInt(tool.tokens)} tokens · ${formatInt(tool.chars)} chars</summary><div>${renderCodeBlock(tool.serialized)}</div></details>`
              )
              .join("")}
          </div>
        </details>
      </div>`);
  }

  if (otherFields.length > 0) {
    cards.push(`
      <div class="card">
        <h3>Unclassified request JSON fields</h3>
        <p class="small">Shown only when non-empty. These fields were present in the captured request JSON but not mapped into normalized system, conversation, or tools buckets.</p>
        <details>
          <summary>Fields (${String(otherFields.length)})</summary>
          <div class="list">
            ${otherFields
              .map(
                (section) => `<details><summary>${escapeHtml(section.label)} · ${formatInt(section.tokens)} tokens · ${formatInt(section.chars)} chars</summary><div>${renderCodeBlock(section.text)}</div></details>`
              )
              .join("")}
          </div>
        </details>
      </div>`);
  }

  if (cards.length === 0) {
    return `
      <div class="card" style="margin-top:16px;">
        <h3>Normalized payload sections</h3>
        <p class="small">No non-empty normalized system, tool, or unclassified request JSON sections were captured.</p>
      </div>`;
  }

  return `<div class="grid" style="margin-top:16px;">${cards.join("")}</div>`;
}

function renderPayload(reportPayload: LatestPayloadCaptureReport): string {
  if (!reportPayload.available || !reportPayload.latestCapture || !reportPayload.normalization || !reportPayload.analysis) {
    return `
      ${renderCurrentContextSummary(reportPayload)}
      <div class="card" style="margin-top:16px;">
        <h3>Provider payload capture</h3>
        ${renderBadges([{ label: "prompt-only fallback", className: "warning" }])}
        <p class="small">No captured provider request payload was available for the current branch. The report below is based on prompt-derived data only.</p>
      </div>`;
  }

  const { latestCapture, normalization, analysis } = reportPayload;
  return `
    ${renderCurrentContextSummary(reportPayload)}
    <div class="grid" style="margin-top:16px;">
      <div class="card">
        <h3>Provider payload capture</h3>
        ${renderBadges([
          { label: latestCapture.visibility },
          { label: normalization.providerFamily },
          { label: normalization.status === "full" ? "normalized" : `normalized:${normalization.status}`, className: normalization.status === "full" ? "" : "warning" },
          { label: latestCapture.persisted ? "persisted" : "best-effort", className: latestCapture.persisted ? "" : "warning" },
        ])}
        <div class="kv">
          <div><strong>Captured at:</strong> ${escapeHtml(latestCapture.capturedAt)}</div>
          <div><strong>Model:</strong> ${escapeHtml(latestCapture.modelId ?? "unknown")}</div>
          <div><strong>Session:</strong> ${escapeHtml(latestCapture.sessionId ?? "unknown")}</div>
          <div><strong>Leaf:</strong> ${escapeHtml(latestCapture.leafId ?? "unknown")}</div>
          <div><strong>Raw payload file:</strong> ${latestCapture.rawPayloadPath ? escapeHtml(latestCapture.rawPayloadPath) : "—"}</div>
          <div><strong>Capture source:</strong> ${escapeHtml(latestCapture.source)}</div>
        </div>
      </div>
      ${renderSummaryCard("Effective system prompt tokens", `~${formatInt(reportPayload.currentContextSummary.effectiveSystemPromptTokens)}`, `${formatInt(reportPayload.currentContextSummary.effectiveSystemPromptChars)} chars from ctx.getSystemPrompt()`) }
      ${renderSummaryCard("Normalized payload estimate", `~${formatInt(analysis.normalizedPayloadTokensEstimate)}`, `${formatInt(analysis.normalizedPayloadCharsEstimate)} chars from normalized system + conversation + tools`) }
      ${renderSummaryCard("Serialized request JSON estimate", `~${formatInt(analysis.requestJsonTokensEstimate)}`, `${formatInt(analysis.requestJsonCharsEstimate)} chars of captured request JSON`) }
      ${renderSummaryCard("Request JSON minus normalized payload", `~${formatInt(analysis.requestJsonMinusNormalizedTokensEstimate)}`, `${formatInt(analysis.requestJsonMinusNormalizedCharsEstimate)} chars of request-only / unnormalized overhead`) }
      ${renderSummaryCard("Runtime context usage", formatInt(analysis.comparison.runtimeContextUsageTokens), `capture-time ${formatInt(analysis.comparison.captureTimeContextUsageTokens)}`)}
    </div>
    ${renderHelpBox("What do these payload numbers mean?", [
      "Effective system prompt tokens come from ctx.getSystemPrompt() and only describe the visible assembled system prompt text.",
      "Normalized payload estimate is a best-effort sum of captured system/developer instructions, conversation text, and tool definitions that the report could classify.",
      "Serialized request JSON estimate is the size of the captured request body as JSON text. It is a debugging proxy, not the exact model context or billing number.",
      "Runtime context usage from ctx.getContextUsage() may be higher or lower because providers add framing, hidden defaults, cached history, and accounting that is not visible in request JSON.",
      "Best available current context means the report combines prompt data with the latest captured request payload when available, but it still labels partial capture and partial normalization explicitly.",
    ])}
    <div class="card" style="margin-top:16px;">
      <h3>Normalized payload vs request JSON</h3>
      <p class="small">Only non-empty buckets are emphasized below. Zero-value buckets are hidden to reduce noise.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Section</th><th>Count</th><th>Tokens</th><th>Chars</th></tr></thead>
          <tbody>
            ${renderSectionRows(reportPayload)}
          </tbody>
        </table>
      </div>
    </div>
    ${renderMessages(reportPayload)}
    ${renderSystemAndToolCards(reportPayload)}
    <div class="grid" style="margin-top:16px;">
      <div class="card">
        <h3>Model timeline</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Changed at</th><th>Source</th><th>Previous</th><th>Next</th></tr></thead>
            <tbody>
              ${reportPayload.modelHistory.length > 0 ? reportPayload.modelHistory
                .map(
                  (item) => `<tr><td>${escapeHtml(item.changedAt)}</td><td>${escapeHtml(item.source)}</td><td>${escapeHtml(item.previousModelId ?? "—")}</td><td>${escapeHtml(item.modelId ?? "—")}</td></tr>`
                )
                .join("") : `<tr><td colspan="4">No model changes recorded.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <h3>Capture history</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Captured at</th><th>Provider</th><th>Model</th><th>Request JSON</th><th>Runtime usage</th></tr></thead>
            <tbody>
              ${reportPayload.history.length > 0 ? reportPayload.history
                .map(
                  (item) => `<tr><td>${escapeHtml(item.capturedAt)}</td><td>${escapeHtml(item.providerFamily)}</td><td>${escapeHtml(item.modelId ?? "—")}</td><td>~${formatInt(item.serializedPayloadTokens)}</td><td>${formatInt(item.contextUsageTokens)}</td></tr>`
                )
                .join("") : `<tr><td colspan="5">No captures recorded.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:16px;">
      <h3>Normalization caveats</h3>
      ${renderBadges(normalization.caveats.length > 0 ? normalization.caveats.map((caveat) => ({ label: caveat, className: "warning" })) : [{ label: "none" }])}
      <details>
        <summary>Raw captured payload</summary>
        <p class="small" style="margin-top:12px;">This tree shows captured request JSON for debugging. Its chars/token estimate reflects report artifact size for the captured JSON text, not exact model context usage.</p>
        <div>${renderJsonTree(reportPayload.rawPayload ?? latestCapture.rawPayloadPreview ?? {})}</div>
      </details>
    </div>`;
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
        <p>Inspect the assembled system prompt, captured provider payload, source files, tool definitions, and inferred provenance.</p>
        <ul class="nav-list">
          <li><a href="#overview">Overview</a></li>
          <li><a href="#provider-payload">Provider Payload</a></li>
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
          ${renderSummaryCard("Effective system prompt", `~${formatInt(report.prompt.totalTokens)}`, `${formatInt(report.prompt.totalChars)} chars from ctx.getSystemPrompt()`)}
          ${renderSummaryCard("Best available current context", report.payload.currentContextSummary.bestAvailableView === "captured-payload" ? "captured payload" : "prompt only", report.payload.available ? report.payload.visibility : "prompt-only fallback")}
          ${renderSummaryCard("Normalized payload estimate", report.payload.analysis ? `~${formatInt(report.payload.analysis.normalizedPayloadTokensEstimate)}` : "—", report.payload.analysis ? `request JSON minus normalized ~${formatInt(report.payload.analysis.requestJsonMinusNormalizedTokensEstimate)}` : "no payload capture")}
          ${renderSummaryCard("Serialized request JSON estimate", report.payload.analysis ? `~${formatInt(report.payload.analysis.requestJsonTokensEstimate)}` : "—", "captured request body as JSON text")}
          ${renderSummaryCard("Tool definition tokens", formatInt(report.tools.totalTokens), `${formatInt(report.tools.count)} tools`)}
          ${renderSummaryCard("Skills", formatInt(report.skills.count), `${formatInt(report.skills.totalTokens)} tokens`)}
          ${renderSummaryCard("Runtime context usage", formatInt(report.meta.usedContextTokens), `window ${formatInt(report.meta.contextWindow)}`)}
          ${renderSummaryCard("Model", report.meta.modelId ?? "unknown", report.meta.reportId)}
        </section>

        ${renderHelpBox("Glossary / quick help", [
          "Effective system prompt: the visible assembled system prompt text returned by ctx.getSystemPrompt().",
          "Normalized payload: the parts of the latest captured provider request the report could classify into instructions, conversation messages, and tools.",
          "Serialized request JSON: the captured request body serialized as JSON text for debugging. Useful, but not the same thing as exact provider context or billing.",
          "Runtime context usage: ctx.getContextUsage() metadata from Pi. This may include provider/session accounting beyond visible request JSON.",
          "Raw JSON tree/object sizes in this report describe report artifact / serialized JSON size, not exact model context size.",
        ])}

        <section id="provider-payload" class="section">
          ${renderPayload(report.payload)}
        </section>

        <section id="effective-prompt" class="card section">
          <h3>Effective system prompt</h3>
          ${renderBadges([
            { label: `${formatInt(report.prompt.totalTokens)} tokens` },
            { label: `${formatInt(report.prompt.totalChars)} chars` },
          ])}
          <p class="small">This is the visible assembled system prompt from <code>ctx.getSystemPrompt()</code>. It is not the same as the full serialized provider request body.</p>
          ${renderCodeBlock(report.prompt.effective)}
        </section>

        <section id="prompt-breakdown" class="section grid">
          ${report.prompt.sections.filter((section) => section.kind !== "tools").map((section) => renderSectionCard(section)).join("")}
        </section>

        <section id="tool-definitions" class="section">
          <div class="card">
            <h3>Tool definitions</h3>
            <p class="small">Registered tool schemas discovered via <code>pi.getAllTools()</code>. These are separate from the visible tool bullets in the effective system prompt and may also be represented independently in the captured provider payload.</p>
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
            <p class="small">The tree and text below show exported report artifacts. Raw JSON tree/object size here is report/export size, not model context size. The captured request JSON nested inside this report is a debugging proxy only.</p>
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

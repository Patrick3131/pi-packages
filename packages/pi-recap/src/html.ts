import type { RecapDocument } from "./document.js";
import { escapeHtml } from "./escape.js";
import { renderMarkdown, splitMarkdown } from "./markdown.js";
import type { RecapExchange } from "./session.js";
import { firstLine, formatCount, formatTimestamp, formatUsd } from "./text.js";

export { escapeHtml } from "./escape.js";

function anchorId(entryId: string): string {
	return `e-${entryId.replace(/[^A-Za-z0-9_-]/gu, "-")}`;
}

function renderToolLine(exchange: RecapExchange): string {
	if (exchange.toolCallCount === 0) return "";
	const names = exchange.toolNames.length > 0 ? ` · ${exchange.toolNames.map(escapeHtml).join(", ")}` : "";
	const errors =
		exchange.toolErrorCount > 0 ? ` · ${exchange.toolErrorCount} error${exchange.toolErrorCount === 1 ? "" : "s"}` : "";
	return `<p class="tools">🔧 ${formatCount(exchange.toolCallCount)} tool calls${names}${errors}</p>`;
}

function markdownBlock(source: string): string {
	return `<div class="md">${renderMarkdown(source)}</div>`;
}

function renderAnswer(exchange: RecapExchange, previewChars: number): string {
	if (!exchange.answerText) return `<p class="empty">(no answer text)</p>`;
	const split = splitMarkdown(exchange.answerText, previewChars);
	if (!split.truncated) return markdownBlock(exchange.answerText);
	const head = split.head ? markdownBlock(split.head) : "";
	const label = `Show full answer (+${formatCount(split.tail.length)} chars)`;
	return `${head}<details><summary>${label}</summary>${markdownBlock(split.tail || exchange.answerText)}</details>`;
}

function renderExchange(exchange: RecapExchange, previewChars: number, messages: boolean): string {
	const id = anchorId(exchange.userEntryId);
	const summary =
		!messages && exchange.summary
			? `<p class="summary"><span class="badge">TL;DR</span> ${escapeHtml(exchange.summary)}</p>`
			: "";
	return [
		`<article class="exchange" id="${id}" tabindex="-1"`,
		` data-summary="${exchange.summary ? 1 : 0}" data-tools="${exchange.toolCallCount}" data-answered="${exchange.answerText ? 1 : 0}">`,
		`<header class="exchange-head">`,
		`<span class="index">${exchange.index}</span>`,
		`<time datetime="${escapeHtml(exchange.timestamp)}">${escapeHtml(formatTimestamp(exchange.timestamp))}</time>`,
		`<span class="head-spacer"></span>`,
		`<button class="copy-btn" type="button" data-copy="${id}" title="Copy prompt and answer">Copy</button>`,
		`</header>`,
		`<div class="prompt md">${renderMarkdown(exchange.userText)}</div>`,
		summary,
		renderAnswer(exchange, previewChars),
		messages ? "" : renderToolLine(exchange),
		"</article>",
	].join("\n");
}

function renderToc(doc: RecapDocument): string {
	if (doc.session.exchanges.length === 0) return `<p class="toc-empty">No user messages found.</p>`;
	return doc.session.exchanges
		.map((exchange) => {
			const id = anchorId(exchange.userEntryId);
			const tools = !doc.messages && exchange.toolCallCount > 0 ? `<span class="toc-badge">🔧 ${exchange.toolCallCount}</span>` : "";
			const summary = !doc.messages && exchange.summary ? `<span class="toc-badge toc-summary" title="Has a TL;DR">✦</span>` : "";
			return `<a class="toc-link" href="#${id}" data-target="${id}"><span class="toc-index">${exchange.index}</span><span class="toc-text">${escapeHtml(firstLine(exchange.userText, 90))}</span>${summary}${tools}</a>`;
		})
		.join("\n");
}

function renderSummaryInfo(doc: RecapDocument): string {
	const report = doc.summary;
	if (!report || doc.messages) return "";
	const parts = [
		`model ${escapeHtml(report.model)}`,
		`${formatCount(report.summarized)} summarized`,
		`${formatCount(report.cached)} cached`,
	];
	if (report.costUsd > 0) parts.push(formatUsd(report.costUsd));
	if (report.status === "failed") parts.push(`⚠ ${escapeHtml(report.error ?? "summarize failed")}`);
	if (report.status === "skipped") parts.push("skipped");
	return `<p class="summary-info">Summaries: ${parts.join(" · ")}</p>`;
}

const STYLE = `
:root, [data-theme="light"] {
  color-scheme: light;
  --font-sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --bg: #f6f7fb; --surface: #ffffff; --surface-2: #f4f5f8; --text: #191b21; --muted: #667085;
  --border: #e4e7ec; --border-strong: #d0d5dd; --accent: #4f46e5; --accent-soft: #eef2ff; --accent-text: #4338ca;
  --prompt-bg: #eef2ff; --summary-bg: #fff8eb; --summary-border: #f5d9a8; --code-bg: #f4f5f8;
  --shadow: 0 1px 2px rgba(16,24,40,.04), 0 6px 16px rgba(16,24,40,.05);
  --radius: 10px; --radius-sm: 7px; --maxw: 1200px; --topbar-h: 128px;
}
[data-theme="dark"] {
  color-scheme: dark;
  --font-sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --bg: #12141a; --surface: #1a1d24; --surface-2: #21242c; --text: #e7e9ee; --muted: #98a2b3;
  --border: #2a2e38; --border-strong: #3a3f4b; --accent: #8b8bf5; --accent-soft: #23263a; --accent-text: #b4b2ff;
  --prompt-bg: #1e2233; --summary-bg: #2a2419; --summary-border: #4a3c22; --code-bg: #22252d;
  --shadow: 0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.28);
  --radius: 10px; --radius-sm: 7px; --maxw: 1200px; --topbar-h: 128px;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #12141a; --surface: #1a1d24; --surface-2: #21242c; --text: #e7e9ee; --muted: #98a2b3;
    --border: #2a2e38; --border-strong: #3a3f4b; --accent: #8b8bf5; --accent-soft: #23263a; --accent-text: #b4b2ff;
    --prompt-bg: #1e2233; --summary-bg: #2a2419; --summary-border: #4a3c22; --code-bg: #22252d;
    --shadow: 0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.28);
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.62 var(--font-sans); -webkit-font-smoothing: antialiased; }
.wrap { max-width: var(--maxw); margin: 0 auto; padding: 0 20px; }
.skip-link { position: absolute; left: -9999px; top: 0; background: var(--accent); color: #fff; padding: 8px 12px; border-radius: 0 0 var(--radius-sm) 0; z-index: 40; }
.skip-link:focus { left: 0; }
button, input { font: inherit; color: inherit; }
button:focus-visible, a:focus-visible, input:focus-visible, .exchange:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.topbar { position: sticky; top: 0; z-index: 20; background: var(--bg); border-bottom: 1px solid var(--border); }
@supports (backdrop-filter: blur(6px)) { .topbar { background: color-mix(in srgb, var(--bg) 86%, transparent); backdrop-filter: blur(10px); } }
.topbar-inner { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 14px 20px 10px; }
h1 { font-size: 17px; line-height: 1.3; margin: 0 0 3px; letter-spacing: -.01em; }
h1 .session-name { color: var(--muted); font-weight: 500; }
.meta, .summary-info { color: var(--muted); font-size: 12.5px; margin: 1px 0; }
.toolbar { border-top: 1px solid var(--border); }
.toolbar-inner { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 9px 20px 11px; }
.search-box { position: relative; display: flex; align-items: center; flex: 1 1 260px; min-width: 200px; }
.search-box svg { position: absolute; left: 10px; width: 15px; height: 15px; color: var(--muted); pointer-events: none; }
.search-box input { width: 100%; padding: 7px 34px 7px 32px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--surface); }
.search-box kbd { position: absolute; right: 9px; font: 11px/1 var(--font-mono); color: var(--muted); border: 1px solid var(--border-strong); border-radius: 4px; padding: 3px 5px; background: var(--surface-2); }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { border: 1px solid var(--border-strong); background: var(--surface); border-radius: 999px; padding: 5px 11px; font-size: 12.5px; cursor: pointer; color: var(--muted); }
.chip:hover { border-color: var(--accent); color: var(--text); }
.chip.is-active { background: var(--accent); border-color: var(--accent); color: #fff; }
.toolbar-actions { display: flex; gap: 6px; }
.btn { border: 1px solid var(--border-strong); background: var(--surface); border-radius: var(--radius-sm); padding: 6px 11px; font-size: 12.5px; cursor: pointer; }
.btn:hover { border-color: var(--accent); color: var(--accent-text); }
.icon-btn { border: 1px solid var(--border-strong); background: var(--surface); border-radius: 999px; width: 34px; height: 34px; cursor: pointer; display: grid; place-items: center; flex: 0 0 auto; }
.icon-btn:hover { border-color: var(--accent); }
.topbar-actions { display: flex; gap: 8px; flex: 0 0 auto; }
.help-panel { border: 1px solid var(--border); border-radius: 14px; padding: 0; width: min(780px, calc(100vw - 32px)); max-height: min(82vh, 680px); overflow: auto; background: var(--surface); color: var(--text); box-shadow: 0 20px 60px rgba(0,0,0,.35); }
.help-panel::backdrop { background: rgba(12,14,19,.55); }
.help-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px 6px; position: sticky; top: 0; background: var(--surface); }
.help-body { padding: 0 18px 18px; }
.help-panel h2 { font-size: 16px; margin: 0; }
.help-panel h3 { font-size: 12px; margin: 14px 0 6px; color: var(--muted); text-transform: uppercase; letter-spacing: .07em; }
.help-panel p { margin: 0 0 4px; font-size: 13.5px; color: var(--muted); }
.help-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 4px 28px; }
.keys { list-style: none; margin: 0; padding: 0; font-size: 13.5px; }
.keys li { margin: 3px 0; }
.keys kbd { font: 11.5px/1 var(--font-mono); color: var(--muted); border: 1px solid var(--border-strong); border-radius: 4px; padding: 3px 5px; background: var(--surface-2); }
.help-code { background: var(--code-bg); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 12px; font: 12.5px/1.7 var(--font-mono); overflow-x: auto; margin: 0; }
.count { color: var(--muted); font-size: 12.5px; font-variant-numeric: tabular-nums; }
.layout { display: grid; grid-template-columns: minmax(200px, 280px) minmax(0, 1fr); gap: 22px; align-items: start; padding-top: 20px; padding-bottom: 48px; }
nav.toc { position: sticky; z-index: 1; top: calc(var(--topbar-h, 128px) + 16px); max-height: calc(100vh - var(--topbar-h, 128px) - 32px); max-height: calc(100dvh - var(--topbar-h, 128px) - 32px); overflow: auto; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 7px; box-shadow: var(--shadow); scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent; scrollbar-gutter: stable; }
nav.toc::-webkit-scrollbar { width: 8px; }
nav.toc::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 999px; }
nav.toc::-webkit-scrollbar-track { background: transparent; }
nav.toc a { display: flex; gap: 8px; align-items: baseline; padding: 6px 8px; border-radius: var(--radius-sm); color: var(--text); text-decoration: none; font-size: 13px; border-left: 2px solid transparent; }
nav.toc a:hover { background: var(--surface-2); }
nav.toc a.is-active { background: var(--accent-soft); border-left-color: var(--accent); color: var(--accent-text); }
.toc-index { color: var(--muted); min-width: 1.4em; text-align: right; font-variant-numeric: tabular-nums; }
.toc-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toc-badge { color: var(--muted); font-size: 11px; white-space: nowrap; }
.toc-summary { color: var(--accent); }
.toc-empty { color: var(--muted); font-size: 13px; padding: 4px 8px; }
main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.exchange { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 15px 17px; box-shadow: var(--shadow); scroll-margin-top: calc(var(--topbar-h, 128px) + 16px); }
.exchange.is-current { border-color: var(--accent); }
.exchange-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.index { display: inline-grid; place-items: center; min-width: 24px; height: 24px; padding: 0 6px; border-radius: 999px; background: var(--accent); color: #fff; font-size: 12.5px; font-weight: 700; }
.exchange-head time { color: var(--muted); font-size: 12.5px; }
.head-spacer { flex: 1; }
.copy-btn { border: 1px solid transparent; background: transparent; color: var(--muted); font-size: 12px; cursor: pointer; border-radius: var(--radius-sm); padding: 3px 8px; }
.copy-btn:hover { border-color: var(--border-strong); color: var(--text); background: var(--surface-2); }
.prompt { background: var(--prompt-bg); border-radius: var(--radius-sm); padding: 11px 13px; overflow-wrap: anywhere; font-weight: 500; }
.summary { background: var(--summary-bg); border: 1px solid var(--summary-border); border-radius: var(--radius-sm); padding: 9px 12px; margin: 12px 0 0; font-size: 14px; }
.badge { display: inline-block; font-size: 10px; letter-spacing: .08em; font-weight: 700; background: var(--accent); color: #fff; border-radius: 4px; padding: 1.5px 5px; margin-right: 6px; vertical-align: 1.5px; }
.md { overflow-wrap: anywhere; margin-top: 12px; }
.md > :first-child { margin-top: 0; }
.md > :last-child { margin-bottom: 0; }
.md p { margin: .6em 0; }
.md h3, .md h4, .md h5, .md h6 { margin: 1em 0 .4em; line-height: 1.3; letter-spacing: -.005em; }
.md ul, .md ol { margin: .5em 0; padding-left: 1.4em; }
.md li { margin: .2em 0; }
.md code { background: var(--code-bg); border: 1px solid var(--border); border-radius: 5px; padding: 1px 5px; font-size: .88em; font-family: var(--font-mono); }
.md pre.code { background: var(--code-bg); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 11px 13px; overflow-x: auto; }
.md pre.code code { background: none; border: none; padding: 0; font-size: .86em; }
.md blockquote { margin: .6em 0; padding: 4px 13px; border-left: 3px solid var(--accent); color: var(--muted); }
.md a { color: var(--accent-text); }
.md hr { border: none; border-top: 1px solid var(--border); margin: 1em 0; }
.md .table-wrap { overflow-x: auto; margin: .6em 0; }
.md table { border-collapse: collapse; font-size: .92em; }
.md th, .md td { border: 1px solid var(--border); padding: 5px 9px; text-align: left; }
.md th { background: var(--surface-2); }
.md del { color: var(--muted); }
details { margin-top: 8px; }
summary { cursor: pointer; color: var(--accent-text); font-size: 13px; border-radius: 5px; padding: 2px 4px; margin-left: -4px; }
summary:hover { background: var(--surface-2); }
.tools { color: var(--muted); font-size: 12.5px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 6px 10px; margin: 12px 0 0; }
.empty { color: var(--muted); font-style: italic; }
.empty-state { color: var(--muted); text-align: center; padding: 40px 0; }
.to-top { position: fixed; right: 22px; bottom: 22px; width: 40px; height: 40px; border-radius: 999px; border: 1px solid var(--border-strong); background: var(--surface); box-shadow: var(--shadow); cursor: pointer; font-size: 17px; z-index: 15; }
.toc-toggle { display: none; }
@media (max-width: 900px) {
  .topbar-inner { padding: 10px 20px 8px; }
  .title-block { min-width: 0; }
  h1 { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { display: none; }
  .toolbar-inner { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
  .toolbar-inner::-webkit-scrollbar { display: none; }
  .search-box { flex: 1 0 180px; }
  .chips { flex: 0 0 auto; flex-wrap: nowrap; }
  .toolbar-actions { flex: 0 0 auto; }
  .count { flex: 0 0 auto; }
  .layout { grid-template-columns: minmax(0, 1fr); }
  nav.toc { display: none; position: fixed; z-index: 25; inset: 0 25% 0 0; max-height: none; border-radius: 0; padding: 16px; overflow: auto; }
  body.toc-open nav.toc { display: block; }
  .toc-toggle { display: inline-block; }
}
@media (max-height: 520px) {
  .layout { grid-template-columns: minmax(0, 1fr); }
  nav.toc { display: none; position: fixed; z-index: 25; inset: 0 25% 0 0; max-height: none; border-radius: 0; padding: 16px; overflow: auto; scrollbar-gutter: auto; }
  body.toc-open nav.toc { display: block; }
  .toc-toggle { display: inline-block; }
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } * { transition: none !important; animation: none !important; } }
`;

const THEME_INIT = `try { var t = localStorage.getItem("recap-theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) {}`;

const HELP_PANEL = `<dialog id="recap-help-panel" class="help-panel" aria-labelledby="recap-help-title">
<div class="help-head">
<h2 id="recap-help-title">How this page works</h2>
<button id="recap-help-close" class="icon-btn" type="button" aria-label="Close help">✕</button>
</div>
<div class="help-body">
<p>Each block is one user question followed by the assistant answer. Tool calls, tool results, thinking, and system prompts are left out.</p>
<div class="help-grid">
<div>
<h3>Keyboard</h3>
<ul class="keys">
<li><kbd>/</kbd> focus search</li>
<li><kbd>Esc</kbd> clear search or close this dialog</li>
<li><kbd>j</kbd> / <kbd>k</kbd> next / previous exchange</li>
<li><kbd>e</kbd> / <kbd>c</kbd> expand / collapse answers</li>
<li><kbd>?</kbd> toggle this help</li>
</ul>
</div>
<div>
<h3>Generate another view</h3>
<pre class="help-code">/recap                  recap in the browser
/recap --messages       full transcript, no tool lines, no summaries
/recap --limit 20       last 20 exchanges
/recap --full           full answers, no shortening
/recap --summarize      add cached model TL;DRs
/recap --text           plain-text recap
/recap auto on|off      keep summaries fresh after each turn</pre>
</div>
</div>
<p class="meta">Alias: /user-messages · /recap --help describes every option in the terminal.</p>
</div>
</dialog>`;

const SCRIPT = `
(function () {
  var root = document.documentElement;
  var exchanges = Array.prototype.slice.call(document.querySelectorAll(".exchange"));
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll(".toc-link"));
  var search = document.getElementById("recap-search");
  var count = document.getElementById("recap-count");
  var emptyState = document.getElementById("recap-empty");
  var toTop = document.getElementById("recap-top");
  var topbar = document.querySelector(".topbar");
  var activeFilter = "all";

  function syncTopbar() {
    if (!topbar) return;
    root.style.setProperty("--topbar-h", Math.round(topbar.getBoundingClientRect().height) + "px");
  }
  syncTopbar();
  window.addEventListener("resize", syncTopbar);

  function keepVisible(link) {
    var nav = link.closest("nav.toc");
    if (!nav) return;
    var linkRect = link.getBoundingClientRect();
    var navRect = nav.getBoundingClientRect();
    if (linkRect.top < navRect.top + 4) nav.scrollTop -= navRect.top + 4 - linkRect.top;
    else if (linkRect.bottom > navRect.bottom - 4) nav.scrollTop += linkRect.bottom - navRect.bottom + 4;
  }

  function visible() { return exchanges.filter(function (item) { return !item.hidden; }); }

  function apply() {
    var tokens = (search.value || "").toLowerCase().split(/\\s+/).filter(Boolean);
    var shown = 0;
    exchanges.forEach(function (item) {
      var text = (item.textContent || "").toLowerCase();
      var passesFilter = activeFilter === "summarized" ? item.dataset.summary === "1"
        : activeFilter === "tools" ? Number(item.dataset.tools || "0") > 0
        : activeFilter === "unanswered" ? item.dataset.answered === "0"
        : true;
      var ok = passesFilter && tokens.every(function (token) { return text.indexOf(token) >= 0; });
      item.hidden = !ok;
      if (ok) shown++;
    });
    tocLinks.forEach(function (link) {
      var target = document.getElementById(link.dataset.target);
      link.hidden = !target || target.hidden;
    });
    count.textContent = shown + " / " + exchanges.length;
    emptyState.hidden = shown !== 0;
  }

  search.addEventListener("input", apply);
  document.getElementById("recap-expand").addEventListener("click", function () {
    document.querySelectorAll(".exchange details").forEach(function (details) { details.open = true; });
  });
  document.getElementById("recap-collapse").addEventListener("click", function () {
    document.querySelectorAll(".exchange details").forEach(function (details) { details.open = false; });
  });

  document.querySelectorAll(".chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      activeFilter = chip.dataset.filter;
      document.querySelectorAll(".chip").forEach(function (other) { other.classList.toggle("is-active", other === chip); });
      apply();
    });
  });

  var themeButton = document.getElementById("recap-theme");
  var helpButton = document.getElementById("recap-help");
  var helpPanel = document.getElementById("recap-help-panel");

  function toggleHelp(force) {
    var open = typeof force === "boolean" ? force : !helpPanel.open;
    if (open) {
      if (typeof helpPanel.showModal === "function") helpPanel.showModal();
      else helpPanel.setAttribute("open", "");
    } else if (typeof helpPanel.close === "function") helpPanel.close();
    else helpPanel.removeAttribute("open");
    helpButton.setAttribute("aria-expanded", String(open));
  }
  helpButton.addEventListener("click", function () { toggleHelp(); });
  document.getElementById("recap-help-close").addEventListener("click", function () { toggleHelp(false); });
  helpPanel.addEventListener("click", function (event) { if (event.target === helpPanel) toggleHelp(false); });
  helpPanel.addEventListener("close", function () { helpButton.setAttribute("aria-expanded", "false"); });
  themeButton.addEventListener("click", function () {
    var current = root.dataset.theme || "system";
    var next = current === "system" ? "light" : current === "light" ? "dark" : "system";
    if (next === "system") { delete root.dataset.theme; try { localStorage.removeItem("recap-theme"); } catch (e) {} }
    else { root.dataset.theme = next; try { localStorage.setItem("recap-theme", next); } catch (e) {} }
    themeButton.title = "Theme: " + next;
  });

  var tocToggle = document.getElementById("recap-toc-toggle");
  if (tocToggle) {
    tocToggle.addEventListener("click", function () {
      var open = document.body.classList.toggle("toc-open");
      tocToggle.setAttribute("aria-expanded", String(open));
    });
    tocLinks.forEach(function (link) {
      link.addEventListener("click", function () { document.body.classList.remove("toc-open"); tocToggle.setAttribute("aria-expanded", "false"); });
    });
  }

  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        tocLinks.forEach(function (link) {
          var on = link.dataset.target === entry.target.id;
          link.classList.toggle("is-active", on);
          if (on) { link.setAttribute("aria-current", "true"); keepVisible(link); }
          else link.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-15% 0px -70% 0px", threshold: 0 });
    exchanges.forEach(function (item) { observer.observe(item); });
  }

  function focusRelative(delta) {
    var list = visible();
    if (list.length === 0) return;
    var currentIndex = list.findIndex(function (item) { return item.classList.contains("is-current"); });
    var next = currentIndex === -1 ? (delta > 0 ? 0 : list.length - 1) : currentIndex + delta;
    next = Math.max(0, Math.min(list.length - 1, next));
    list.forEach(function (item) { item.classList.remove("is-current"); });
    list[next].classList.add("is-current");
    list[next].scrollIntoView({ behavior: "smooth", block: "start" });
    list[next].focus({ preventScroll: true });
  }

  function setDetails(open) {
    document.querySelectorAll(".exchange details").forEach(function (details) { details.open = open; });
  }

  document.addEventListener("keydown", function (event) {
    var tag = event.target && event.target.tagName;
    var typing = tag === "INPUT" || tag === "TEXTAREA" || (event.target && event.target.isContentEditable);
    if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) { event.preventDefault(); search.focus(); search.select(); return; }
    if (event.key === "Escape" && document.activeElement === search) { search.value = ""; apply(); search.blur(); return; }
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "j") { event.preventDefault(); focusRelative(1); }
    else if (event.key === "k") { event.preventDefault(); focusRelative(-1); }
    else if (event.key === "e") { setDetails(true); }
    else if (event.key === "c") { setDetails(false); }
    else if (event.key === "?") { event.preventDefault(); toggleHelp(); }
  });

  document.querySelectorAll(".copy-btn").forEach(function (button) {
    button.addEventListener("click", function () {
      var article = document.getElementById(button.dataset.copy);
      if (!article) return;
      var text = article.innerText.trim();
      navigator.clipboard.writeText(text).then(function () {
        button.textContent = "Copied";
        setTimeout(function () { button.textContent = "Copy"; }, 1200);
      }).catch(function () { button.textContent = "Copy failed"; });
    });
  });

  window.addEventListener("scroll", function () { toTop.hidden = window.scrollY < 400; }, { passive: true });
  toTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });

  apply();
})();
`;

export function renderRecapHtml(doc: RecapDocument): string {
	const session = doc.session;
	const exchanges = session.exchanges.map((exchange) => renderExchange(exchange, doc.previewChars, doc.messages)).join("\n");
	const toolbarControls = doc.messages
		? ""
		: `      <div class="chips" role="group" aria-label="Filter exchanges">
        <button class="chip is-active" type="button" data-filter="all">All</button>
        <button class="chip" type="button" data-filter="summarized">Summarized</button>
        <button class="chip" type="button" data-filter="tools">With tools</button>
        <button class="chip" type="button" data-filter="unanswered">Unanswered</button>
      </div>
      <div class="toolbar-actions">
        <button id="recap-expand" class="btn" type="button">Expand all</button>
        <button id="recap-collapse" class="btn" type="button">Collapse all</button>
      </div>`;
	const heading = doc.messages ? "Messages" : "Recap";
	const meta = [
		`session ${escapeHtml(session.sessionId)}`,
		session.cwd ? `cwd ${escapeHtml(session.cwd)}` : "",
		session.model ? `model ${escapeHtml(session.model)}` : "",
		`${formatCount(session.exchanges.length)} exchanges`,
		`generated ${escapeHtml(formatTimestamp(doc.generatedAt))}`,
	]
		.filter(Boolean)
		.join(" · ");

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${heading} — ${escapeHtml(doc.title)}</title>
<script>${THEME_INIT}</script>
<style>${STYLE}</style>
</head>
<body>
<a class="skip-link" href="#recap-main">Skip to content</a>
<header class="topbar">
  <div class="wrap topbar-inner">
    <div class="title-block">
      <h1>${heading} <span class="session-name">· ${escapeHtml(doc.title)}</span></h1>
      <p class="meta">${meta}</p>
      ${renderSummaryInfo(doc)}
    </div>
    <div class="topbar-actions">
      <button id="recap-help" class="icon-btn" type="button" title="Help (?)" aria-expanded="false" aria-controls="recap-help-panel">?</button>
      <button id="recap-theme" class="icon-btn" type="button" title="Theme: system" aria-label="Toggle color theme">🌗</button>
    </div>
  </div>
  <div class="toolbar">
    <div class="wrap toolbar-inner">
      <button id="recap-toc-toggle" class="btn toc-toggle" type="button" aria-expanded="false">Contents</button>
      <div class="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
        <input id="recap-search" type="search" placeholder="Search exchanges…" aria-label="Search exchanges">
        <kbd>/</kbd>
      </div>
${toolbarControls}
      <span class="count" id="recap-count" aria-live="polite"></span>
    </div>
  </div>
</header>
${HELP_PANEL}
<div class="wrap layout">
  <nav class="toc" id="recap-toc" aria-label="Session contents">
    ${renderToc(doc)}
  </nav>
  <main id="recap-main">
    ${exchanges || `<p class="empty">No user messages found in this session branch.</p>`}
    <p class="empty-state" id="recap-empty" hidden>No exchanges match this search.</p>
  </main>
</div>
<button id="recap-top" class="to-top" type="button" hidden aria-label="Back to top">↑</button>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

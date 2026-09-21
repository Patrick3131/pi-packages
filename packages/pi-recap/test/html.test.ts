import assert from "node:assert/strict";
import test from "node:test";

import type { RecapDocument } from "../src/document.js";
import { escapeHtml, renderRecapHtml } from "../src/html.js";
import type { RecapExchange } from "../src/session.js";

function exchange(overrides: Partial<RecapExchange> = {}): RecapExchange {
	return {
		index: 1,
		userEntryId: "aaaa1111",
		timestamp: "2026-09-21T10:00:00.000Z",
		userText: "How do I export a session?",
		answerText: "Use /export.",
		toolNames: ["bash"],
		toolCallCount: 2,
		toolErrorCount: 0,
		...overrides,
	};
}

function document(exchanges: RecapExchange[], previewChars = 320, messages = false): RecapDocument {
	return {
		title: "Recap session",
		generatedAt: "2026-09-21T12:00:00.000Z",
		previewChars,
		messages,
		session: {
			sessionId: "11111111-2222-3333-4444-555555555555",
			sessionFile: "/sessions/recap.jsonl",
			cwd: "/work/project",
			name: "Recap session",
			model: "anthropic/claude-sonnet-4-5",
			createdAt: "2026-09-21T09:00:00.000Z",
			stats: { totalEntries: 9, userMessages: 1, assistantMessages: 1, toolResults: 2, compactions: 0 },
			exchanges,
		},
	};
}

test("escapeHtml escapes every HTML-significant character", () => {
	assert.equal(
		escapeHtml(`<script>alert("x") &. 'y'</script>`),
		"&lt;script&gt;alert(&quot;x&quot;) &amp;. &#39;y&#39;&lt;/script&gt;",
	);
});

test("renderRecapHtml escapes message content and links the exchange and TOC", () => {
	const html = renderRecapHtml(
		document([
			exchange({
				userEntryId: "eeee5555",
				userText: "Use <b>bold</b> & 'quotes'?",
				answerText: "No <script>alert(1)</script> here.",
			}),
		]),
	);

	assert.ok(html.startsWith("<!DOCTYPE html>"));
	assert.ok(html.includes(`id="e-eeee5555"`));
	assert.ok(html.includes(`href="#e-eeee5555"`));
	assert.ok(html.includes("&lt;b&gt;bold&lt;/b&gt; &amp; &#39;quotes&#39;?"));
	assert.ok(html.includes("No &lt;script&gt;alert(1)&lt;/script&gt; here."));
	assert.equal(html.includes("<script>alert"), false);
	assert.equal(html.includes("<b>bold</b>"), false);
});

test("renderRecapHtml adds an expander only when the answer is truncated", () => {
	const long = `first line\n${"second line ".repeat(80)}`;
	const truncated = renderRecapHtml(document([exchange({ answerText: long })], 40));
	assert.ok(truncated.includes("<details"));
	assert.ok(truncated.includes("Show full answer"));

	const full = renderRecapHtml(document([exchange({ answerText: "short" })], 40));
	assert.equal(full.includes("<details"), false);

	const noTruncation = renderRecapHtml(document([exchange({ answerText: long })], Number.POSITIVE_INFINITY));
	assert.equal(noTruncation.includes("<details"), false);
});

test("renderRecapHtml summarizes tool activity without tool output", () => {
	const html = renderRecapHtml(
		document([
			exchange({
				toolNames: ["bash", "read"],
				toolCallCount: 14,
				toolErrorCount: 2,
			}),
		]),
	);
	assert.ok(html.includes("14 tool calls"));
	assert.ok(html.includes("bash"));
	assert.ok(html.includes("read"));
	assert.ok(html.includes("2 errors"));
});

test("renderRecapHtml renders markdown for prompts and answers", () => {
	const html = renderRecapHtml(
		document(
			[
				exchange({
					userText: "**Bold question** with `code`",
					answerText: "## Steps\n\n1. do this\n2. do that\n\n```ts\nconst x = 1;\n```",
				}),
			],
			Number.POSITIVE_INFINITY,
		),
	);
	assert.ok(html.includes("<strong>Bold question</strong>"));
	assert.ok(html.includes("<code>code</code>"));
	assert.ok(html.includes("<h4>Steps</h4>"));
	assert.ok(html.includes("<ol><li>do this</li><li>do that</li></ol>"));
	assert.ok(html.includes('<pre class="code"><code class="language-ts">const x = 1;</code></pre>'));
});

test("renderRecapHtml splits markdown previews at block boundaries", () => {
	const answer = ["First paragraph with detail.", "", "```ts", "const hidden = true;", "```", "", "Second paragraph."].join("\n");
	const html = renderRecapHtml(document([exchange({ answerText: answer })], 30));
	const [head, tail] = html.split("<details>");
	assert.ok(head.includes("<p>First paragraph with detail.</p>"));
	assert.equal(head.includes("const hidden = true;"), false, "preview must not include the fenced tail");
	assert.ok(tail.includes("Show full answer"));
	assert.ok(tail.includes('<pre class="code">'));
	assert.ok(tail.includes("const hidden = true;"));
	assert.ok(tail.includes("Second paragraph."));
});

test("renderRecapHtml exposes the recap toolbar, filters, and accessibility landmarks", () => {
	const html = renderRecapHtml(
		document(
			[exchange({ summary: "Has a TL;DR", toolCallCount: 3 })],
			Number.POSITIVE_INFINITY,
		),
	);
	for (const marker of [
		'class="skip-link"',
		'id="recap-main"',
		'id="recap-theme"',
		'id="recap-top"',
		'id="recap-toc-toggle"',
		'data-filter="summarized"',
		'data-filter="tools"',
		'data-filter="unanswered"',
		'class="toc-link"',
		'data-copy="e-aaaa1111"',
		'class="exchange" id="e-aaaa1111" tabindex="-1"',
		'data-summary="1"',
		'data-tools="3"',
		'data-answered="1"',
	]) {
		assert.ok(html.includes(marker), `missing marker: ${marker}`);
	}
	assert.ok(html.includes("IntersectionObserver"), "scrollspy script must be present");
	assert.ok(html.includes('localStorage.getItem("recap-theme")'), "theme init must run before paint");
	assert.ok(html.includes('event.key === "j"'), "keyboard navigation must be present");
	assert.ok(html.includes("calc(var(--topbar-h"), "sticky offsets must use the measured toolbar height");
	assert.ok(html.includes("syncTopbar"), "toolbar height sync must be present");
	assert.ok(html.includes("keepVisible"), "active TOC entries must stay in view");
	assert.ok(html.includes("scrollbar-width: thin"), "a clipped TOC must show a scroll affordance");
});

test("renderRecapHtml includes an in-page help panel for flags and shortcuts", () => {
	const html = renderRecapHtml(document([exchange()], Number.POSITIVE_INFINITY));
	assert.ok(html.includes('id="recap-help"'));
	assert.ok(html.includes('<dialog id="recap-help-panel"'));
	assert.ok(html.includes('id="recap-help-close"'));
	assert.ok(html.includes("showModal"), "help must open as a modal so it is visible at any scroll position");
	assert.ok(html.includes("How this page works"));
	assert.ok(html.includes("/recap --messages"));
	assert.ok(html.includes("toggle this help"));
});

test("renderRecapHtml messages mode drops recap chrome and keeps full answers", () => {
	const answer = `first line\n${"more text ".repeat(80)}`;
	const html = renderRecapHtml(
		document([exchange({ answerText: answer, summary: "ignored summary", toolCallCount: 5, toolNames: ["bash"] })], Number.POSITIVE_INFINITY, true),
	);
	assert.ok(html.includes("<title>Messages — Recap session</title>"));
	assert.equal(html.includes("first line"), true);
	assert.equal(html.includes("more text more text"), true, "messages mode renders the full answer");
	assert.equal(html.includes('class="tools"'), false);
	assert.equal(html.includes('class="summary"'), false);
	assert.equal(html.includes("ignored summary"), false);
	assert.equal(html.includes('data-filter="summarized"'), false, "filter chips are recap-only");
	assert.equal(html.includes("<details"), false);
});

test("renderRecapHtml renders summaries, stats, and search controls", () => {
	const html = renderRecapHtml(
		document([exchange({ summary: "Explained /export and browser filters." })]),
	);
	assert.ok(html.includes("Explained /export and browser filters."));
	assert.ok(html.includes("TL;DR"));
	assert.ok(html.includes('id="recap-search"'));
	assert.ok(html.includes('id="recap-expand"'));
	assert.ok(html.includes("11111111-2222-3333-4444-555555555555"));
});

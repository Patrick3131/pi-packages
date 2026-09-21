import assert from "node:assert/strict";
import test from "node:test";

import { escapeHtml } from "../src/escape.js";
import { renderMarkdown, splitMarkdown } from "../src/markdown.js";

test("escapeHtml escapes every HTML-significant character", () => {
	assert.equal(
		escapeHtml(`<script>alert("x") &. 'y'</script>`),
		"&lt;script&gt;alert(&quot;x&quot;) &amp;. &#39;y&#39;&lt;/script&gt;",
	);
});

test("renderMarkdown escapes raw HTML instead of passing it through", () => {
	const html = renderMarkdown('Before <img src=x onerror=alert(1)> after\n\n<script>alert("x")</script>');
	assert.equal(html.includes("<img"), false);
	assert.equal(html.includes("<script>"), false);
	assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
	assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"));
});

test("renderMarkdown renders headings, lists, tables, blockquotes, and rules", () => {
	const html = renderMarkdown(
		[
			"## Findings",
			"",
			"- first item",
			"- second item",
			"  - nested item",
			"",
			"1. ordered one",
			"2. ordered two",
			"",
			"| Name | Value |",
			"| --- | --- |",
			"| alpha | 1 |",
			"",
			"> quoted advice",
			"",
			"---",
		].join("\n"),
	);
	assert.ok(html.includes("<h4>Findings</h4>"));
	assert.ok(html.includes("<ul><li>first item</li><li>second item<ul><li>nested item</li></ul></li></ul>"));
	assert.ok(html.includes("<ol><li>ordered one</li><li>ordered two</li></ol>"));
	assert.ok(html.includes("<table>"));
	assert.ok(html.includes("<th>Name</th>"));
	assert.ok(html.includes("<td>alpha</td>"));
	assert.ok(html.includes("<blockquote>"));
	assert.ok(html.includes("quoted advice"));
	assert.ok(html.includes("<hr>"));
});

test("renderMarkdown renders fenced code verbatim without inline formatting", () => {
	const html = renderMarkdown(['```ts', 'const bold = "**not bold**";', "<div>raw</div>", "```"].join("\n"));
	assert.ok(html.includes('<pre class="code"><code class="language-ts">'));
	assert.ok(html.includes("const bold = &quot;**not bold**&quot;;"));
	assert.ok(html.includes("&lt;div&gt;raw&lt;/div&gt;"));
	assert.equal(html.includes("<strong>"), false);
	assert.equal(html.includes("<div>raw</div>"), false);
});

test("renderMarkdown applies inline code, emphasis, strikethrough, and safe links", () => {
	const html = renderMarkdown(
		"Use `npm test` and **bold** and *italic* and ~~gone~~ and [docs](https://pi.dev/docs) and <https://pi.dev/agents> now.",
	);
	assert.ok(html.includes("<code>npm test</code>"));
	assert.ok(html.includes("<strong>bold</strong>"));
	assert.ok(html.includes("<em>italic</em>"));
	assert.ok(html.includes("<del>gone</del>"));
	assert.ok(html.includes('<a href="https://pi.dev/docs" target="_blank" rel="noreferrer">docs</a>'));
	assert.ok(html.includes('<a href="https://pi.dev/agents" target="_blank" rel="noreferrer">https://pi.dev/agents</a>'));

	const unsafe = renderMarkdown("[click](javascript:alert(1)) and bare https://pi.dev/docs");
	assert.equal(unsafe.includes("javascript:"), false);
	assert.equal(unsafe.includes("<a"), false);
});

test("splitMarkdown keeps the preview outside fences and preserves the source", () => {
	const source = [
		"Intro paragraph that is long enough to matter.",
		"",
		"```ts",
		"const a = 1;",
		"const b = 2;",
		"```",
		"",
		"Closing paragraph.",
	].join("\n");
	const split = splitMarkdown(source, 20);
	assert.equal(split.truncated, true);
	assert.equal(split.head + "\n\n" + split.tail, source);
	assert.equal(split.head.includes("```"), false, "preview must not contain an unclosed fence");
	assert.ok(split.tail.includes("Closing paragraph."));
});

test("splitMarkdown falls back to a word boundary with no blank lines", () => {
	const source = "first line\nsecond line\nthird line";
	const split = splitMarkdown(source, 16);
	assert.equal(split.truncated, true);
	assert.equal(split.head, "first line");
	assert.equal(split.tail, "second line\nthird line");
});

test("splitMarkdown reports no truncation for short text", () => {
	assert.deepEqual(splitMarkdown("short answer", 100), { head: "short answer", tail: "", truncated: false });
});

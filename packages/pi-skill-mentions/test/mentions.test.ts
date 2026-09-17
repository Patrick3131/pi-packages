import assert from "node:assert/strict";
import { test } from "node:test";

import {
	expandSkillMentions,
	formatMention,
	formatSkillBlock,
	parseSkillMentions,
	type SkillRef,
} from "../src/mentions.js";

const ALPHA: SkillRef = {
	name: "alpha",
	filePath: "/skills/alpha/SKILL.md",
	baseDir: "/skills/alpha",
};

const BETA: SkillRef = {
	name: "beta-tools",
	filePath: "/skills/beta-tools/SKILL.md",
	baseDir: "/skills/beta-tools",
};

const FILES: Record<string, string> = {
	[ALPHA.filePath]: "---\nname: alpha\ndescription: Alpha skill.\n---\n\n# Alpha\n\nDo alpha things.\n",
	[BETA.filePath]: "# Beta\n\nDo beta things.\n",
};

const SKILLS = new Map<string, SkillRef>([
	[ALPHA.name, ALPHA],
	[BETA.name, BETA],
]);

function expand(text: string, skills: Map<string, SkillRef> = SKILLS) {
	return expandSkillMentions({
		text,
		skills,
		read: (filePath) => {
			const content = FILES[filePath];
			if (content === undefined) {
				throw new Error(`ENOENT: ${filePath}`);
			}
			return content;
		},
	});
}

test("a mention in the middle of a message expands in place", () => {
	const result = expand("Please run $alpha and report back.");
	assert.deepEqual(result.expanded, ["alpha"]);
	assert.deepEqual(result.problems, []);
	assert.ok(result.text.startsWith("Please run <skill name=\"alpha\" location=\"/skills/alpha/SKILL.md\">"));
	assert.ok(result.text.endsWith("</skill> and report back."));
});

test("frontmatter is stripped and the body is kept verbatim", () => {
	const result = expand("$alpha");
	assert.ok(result.text.includes("\n# Alpha\n\nDo alpha things.\n</skill>"));
	assert.ok(!result.text.includes("description:"));
});

test("several skills expand from one message, in mention order", () => {
	const result = expand("$beta-tools then $alpha");
	assert.deepEqual(result.expanded, ["beta-tools", "alpha"]);
	assert.ok(result.text.indexOf('name="beta-tools"') < result.text.indexOf('name="alpha"'));
});

test("a leading /skill: mention is left for Pi to expand itself", () => {
	const result = expand("/skill:alpha now also $beta-tools");
	assert.deepEqual(result.expanded, ["beta-tools"]);
	assert.ok(result.text.startsWith("/skill:alpha now also <skill name=\"beta-tools\""));
});

test("a non-leading /skill: mention is expanded here", () => {
	const result = expand("compare /skill:alpha with /skill:beta-tools");
	assert.deepEqual(result.expanded, ["alpha", "beta-tools"]);
	assert.ok(!result.text.includes("/skill:"));
});

test("a message that is only a leading /skill: mention is untouched", () => {
	const text = "/skill:alpha";
	const result = expand(text);
	assert.equal(result.text, text);
	assert.deepEqual(result.expanded, []);
});

test("multi-line messages keep every mention", () => {
	const result = expand("first\n$alpha\nsecond\n$beta-tools\n");
	assert.deepEqual(result.expanded, ["alpha", "beta-tools"]);
	assert.ok(result.text.startsWith("first\n<skill"));
	assert.ok(result.text.endsWith("</skill>\n"));
});

test("a quoted mention still expands", () => {
	const result = expand('use "$alpha" for that');
	assert.deepEqual(result.expanded, ["alpha"]);
	assert.ok(result.text.startsWith('use "<skill'));
});

test("an escaped mention stays literal and loses its backslash", () => {
	const result = expand("This is how you write \\$alpha in prose.");
	assert.deepEqual(result.expanded, []);
	assert.equal(result.text, "This is how you write $alpha in prose.");
});

test("an escaped mention next to a real one only expands the real one", () => {
	const result = expand("literal \\$alpha and real $beta-tools");
	assert.deepEqual(result.expanded, ["beta-tools"]);
	assert.ok(result.text.startsWith("literal $alpha and real <skill"));
});

test("a repeated skill expands once and degrades to its bare name", () => {
	const result = expand("$alpha and again $alpha");
	assert.deepEqual(result.expanded, ["alpha"]);
	assert.equal(result.text.match(/<skill /g)?.length, 1);
	assert.ok(result.text.endsWith("</skill> and again alpha"));
});

test("shell text is never treated as a mention", () => {
	for (const text of [
		"echo $HOME",
		"set -e; echo $1",
		"cd $(pwd)",
		"echo ${VAR}",
		"costs $5",
		"x=$y",
		"curl http://host/$PATH",
	]) {
		const result = expand(text);
		assert.equal(result.text, text, text);
		assert.deepEqual(result.expanded, [], text);
		assert.deepEqual(result.problems, [], text);
	}
});

test("an unresolved $name is left alone without a warning", () => {
	const result = expand("copy $src to $target now");
	assert.deepEqual(result.expanded, []);
	assert.deepEqual(result.problems, [], "shell variables must not raise warnings");
	assert.equal(result.text, "copy $src to $target now");
});

test("an unresolved /skill: name is reported", () => {
	const result = expand("use /skill:missing please");
	assert.deepEqual(result.expanded, []);
	assert.deepEqual(result.problems, [{ name: "missing", form: "command", reason: "not loaded in this session" }]);
	assert.equal(result.text, "use /skill:missing please");
});

test("an unresolved mention does not stop a resolved one", () => {
	const result = expand("$missing then $alpha and /skill:also-missing");
	assert.deepEqual(result.expanded, ["alpha"]);
	assert.deepEqual(result.problems.map((problem) => problem.name), ["also-missing"]);
	assert.ok(result.text.startsWith("$missing then <skill"));
	assert.ok(result.text.endsWith("</skill> and /skill:also-missing"));
});

test("a failed read is reported and the mention is left intact", () => {
	const broken: SkillRef = { name: "broken", filePath: "/skills/broken/SKILL.md", baseDir: "/skills/broken" };
	const result = expand("$broken", new Map([[broken.name, broken]]));
	assert.deepEqual(result.expanded, []);
	assert.deepEqual(result.problems, [{ name: "broken", form: "dollar", reason: "ENOENT: /skills/broken/SKILL.md" }]);
	assert.equal(result.text, "$broken");
});

test("text without mentions is returned unchanged", () => {
	const text = "no skills here, just a $ and skill: and /skill without a name";
	const result = expand(text);
	assert.equal(result.text, text);
	assert.deepEqual(result.expanded, []);
	assert.deepEqual(result.problems, []);
});

test("names that cannot be skill names are not mentions", () => {
	for (const text of ["$", "$Alpha", "$-alpha", "$1", "/skill:Alpha", "/skill:"]) {
		const result = expand(text);
		assert.deepEqual(result.expanded, [], text);
		assert.equal(result.text, text);
	}
});

test("parseSkillMentions reports spans and forms", () => {
	assert.deepEqual(parseSkillMentions("$alpha /skill:beta-tools"), [
		{ name: "alpha", form: "dollar", start: 0, end: 6, escaped: false },
		{ name: "beta-tools", form: "command", start: 7, end: 24, escaped: false },
	]);
});

test("formatMention echoes the spelling that was used", () => {
	assert.equal(formatMention("alpha", "dollar"), "$alpha");
	assert.equal(formatMention("alpha", "command"), "/skill:alpha");
});

test("formatSkillBlock matches Pi's own skill block shape", () => {
	assert.equal(
		formatSkillBlock(ALPHA, "# Alpha"),
		'<skill name="alpha" location="/skills/alpha/SKILL.md">\nReferences are relative to /skills/alpha.\n\n# Alpha\n</skill>',
	);
});

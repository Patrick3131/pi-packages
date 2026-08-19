import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatSkillBlock,
  loadAllPackageSkills,
  loadPackageSkill,
  PACKAGE_SKILL_NAMES,
  packageRootFromModuleUrl,
  siblingSkillExists,
  skillFilePath,
  stripFrontmatter,
} from "../src/skills.js";
import {
  buildImplementPrompt,
  buildPlanAndImplementPrompt,
  buildPlanPrompt,
  buildSkillHandoffMessage,
} from "../src/prompts.js";
import type { WorkPackage } from "../src/types.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(packageRoot, "../..");

test("managed global settings exclude repo-local workflow skill duplicates", () => {
  const settings = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "configs/global/settings.json"), "utf8")) as {
    packages: Array<string | { source?: string; skills?: string[] }>;
  };
  const melonPackage = settings.packages.find((entry) =>
    typeof entry === "object" && entry.source === "git:github.com/Patrick3131/pi-packages"
  );
  assert.ok(melonPackage && typeof melonPackage === "object");
  assert.deepEqual(melonPackage.skills, ["!packages/pi-work/skills/**"]);
});

test("packageRootFromModuleUrl resolves package root", () => {
  assert.equal(packageRootFromModuleUrl(import.meta.url), packageRoot);
});

test("all three package skills load without missing files", () => {
  const skills = loadAllPackageSkills(packageRoot);
  assert.equal(skills.length, 3);
  for (const name of PACKAGE_SKILL_NAMES) {
    const skill = skills.find((s) => s.name === name);
    assert.ok(skill, `missing skill ${name}`);
    assert.ok(skill!.body.length > 50, `${name} body too short`);
    assert.equal(skill!.disableModelInvocation, true, `${name} must be operator-only`);
    assert.ok(skill!.description && skill!.description.length > 0);
    assert.equal(fs.existsSync(skill!.filePath), true);
  }
});

test("shared work templates and testing policy are shipped", () => {
  const sharedDir = path.join(packageRoot, "skills", "_shared");
  const templateNames = ["work-item.md", "to-do-list.md", "test-plan.md"];
  for (const name of templateNames) {
    const filePath = path.join(sharedDir, "templates", name);
    assert.equal(fs.existsSync(filePath), true, `missing template ${name}`);
    const body = fs.readFileSync(filePath, "utf8");
    assert.match(body, /^---\nstatus: backlog/m);
  }

  const policy = fs.readFileSync(path.join(sharedDir, "testing-policy.md"), "utf8");
  assert.match(policy, /No automated test needed/);
  assert.match(policy, /zero to three new automated cases/);
  assert.match(policy, /material production behavior/);
});

test("stripFrontmatter removes yaml fence", () => {
  const raw = `---\nname: x\n---\n\n# Body\n`;
  assert.equal(stripFrontmatter(raw).trim(), "# Body");
});

test("formatSkillBlock matches Pi expansion shape", () => {
  const skill = loadPackageSkill("task-and-plan-routing", packageRoot);
  const block = formatSkillBlock(skill, "User: do the thing");
  assert.match(block, /^<skill name="task-and-plan-routing" location="/);
  assert.match(block, /References are relative to /);
  assert.match(block, /<\/skill>\n\nUser: do the thing$/);
  assert.match(block, /# Create Work Package/);
  // frontmatter should not appear in body portion after location line
  assert.doesNotMatch(block, /disable-model-invocation/);
});

test("composite skill can resolve sibling skill paths", () => {
  const composite = loadPackageSkill("plan-and-implement-runner", packageRoot);
  assert.equal(
    siblingSkillExists(composite.baseDir, "../task-and-plan-routing/SKILL.md"),
    true
  );
  assert.equal(
    siblingSkillExists(composite.baseDir, "../implement-tdd-review-runner/SKILL.md"),
    true
  );
  assert.match(composite.body, /\.\.\/task-and-plan-routing\/SKILL\.md/);
  assert.match(composite.body, /\.\.\/implement-tdd-review-runner\/SKILL\.md/);
});

test("/work handoffs embed full skill body", () => {
  const plan = buildPlanPrompt("add export", packageRoot);
  assert.match(plan, /<skill name="task-and-plan-routing"/);
  assert.match(plan, /# Create Work Package/);
  assert.match(plan, /add export/);
  assert.doesNotMatch(plan, /Load and follow the `task-and-plan-routing` skill/);

  const planImpl = buildPlanAndImplementPrompt("ship search", packageRoot);
  assert.match(planImpl, /<skill name="plan-and-implement-runner"/);
  assert.match(planImpl, /# Plan And Implement/);
  assert.match(planImpl, /COMPLETE or BLOCKED/);

  const pkg: WorkPackage = {
    baseName: "2026-04-15-feature-foo",
    title: "Foo",
    status: "in_progress",
    type: "feature",
    date: "2026-04-15",
    lifecycle: "open",
    dir: "/repo/docs/work/work",
    primary: {
      path: "/repo/docs/work/work/2026-04-15-feature-foo.md",
      relativePath: "docs/work/work/2026-04-15-feature-foo.md",
      kind: "primary",
      title: "Foo",
      frontmatter: { status: "in_progress" },
      preview: "x",
      mtimeMs: 1,
    },
    todo: {
      path: "/repo/docs/work/work/2026-04-15-feature-foo-to-do-list.md",
      relativePath: "docs/work/work/2026-04-15-feature-foo-to-do-list.md",
      kind: "todo",
      title: "Foo To-Do",
      frontmatter: { status: "in_progress" },
      preview: "- [ ] a",
      mtimeMs: 1,
    },
    test: {
      path: "/repo/docs/work/work/2026-04-15-feature-foo-test.md",
      relativePath: "docs/work/work/2026-04-15-feature-foo-test.md",
      kind: "test",
      title: "Foo Test",
      frontmatter: { status: "in_progress" },
      preview: "No automated test needed",
      mtimeMs: 1,
    },
    others: [],
    files: [],
    mtimeMs: 1,
  };

  const implement = buildImplementPrompt(pkg, packageRoot);
  assert.match(implement, /<skill name="implement-tdd-review-runner"/);
  assert.match(implement, /# Execute Work Package/);
  assert.match(implement, /2026-04-15-feature-foo\.md/);
  assert.equal(implement.includes(loadPackageSkill("implement-tdd-review-runner", packageRoot).body.slice(0, 80)), true);
});

test("buildSkillHandoffMessage loads known skills", () => {
  const msg = buildSkillHandoffMessage("task-and-plan-routing", "hello", packageRoot);
  assert.match(msg, /<skill name="task-and-plan-routing"/);
  assert.match(msg, /hello$/);
});

test("skillFilePath points at SKILL.md", () => {
  const p = skillFilePath("task-and-plan-routing", packageRoot);
  assert.equal(path.basename(p), "SKILL.md");
  assert.equal(fs.existsSync(p), true);
});

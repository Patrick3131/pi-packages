import test from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildImplementPrompt,
  buildImplementUserArgs,
  buildPlanAndImplementPrompt,
  buildPlanAndImplementUserArgs,
  buildPlanPrompt,
  buildPlanUserArgs,
  buildReadPrompt,
} from "../src/prompts.js";
import type { WorkPackage } from "../src/types.js";
import { parseWorkArgs } from "../src/index.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function samplePkg(complete: boolean): WorkPackage {
  return {
    baseName: "2026-04-15-feature-foo",
    title: "Foo Feature",
    status: "in_progress",
    type: "feature",
    date: "2026-04-15",
    lifecycle: "open",
    dir: "/repo/docs/work/work",
    primary: {
      path: "/repo/docs/work/work/2026-04-15-feature-foo.md",
      relativePath: "docs/work/work/2026-04-15-feature-foo.md",
      kind: "primary",
      title: "Foo Feature",
      frontmatter: { status: "in_progress" },
      preview: "Problem text",
      mtimeMs: 1,
    },
    todo: complete
      ? {
          path: "/repo/docs/work/work/2026-04-15-feature-foo-to-do-list.md",
          relativePath: "docs/work/work/2026-04-15-feature-foo-to-do-list.md",
          kind: "todo",
          title: "Foo Feature To-Do",
          frontmatter: { status: "in_progress" },
          preview: "- [ ] task",
          mtimeMs: 1,
        }
      : undefined,
    test: complete
      ? {
          path: "/repo/docs/work/work/2026-04-15-feature-foo-test.md",
          relativePath: "docs/work/work/2026-04-15-feature-foo-test.md",
          kind: "test",
          title: "Foo Feature Test Plan",
          frontmatter: { status: "in_progress" },
          preview: "No automated test needed",
          mtimeMs: 1,
        }
      : undefined,
    others: [],
    files: [],
    mtimeMs: 1,
  };
}

test("buildReadPrompt includes title and path", () => {
  const prompt = buildReadPrompt(samplePkg(true), "package");
  assert.match(prompt, /Foo Feature/);
  assert.match(prompt, /2026-04-15-feature-foo\.md/);
  assert.match(prompt, /to-do-list/);
  assert.match(prompt, /Implementation readiness/);
});

test("buildImplementUserArgs warns on incomplete package", () => {
  const incomplete = buildImplementUserArgs(samplePkg(false));
  assert.match(incomplete, /incomplete/i);
  const complete = buildImplementUserArgs(samplePkg(true));
  assert.match(complete, /implement-tdd-review/);
  assert.match(complete, /All three package files are present/);
  assert.match(complete, /COMPLETE or BLOCKED/);
});

test("buildPlanUserArgs includes topic and flat-folder rule", () => {
  const prompt = buildPlanUserArgs("add dark mode");
  assert.match(prompt, /task-and-plan-routing/);
  assert.match(prompt, /add dark mode/);
  assert.match(prompt, /Type is metadata only/);
});

test("buildPlanAndImplementUserArgs references both phases and completion", () => {
  const prompt = buildPlanAndImplementUserArgs("ship search");
  assert.match(prompt, /Phase A/);
  assert.match(prompt, /Phase B/);
  assert.match(prompt, /COMPLETE or BLOCKED/);
});

test("handoff prompts embed skill XML blocks", () => {
  assert.match(buildPlanPrompt("x", packageRoot), /<skill name="task-and-plan-routing"/);
  assert.match(
    buildPlanAndImplementPrompt("x", packageRoot),
    /<skill name="plan-and-implement-runner"/
  );
  assert.match(
    buildImplementPrompt(samplePkg(true), packageRoot),
    /<skill name="implement-tdd-review-runner"/
  );
});

test("parseWorkArgs handles subcommands and free query", () => {
  assert.deepEqual(parseWorkArgs(""), {});
  assert.deepEqual(parseWorkArgs("finished login"), { sub: "finished", query: "login" });
  assert.deepEqual(parseWorkArgs("agency director"), { query: "agency director" });
  assert.deepEqual(parseWorkArgs("plan-implement dark mode"), {
    sub: "plan-implement",
    query: "dark mode",
  });
});

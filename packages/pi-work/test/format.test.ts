import test from "node:test";
import assert from "node:assert/strict";

import {
  formatPackageDetail,
  formatPackageLabel,
  formatSelectItems,
  isGroupHeaderLabel,
} from "../src/format.js";
import type { WorkPackage } from "../src/types.js";

function pkg(overrides: Partial<WorkPackage> = {}): WorkPackage {
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
      preview: "Need foo",
      mtimeMs: 1,
    },
    others: [],
    files: [],
    mtimeMs: 1,
    ...overrides,
  };
}

test("formatPackageLabel marks incomplete packages and readiness", () => {
  const label = formatPackageLabel(pkg());
  assert.match(label, /○/);
  assert.match(label, /Foo Feature/);
  assert.match(label, /feature/);
  assert.match(label, /blocked|intake|ready/);
});

test("formatPackageDetail lists missing companions and readiness", () => {
  const detail = formatPackageDetail(pkg());
  assert.match(detail, /missing: to-do-list, test plan/);
  assert.match(detail, /primary: docs\/work\/work\/2026-04-15-feature-foo\.md/);
  assert.match(detail, /Implementation readiness/);
});

test("formatSelectItems groups by type with headers", () => {
  const feature = pkg({ title: "Feat", type: "feature", baseName: "2026-04-15-feature-a", mtimeMs: 3 });
  const bug = pkg({
    title: "Bug",
    type: "bug",
    baseName: "2026-04-16-bug-b",
    date: "2026-04-16",
    mtimeMs: 2,
  });
  const idea = pkg({
    title: "Idea",
    type: "idea",
    status: "idea",
    baseName: "2026-04-17-idea-c",
    date: "2026-04-17",
    mtimeMs: 1,
  });

  const { labels, byLabel } = formatSelectItems([idea, bug, feature], { groupByType: true });
  assert.ok(labels.some((l) => l === "--- feature ---"));
  assert.ok(labels.some((l) => l === "--- bug ---"));
  assert.ok(labels.some((l) => l === "--- idea ---"));
  // headers not in byLabel
  assert.equal(byLabel.has("--- feature ---"), false);
  assert.equal(byLabel.size, 3);
  // feature group before bug before idea per TYPE_ORDER
  const fi = labels.indexOf("--- feature ---");
  const bi = labels.indexOf("--- bug ---");
  const ii = labels.indexOf("--- idea ---");
  assert.ok(fi < bi && bi < ii);
});

test("formatSelectItems keeps labels unique", () => {
  const a = pkg({ title: "Same" });
  const b = pkg({ title: "Same", baseName: "2026-04-16-feature-bar", date: "2026-04-16" });
  const { labels, byLabel } = formatSelectItems([a, b], { groupByType: false });
  const packageLabels = labels.filter((l) => !isGroupHeaderLabel(l));
  assert.equal(packageLabels.length, 2);
  assert.equal(new Set(packageLabels).size, 2);
  assert.equal(byLabel.size, 2);
});

test("isGroupHeaderLabel", () => {
  assert.equal(isGroupHeaderLabel("--- feature ---"), true);
  assert.equal(isGroupHeaderLabel("● [open/backlog] feature ready Foo"), false);
});

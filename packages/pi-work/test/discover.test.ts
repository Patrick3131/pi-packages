import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { resolveWorkConfig } from "../src/config.js";
import {
  discoverWorkPackages,
  packageCompleteness,
  resolvePackageFromPath,
} from "../src/discover.js";

function write(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function makeRepo(): { cwd: string; cleanup: () => void } {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-work-"));
  return {
    cwd,
    cleanup: () => fs.rmSync(cwd, { recursive: true, force: true }),
  };
}

const primary = `---
status: in_progress
owner: engineering
last_reviewed: 2026-04-15
canonical_ref: none
---

# Agency Research Director

## Type

feature

## Problem

Need a director.
`;

const todo = `---
status: in_progress
owner: engineering
last_reviewed: 2026-04-15
canonical_ref: none
---

# Agency Research Director To-Do

## Tasks

- [ ] Implement
`;

const testDoc = `---
status: in_progress
owner: engineering
last_reviewed: 2026-04-15
canonical_ref: none
---

# Agency Research Director Test Plan

## Test Strategy

No automated test needed
`;

test("discoverWorkPackages groups companions and skips guidance docs", () => {
  const { cwd, cleanup } = makeRepo();
  try {
    const open = path.join(cwd, "docs/work/work");
    write(path.join(cwd, "docs/work/AGENTS.md"), "# agents\n");
    write(path.join(cwd, "docs/work/README.md"), "# readme\n");
    write(path.join(open, "2026-04-15-feature-agency-research-director.md"), primary);
    write(path.join(open, "2026-04-15-feature-agency-research-director-to-do-list.md"), todo);
    write(path.join(open, "2026-04-15-feature-agency-research-director-test.md"), testDoc);
    write(path.join(open, "2026-04-10-bug-login.md"), `---\nstatus: backlog\n---\n\n# Login Bug\n\n## Type\n\nbug\n`);

    const cfg = resolveWorkConfig({ cwd, env: {} });
    const packages = discoverWorkPackages(cfg, { lifecycle: "open" });
    assert.equal(packages.length, 2);

    const full = packages.find((p) => p.baseName.includes("agency-research"));
    assert.ok(full);
    assert.equal(full!.title, "Agency Research Director");
    assert.equal(full!.type, "feature");
    assert.equal(full!.status, "in_progress");
    assert.equal(packageCompleteness(full!).complete, true);

    const bug = packages.find((p) => p.baseName.includes("login"));
    assert.ok(bug);
    assert.equal(packageCompleteness(bug!).complete, false);
    assert.deepEqual(packageCompleteness(bug!).missing.sort(), ["test plan", "to-do-list"]);
  } finally {
    cleanup();
  }
});

test("discoverWorkPackages filters by query and lifecycle", () => {
  const { cwd, cleanup } = makeRepo();
  try {
    write(path.join(cwd, "docs/work/work/2026-04-15-feature-foo.md"), primary);
    write(
      path.join(cwd, "docs/work/finished/2026-01-01-bug-old.md"),
      `---\nstatus: done\n---\n\n# Old Bug\n\n## Type\n\nbug\n`
    );

    const cfg = resolveWorkConfig({ cwd, env: {} });
    assert.equal(discoverWorkPackages(cfg, { lifecycle: "open" }).length, 1);
    assert.equal(discoverWorkPackages(cfg, { lifecycle: "finished" }).length, 1);
    assert.equal(discoverWorkPackages(cfg, { lifecycle: "all" }).length, 2);
    assert.equal(discoverWorkPackages(cfg, { lifecycle: "all", query: "old" }).length, 1);
    assert.equal(discoverWorkPackages(cfg, { lifecycle: "all", query: "agency" }).length, 1);
  } finally {
    cleanup();
  }
});

test("resolvePackageFromPath finds companions", () => {
  const { cwd, cleanup } = makeRepo();
  try {
    const open = path.join(cwd, "docs/work/work");
    const primaryPath = path.join(open, "2026-04-15-feature-agency-research-director.md");
    write(primaryPath, primary);
    write(path.join(open, "2026-04-15-feature-agency-research-director-to-do-list.md"), todo);
    write(path.join(open, "2026-04-15-feature-agency-research-director-test.md"), testDoc);

    const cfg = resolveWorkConfig({ cwd, env: {} });
    const pkg = resolvePackageFromPath(cfg, primaryPath);
    assert.ok(pkg);
    assert.equal(pkg!.todo?.path.endsWith("-to-do-list.md"), true);
    assert.equal(pkg!.test?.path.endsWith("-test.md"), true);
  } finally {
    cleanup();
  }
});

test("topic subfolders are discovered", () => {
  const { cwd, cleanup } = makeRepo();
  try {
    write(
      path.join(cwd, "docs/work/work/engagement/2026-04-15-epic-engagement.md"),
      `---\nstatus: backlog\n---\n\n# Engagement\n\n## Type\n\nepic\n`
    );
    const cfg = resolveWorkConfig({ cwd, env: {} });
    const packages = discoverWorkPackages(cfg);
    assert.equal(packages.length, 1);
    assert.equal(packages[0].title, "Engagement");
  } finally {
    cleanup();
  }
});

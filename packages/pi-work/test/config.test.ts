import test from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";

import { resolveWorkConfig } from "../src/config.js";

test("resolveWorkConfig uses defaults", () => {
  const cfg = resolveWorkConfig({ cwd: "/repo", env: {} });
  assert.equal(cfg.root, "docs/work");
  assert.equal(cfg.openDir, "work");
  assert.equal(cfg.finishedDir, "finished");
  assert.equal(cfg.rootAbs, path.resolve("/repo/docs/work"));
  assert.equal(cfg.openAbs, path.resolve("/repo/docs/work/work"));
  assert.equal(cfg.finishedAbs, path.resolve("/repo/docs/work/finished"));
});

test("resolveWorkConfig honors env overrides", () => {
  const cfg = resolveWorkConfig({
    cwd: "/repo",
    env: {
      PI_WORK_ROOT: "notes/tasks",
      PI_WORK_OPEN_DIR: "open",
      PI_WORK_FINISHED_DIR: "done",
    },
  });
  assert.equal(cfg.root, "notes/tasks");
  assert.equal(cfg.openAbs, path.resolve("/repo/notes/tasks/open"));
  assert.equal(cfg.finishedAbs, path.resolve("/repo/notes/tasks/done"));
});

test("resolveWorkConfig honors explicit options over env", () => {
  const cfg = resolveWorkConfig({
    cwd: "/repo",
    root: "custom",
    env: { PI_WORK_ROOT: "notes/tasks" },
  });
  assert.equal(cfg.root, "custom");
});

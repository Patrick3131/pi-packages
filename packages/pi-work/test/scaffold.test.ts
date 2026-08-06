import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveWorkConfig } from "../src/config.js";
import { getScaffoldSourceDir, initWorkScaffold } from "../src/scaffold.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("scaffold source exists in package", () => {
  const src = getScaffoldSourceDir(packageRoot);
  assert.equal(fs.existsSync(path.join(src, "AGENTS.md")), true);
  assert.equal(fs.existsSync(path.join(src, "CONTEXT.md")), true);
  assert.equal(fs.existsSync(path.join(src, "README.md")), true);
});

test("initWorkScaffold creates structure and is idempotent", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-work-scaffold-"));
  try {
    const cfg = resolveWorkConfig({ cwd, env: {} });
    const first = initWorkScaffold(cfg, packageRoot);
    assert.ok(first.created.length > 0);
    assert.equal(fs.existsSync(path.join(cfg.rootAbs, "AGENTS.md")), true);
    assert.equal(fs.existsSync(cfg.openAbs), true);
    assert.equal(fs.existsSync(cfg.finishedAbs), true);

    // mutate one file and re-run — should skip existing
    const agents = path.join(cfg.rootAbs, "AGENTS.md");
    fs.writeFileSync(agents, "# custom\n", "utf8");
    const second = initWorkScaffold(cfg, packageRoot);
    assert.equal(fs.readFileSync(agents, "utf8"), "# custom\n");
    assert.ok(second.skipped.includes(agents));
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

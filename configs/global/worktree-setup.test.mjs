import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  classifyEntries,
  readWorkspaceDirs,
  setupWorktree,
} from "./worktree-setup.mjs";

const repositoryRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);

function createFixture() {
  // realpath keeps macOS /var -> /private/var out of the assertions.
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "worktree-setup-")),
  );
  const repoRoot = path.join(root, "repo");
  const worktreePath = path.join(root, "worktree");

  fs.mkdirSync(path.join(repoRoot, "node_modules", "jest"), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, "node_modules", ".bin"), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, "node_modules", "@scope", "pkg"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(repoRoot, "packages", "beta"), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, "packages", "beta", "node_modules"), {
    recursive: true,
  });
  fs.mkdirSync(worktreePath, { recursive: true });

  fs.writeFileSync(
    path.join(repoRoot, "package.json"),
    JSON.stringify({ name: "fixture", workspaces: ["packages/*"] }),
  );
  fs.writeFileSync(
    path.join(repoRoot, "packages", "beta", "package.json"),
    JSON.stringify({ name: "beta" }),
  );
  fs.writeFileSync(
    path.join(repoRoot, "node_modules", "jest", "package.json"),
    JSON.stringify({ name: "jest" }),
  );

  // The workspace link npm creates: main checkout -> its own package dir.
  fs.symlinkSync(
    path.join(repoRoot, "packages", "beta"),
    path.join(repoRoot, "node_modules", "beta"),
    "dir",
  );
  // An in-repo link that is not a workspace, e.g. `npm link` or an unmapped
  // pnpm layout. It must not be followed.
  fs.symlinkSync(
    path.join(repoRoot, "node_modules", "jest"),
    path.join(repoRoot, "node_modules", "linked-tool"),
    "dir",
  );

  return { root, repoRoot, worktreePath };
}

test("workspace packages resolve inside the worktree, not the main checkout", () => {
  const { root, repoRoot, worktreePath } = createFixture();
  try {
    const { syntheticPaths, skipped } = setupWorktree({
      repoRoot,
      worktreePath,
    });

    const betaLink = path.join(worktreePath, "node_modules", "beta");
    assert.equal(fs.realpathSync(betaLink), path.join(worktreePath, "packages", "beta"));
    assert.deepEqual(syntheticPaths, ["node_modules", "packages/beta/node_modules"]);
    assert.deepEqual(skipped, ["linked-tool"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("third-party dependencies keep resolving from the shared install", () => {
  const { root, repoRoot, worktreePath } = createFixture();
  try {
    setupWorktree({ repoRoot, worktreePath });

    const jestLink = path.join(worktreePath, "node_modules", "jest");
    assert.equal(fs.realpathSync(jestLink), path.join(repoRoot, "node_modules", "jest"));

    const binLink = path.join(worktreePath, "node_modules", ".bin");
    assert.equal(fs.realpathSync(binLink), path.join(repoRoot, "node_modules", ".bin"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a second run is idempotent", () => {
  const { root, repoRoot, worktreePath } = createFixture();
  try {
    setupWorktree({ repoRoot, worktreePath });
    const second = setupWorktree({ repoRoot, worktreePath });

    assert.deepEqual(second.syntheticPaths, [
      "node_modules",
      "packages/beta/node_modules",
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a repository without a root manifest mirrors nothing and still succeeds", () => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "worktree-setup-empty-")),
  );
  try {
    const repoRoot = path.join(root, "repo");
    const worktreePath = path.join(root, "worktree");
    fs.mkdirSync(repoRoot, { recursive: true });
    fs.mkdirSync(worktreePath, { recursive: true });

    assert.deepEqual(readWorkspaceDirs(repoRoot), new Map());
    assert.deepEqual(setupWorktree({ repoRoot, worktreePath }), {
      syntheticPaths: [],
      skipped: [],
    });
    assert.equal(fs.existsSync(path.join(worktreePath, "node_modules")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an in-repo link that is not a workspace is skipped, not followed", () => {
  const { repoRoot } = createFixture();
  const plans = classifyEntries({
    entries: [{ name: "linked-tool", isLink: true, realPath: path.join(repoRoot, "node_modules", "jest") }],
    destinationModulesPath: "/worktree/node_modules",
    sourceModulesPath: "/repo/node_modules",
    worktreePath: "/worktree",
    workspaceDirs: new Map(),
    repoRoot,
  });

  assert.deepEqual(plans.skipped, ["linked-tool"]);
  assert.deepEqual(plans.links, []);
});

test("reads workspace package names from this repository's manifest", () => {
  const byName = readWorkspaceDirs(repositoryRoot);

  assert.ok(byName.get("pi-work"), "pi-work should map to its package dir");
  assert.ok(byName.size >= 8, "every workspace package should be mapped");
});

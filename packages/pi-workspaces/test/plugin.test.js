import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import plugin, { branchOwner, isGitWorkspace, previewAppNames, previewSource, previewStartCommand, shellQuote, validBranchName, validCommitMessage, validTaskName, workspaceBranch } from "../browser/pi-web-plugin.js";

test("root package exposes the browser plugin from a narrow browser root", () => {
  const rootPackage = new URL("../../../package.json", import.meta.url);
  const manifest = JSON.parse(readFileSync(fileURLToPath(rootPackage), "utf8"));
  assert.deepEqual(manifest.piWeb.plugins, [{
    id: "melon-workspaces",
    browserRoot: "packages/pi-workspaces/browser",
    module: "packages/pi-workspaces/browser/pi-web-plugin.js",
    machineSpecific: true,
  }]);
});

test("declares a browser v2 workflow plugin", () => {
  assert.equal(plugin.apiVersion, 2);
  const activated = plugin.activate({ runtimePluginId: "melon-workspaces", html: () => ({}), svg: () => ({}) });
  assert.deepEqual(activated.contributions.actions.map((action) => action.id), ["workspace.open-workflow", "workspace.start-pi"]);
  assert.equal(activated.contributions.workspacePanels[0].id, "workspace.melon-workflow");
});

test("recognizes task ownership from Git provider metadata", () => {
  const workspace = { provider: { metadata: { isGitRepo: true, branch: "codex/fix-auth" } } };
  assert.equal(workspaceBranch(workspace), "codex/fix-auth");
  assert.equal(branchOwner(workspaceBranch(workspace)), "codex");
  assert.equal(branchOwner("pi/improve-tools"), "pi");
  assert.equal(branchOwner("staging"), undefined);
  assert.equal(isGitWorkspace(workspace), true);
});

test("validates and quotes form values", () => {
  assert.equal(validTaskName("fix-auth_2"), true);
  assert.equal(validTaskName("fix auth"), false);
  assert.equal(validBranchName("feature/agency-evaluation"), true);
  assert.equal(validBranchName("../staging"), false);
  assert.equal(validCommitMessage("Wire up release workflow"), true);
  assert.equal(validCommitMessage("   "), false);
  assert.equal(validCommitMessage("two\nlines"), false);
  assert.equal(shellQuote("it's"), "'it'\\''s'");
});

test("normalizes the active preview source for display", () => {
  assert.deepEqual(previewSource({
    status: "running",
    workspace: "/workspace/melon-labs",
    branch: "feature/agency-evaluation",
    apps: ["backend", "portal"],
    url: "https://preview.melonlabs.ai/app",
  }), {
    status: "running",
    workspace: "/workspace/melon-labs",
    branch: "feature/agency-evaluation",
    apps: ["backend", "portal"],
    url: "https://preview.melonlabs.ai/app",
  });
  assert.equal(previewSource({ status: "stopped" }), undefined);
});

test("starts all preview apps by default and supports explicit app selection", () => {
  assert.deepEqual(previewAppNames, ["marketing", "portal", "engagement", "admin", "backend"]);
  assert.equal(previewStartCommand(), "melon-preview start .");
  assert.equal(
    previewStartCommand(["engagement", "portal"]),
    "melon-preview start . --apps 'portal,engagement'",
  );
  assert.throws(() => previewStartCommand([]), /Select at least one preview app/u);
});

test("uses direct workspace merges without pull request actions", () => {
  const source = readFileSync(fileURLToPath(new URL("../browser/pi-web-plugin.js", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /Create \/ Open PR|pull request|melon-worktree pr|melon-worktree promote/u);
  assert.match(source, /melon-worktree merge staging/u);
  assert.match(source, /melon-worktree merge-push staging/u);
  assert.match(source, /melon-worktree merge production/u);
  assert.match(source, /melon-worktree merge-push production/u);
});

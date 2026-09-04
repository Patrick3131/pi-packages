import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import plugin, { branchOwner, createWorkspaceFormState, isGitWorkspace, previewAppNames, previewSource, previewStartCommand, shellQuote, validBranchName, validCommitMessage, validTaskName, workspaceBranch, workspaceContextChanged } from "../browser/pi-web-plugin.js";

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

test("ignores context refreshes that do not change the rendered workspace", () => {
  const previous = {
    id: "workspace-1",
    label: "pi/fix-auth",
    provider: { metadata: { isGitRepo: true, branch: "pi/fix-auth", status: "clean" } },
  };
  const refreshed = {
    ...previous,
    provider: { metadata: { isGitRepo: true, branch: "pi/fix-auth", status: "modified" } },
  };
  const changed = {
    ...previous,
    provider: { metadata: { isGitRepo: true, branch: "codex/fix-auth", status: "clean" } },
  };

  assert.equal(workspaceContextChanged(previous, refreshed), false);
  assert.equal(workspaceContextChanged(previous, changed), true);
});

test("normalizes and preserves create workspace form state", () => {
  assert.deepEqual(createWorkspaceFormState({ owner: "codex", task: "fix-auth", base: "staging" }), {
    owner: "codex",
    task: "fix-auth",
    base: "staging",
  });
  assert.deepEqual(createWorkspaceFormState({ owner: "invalid", task: 42 }), {
    owner: "pi",
    task: "",
    base: "staging",
  });
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

test("starts all preview apps explicitly and supports custom app selection", () => {
  assert.deepEqual(previewAppNames, ["marketing", "portal", "engagement", "admin", "backend"]);
  assert.equal(previewStartCommand(), "melon-preview start . --all-apps");
  assert.equal(
    previewStartCommand(["engagement", "portal"]),
    "melon-preview start . --apps 'portal,engagement'",
  );
  assert.throws(() => previewStartCommand([]), /Select at least one preview app/u);
});

test("uses explicit staging merge directions without task-to-production actions", () => {
  const source = readFileSync(fileURLToPath(new URL("../browser/pi-web-plugin.js", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /Create \/ Open PR|pull request|melon-worktree pr|melon-worktree promote/u);
  assert.match(source, /Merge staging into this workspace/u);
  assert.match(source, /Merge production into staging/u);
  assert.match(source, /Merge staging into production/u);
  assert.match(source, /melon-worktree merge staging/u);
  assert.match(source, /melon-worktree merge-push staging/u);
  assert.match(source, /Discard tracked changes/u);
  assert.match(source, /Untracked files will be kept/u);
  assert.match(source, /melon-worktree discard/u);
  assert.doesNotMatch(source, /data-sync-production|melon-worktree sync production|data-merge-production|melon-worktree merge production|melon-worktree merge-push production/u);
});

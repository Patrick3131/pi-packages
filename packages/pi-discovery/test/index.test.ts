import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  SettingsManager,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import discovery from "../src/index.js";
import presets from "../../pi-toolkit/src/features/presets/index.js";
import tools from "../../pi-toolkit/src/features/tools/index.js";

test("F: native Pi defaults and toolkit project overrides preserve explicit loadouts", async () => {
  const saved = process.env.DISCOVERY_WEB_ANSWER_ENABLED;
  const argv = process.argv;
  try {
    for (const variant of [
      "off",
      "env",
      "project",
      "false",
      "explicit",
      "excluded",
      "preset",
      "history",
      "child",
    ]) {
      process.argv =
        variant === "explicit" ? [...argv, "--tools", "web_answer"] : argv;
      if (variant === "off" || variant === "project")
        delete process.env.DISCOVERY_WEB_ANSWER_ENABLED;
      else process.env.DISCOVERY_WEB_ANSWER_ENABLED = "1";
      const cwd = mkdtempSync(join(tmpdir(), "pi-discovery-test-"));
      mkdirSync(join(cwd, ".pi"));
      const file = join(cwd, ".pi/tools.json"),
        content = JSON.stringify({ web_answer: variant === "project" });
      writeFileSync(file, content);
      const settings = SettingsManager.inMemory({ packages: [] });
      const manager = SessionManager.inMemory(
        cwd,
        variant === "child" ? { parentSession: "/parent.jsonl" } : undefined,
      );
      if (variant === "preset")
        manager.appendCustomEntry("preset-state", { name: "chosen" });
      if (variant === "history")
        manager.appendMessage({
          role: "system",
          content: "loaded",
          toolsAdded: [{ name: "read" }],
          timestamp: Date.now(),
        } as never);
      const loader = new DefaultResourceLoader({
        cwd,
        agentDir: cwd,
        settingsManager: settings,
        noExtensions: true,
        noSkills: true,
        noThemes: true,
        noPromptTemplates: true,
        noContextFiles: true,
        extensionFactories: [presets, discovery, tools],
      });
      await loader.reload();
      const { session } = await createAgentSession({
        cwd,
        agentDir: cwd,
        settingsManager: settings,
        sessionManager: manager,
        resourceLoader: loader,
        ...(variant === "explicit"
          ? { tools: ["web_answer"] }
          : ["excluded", "child"].includes(variant)
            ? { tools: ["read"] }
            : {}),
      });
      try {
        await session.bindExtensions({});
        assert.ok(
          session.getAllTools().some((t) => t.name === "web_answer") ||
            ["excluded", "child"].includes(variant),
        );
        const active = session.getActiveToolNames().includes("web_answer");
        assert.equal(
          active,
          ["project", "explicit", "preset"].includes(variant),
          variant,
        );
        session.setActiveToolsByName(["read"]);
        assert.equal(
          session.getActiveToolNames().includes("web_answer"),
          false,
        );
        assert.equal(readFileSync(file, "utf8"), content);
      } finally {
        session.dispose();
        rmSync(cwd, { recursive: true, force: true });
      }
    }
  } finally {
    process.argv = argv;
    if (saved === undefined) delete process.env.DISCOVERY_WEB_ANSWER_ENABLED;
    else process.env.DISCOVERY_WEB_ANSWER_ENABLED = saved;
  }
});

test("B adapter: typed failure isError and caller cancellation is rethrown", async () => {
  type Call = {
    name: string;
    execute: (
      id: string,
      params: { query: string },
      signal?: AbortSignal,
    ) => Promise<{ isError?: boolean; content: unknown; details: unknown }>;
  };
  const registered: Call[] = [];
  discovery({
    registerTool: (tool: Call) => registered.push(tool),
  } as unknown as import("@earendil-works/pi-coding-agent").ExtensionAPI);
  const answer = registered.find((t) => t.name === "web_answer")!;
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "web_answer_disabled",
            message: "SECRET",
            request_id: "r",
          },
        }),
        { status: 401 },
      );
    const result = await answer.execute("t", { query: "x" });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result), /disabled/);
    assert.doesNotMatch(JSON.stringify(result), /SECRET/);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      answer.execute("t", { query: "x" }, controller.signal),
      { name: "AbortError" },
    );
  } finally {
    globalThis.fetch = original;
  }
});

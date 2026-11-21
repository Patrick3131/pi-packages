import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createAgentSession,
  createCodemodeExtension,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { registerAdLibrary } from "../src/features/ad-library/tools.js";

test("codemode exposes a failed continuation as structured data for manual replay", async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-ads-resume-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const manager = SessionManager.inMemory(cwd);
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: cwd,
    noSkills: true,
    noThemes: true,
    noPromptTemplates: true,
    extensionFactories: [createCodemodeExtension(), registerAdLibrary],
  });
  await loader.reload();
  const runtime = await ModelRuntime.create({
    authPath: join(cwd, "auth.json"),
    modelsPath: null,
    modelsStorePath: join(cwd, "models.json"),
    refreshOnCreate: false,
  });
  const { session } = await createAgentSession({
    cwd,
    agentDir: cwd,
    resourceLoader: loader,
    modelRuntime: runtime,
    sessionManager: manager,
    settingsManager: SettingsManager.inMemory({
      defaultTools: ["codemode", "ad_library"],
    }),
  });
  t.after(() => session.dispose());
  await session.bindExtensions({});
  session.setActiveToolsByName(["codemode", "ad_library"]);
  manager.appendMessage({
    role: "assistant",
    api: "openai-responses",
    provider: "openai",
    model: "test",
    content: [
      {
        type: "toolCall",
        id: "resume-script",
        name: "codemode",
        arguments: {},
      },
    ],
    stopReason: "toolUse",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    timestamp: Date.now(),
  });
  session.refreshContext();
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      {
        error: {
          code: "ad_library_timeout",
          stage: "pagination",
          retry_same_cursor: true,
        },
      },
      { status: 504 },
    ),
  );
  const tool = session.agent.state.tools.find((t) => t.name === "codemode")!;
  const result = await tool.execute(
    "resume-script",
    {
      code: 'const r=await tools.ad_library({platform:"linkedin",keyword:"x",cursor:"opaque"});text([r.status,r.next_request.cursor].join("/"));',
    },
    new AbortController().signal,
  );
  assert.match(JSON.stringify(result.content), /error\/opaque/);
  assert.equal(fetch.mock.callCount(), 1);
});

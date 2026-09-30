jest.mock("@earendil-works/pi-coding-agent", () => {
  const path = require("node:path");
  const source = require("node:fs").readFileSync(path.resolve(__dirname, "../../../node_modules/@earendil-works/pi-coding-agent/dist/core/tools/truncate.js"), "utf8");
  const module = { exports: {} };
  new Function("module", "exports", require("esbuild").transformSync(source, { format: "cjs" }).code)(module, module.exports);
  return { ...module.exports, defineTool: (tool: unknown) => tool };
}, { virtual: true });

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension from "./index";
import { mockFetch, restoreFetch, resetEnv } from "./test-utils";

describe("pi-crawl4ai registration and on-demand status", () => {
  beforeEach(() => { resetEnv(); jest.restoreAllMocks(); });
  afterEach(restoreFetch);

  function createMockPi(initialActiveTools: string[] = []) {
    const activeTools = [...initialActiveTools];
    const commands: Record<string, { handler: (args: string, ctx: any) => Promise<void> }> = {};
    const pi = {
      registerTool: jest.fn(),
      registerCommand: jest.fn((name, spec) => { commands[name] = spec; }),
      on: jest.fn(), getActiveTools: jest.fn(() => [...activeTools]), setActiveTools: jest.fn(), appendEntry: jest.fn(), sendMessage: jest.fn(),
    } as unknown as ExtensionAPI;
    return { pi, activeTools, commands };
  }

  it("does not change the active set at startup", () => {
    const { pi, activeTools } = createMockPi(["read", "crawl", "crawl_read"]);
    extension(pi);
    expect(pi.setActiveTools).not.toHaveBeenCalled(); expect(pi.on).not.toHaveBeenCalled(); expect(activeTools).toEqual(["read", "crawl", "crawl_read"]);
  });
  it.each([{ tools: ["read"] }, { tools: ["crawl"] }, { tools: ["crawl", "crawl_read"] }, { tools: [] }])("preserves external tool allowlists across reload (%j)", ({ tools }) => {
    const { pi, activeTools, commands } = createMockPi(tools);
    extension(pi); extension(pi);
    expect(pi.setActiveTools).not.toHaveBeenCalled(); expect(pi.appendEntry).not.toHaveBeenCalled(); expect(activeTools).toEqual(tools);
    expect(commands["crawl-on"]).toBeUndefined(); expect(commands["crawl-off"]).toBeUndefined();
    expect(Object.keys(commands).sort()).toEqual(["crawl-cleanup", "crawl-sessions", "crawl-status"]);
  });
  it("has no network request, subprocess, or stdout at registration", () => {
    const fetchMock = mockFetch({ data: { status: "ok" } });
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const { pi } = createMockPi(); extension(pi);
    expect(fetchMock).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled();
    expect(pi.registerTool).toHaveBeenCalledTimes(2);
  });
  it("checks auth-aware health only on demand without mutating tools", async () => {
    process.env.CRAWL4AI_API_TOKEN = "test-token";
    const fetchMock = mockFetch({ data: { status: "ok", version: "0.9.4" } });
    const { pi, commands } = createMockPi(); extension(pi);
    const notify = jest.fn();
    await commands["crawl-status"].handler("", { hasUI: true, cwd: process.cwd(), ui: { notify } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:11235/health", expect.objectContaining({ method: "GET", headers: expect.objectContaining({ Authorization: "Bearer test-token" }) }));
    expect(notify.mock.calls[0][0]).toContain("0.9.4"); expect(pi.setActiveTools).not.toHaveBeenCalled();
  });
  it("reports bounded/redacted errors without depending on terminal UI", async () => {
    process.env.CRAWL4AI_API_TOKEN = "test-token";
    mockFetch({ ok: false, status: 401, text: "Bearer test-token " + "x".repeat(5000) });
    const { pi, commands } = createMockPi(); extension(pi);
    await commands["crawl-status"].handler("", { hasUI: false, cwd: process.cwd() });
    const message = (pi.sendMessage as jest.Mock).mock.calls[0][0];
    expect(message.content).toContain("401"); expect(message.content).not.toContain("test-token"); expect(message.content.length).toBeLessThan(2100);
    expect(pi.setActiveTools).not.toHaveBeenCalled();
  });
  it("health proves reachability, not extractor availability unless explicitly requested", async () => {
    delete process.env.CRAWL4AI_TRAFILATURA_PYTHON;
    mockFetch({ data: { status: "ok" } });
    const { pi, commands } = createMockPi(); extension(pi);
    await commands["crawl-status"].handler("extractor", { hasUI: false, cwd: process.cwd() });
    expect((pi.sendMessage as jest.Mock).mock.calls[0][0].content).toContain("pythonPath");
  });
});

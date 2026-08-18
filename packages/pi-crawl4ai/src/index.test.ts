/**
 * Tests for extension entry point activation behavior
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import extension from "./index";
import { resetEnv } from "./test-utils";

type CommandHandler = (
  args: string,
  ctx: { ui: { notify: (message: string, level?: string) => void } },
) => Promise<void> | void;

describe("pi-crawl4ai extension activation", () => {
  beforeEach(() => {
    resetEnv();
    jest.restoreAllMocks();
  });

  function createMockPi(initialActiveTools: string[] = []) {
    const activeTools = [...initialActiveTools];
    const commands: Record<string, CommandHandler> = {};

    const pi = {
      registerTool: jest.fn(),
      registerCommand: jest.fn((name: string, spec: { handler: CommandHandler }) => {
        commands[name] = spec.handler;
      }),
      on: jest.fn(),
      getActiveTools: jest.fn(() => [...activeTools]),
      setActiveTools: jest.fn((names: string[]) => {
        activeTools.splice(0, activeTools.length, ...names);
      }),
      appendEntry: jest.fn(),
    } as unknown as ExtensionAPI;

    return {
      pi,
      activeTools,
      runCommand: async (name: string) => {
        await commands[name]?.("", { ui: { notify: jest.fn() } });
      },
    };
  }

  it("does not change the active set at startup", () => {
    const { pi, activeTools } = createMockPi(["read", "crawl", "crawl_read"]);

    extension(pi);

    expect(pi.setActiveTools).not.toHaveBeenCalled();
    expect(pi.on).not.toHaveBeenCalled();
    expect(activeTools).toEqual(["read", "crawl", "crawl_read"]);
  });

  it("enables crawl tools for this session only", async () => {
    const { pi, activeTools, runCommand } = createMockPi(["read"]);

    extension(pi);
    await runCommand("crawl-on");

    expect(activeTools).toEqual(["read", "crawl", "crawl_read"]);
    expect(pi.appendEntry).not.toHaveBeenCalled();
  });

  it("disables crawl tools for this session only", async () => {
    const { pi, activeTools, runCommand } = createMockPi(["read", "crawl", "crawl_read"]);

    extension(pi);
    await runCommand("crawl-off");

    expect(activeTools).toEqual(["read"]);
    expect(pi.appendEntry).not.toHaveBeenCalled();
  });
});

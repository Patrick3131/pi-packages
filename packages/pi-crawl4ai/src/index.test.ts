/**
 * Tests for extension entry point activation behavior
 */

import extension from './index';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { resetEnv } from './test-utils';

type SessionHandler = (event: unknown, ctx: { sessionManager: { getBranch: () => unknown[] } }) => Promise<void> | void;

describe('pi-crawl4ai extension activation', () => {
  beforeEach(() => {
    resetEnv();
    jest.restoreAllMocks();
  });

  function createMockPi(initialActiveTools: string[] = []) {
    const activeTools = [...initialActiveTools];
    const sessionHandlers: Record<string, SessionHandler> = {};

    const pi = {
      registerTool: jest.fn(),
      registerCommand: jest.fn(),
      on: jest.fn((event: string, handler: SessionHandler) => {
        sessionHandlers[event] = handler;
      }),
      getActiveTools: jest.fn(() => [...activeTools]),
      setActiveTools: jest.fn((names: string[]) => {
        activeTools.splice(0, activeTools.length, ...names);
      }),
      appendEntry: jest.fn(),
    } as unknown as ExtensionAPI;

    const triggerSessionStart = async (branchEntries: unknown[] = []) => {
      await sessionHandlers.session_start?.({}, {
        sessionManager: {
          getBranch: () => branchEntries,
        },
      });
    };

    return {
      pi,
      activeTools,
      triggerSessionStart,
    };
  }

  it('preserves explicit crawl selection when crawl is already active at startup', async () => {
    const { pi, activeTools, triggerSessionStart } = createMockPi(['read', 'crawl']);

    extension(pi);
    await triggerSessionStart();

    expect(pi.setActiveTools).not.toHaveBeenCalled();
    expect(activeTools).toEqual(['read', 'crawl']);
  });

  it('still removes crawl when persisted branch state disabled it', async () => {
    const { pi, activeTools, triggerSessionStart } = createMockPi(['read', 'crawl']);

    extension(pi);
    await triggerSessionStart([
      {
        type: 'custom',
        customType: 'crawl-config',
        data: { enabled: false },
      },
    ]);

    expect(pi.setActiveTools).toHaveBeenCalledWith(['read']);
    expect(activeTools).toEqual(['read']);
  });
});

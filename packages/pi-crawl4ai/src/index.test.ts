/**
 * Tests for extension entry point activation behavior
 */

import extension from './index';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { resetEnv } from './test-utils';

type SessionHandler = (event: unknown, ctx: { sessionManager: { getBranch: () => unknown[] } }) => Promise<void> | void;

describe('pi-crawl4ai extension activation', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    resetEnv();
    jest.restoreAllMocks();
    process.argv = [...originalArgv];
  });

  afterEach(() => {
    process.argv = originalArgv;
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

  it('deactivates auto-registered crawl tools when enabledByDefault is false', async () => {
    // Simulate pi.registerTool auto-activating newly registered tools.
    const { pi, activeTools, triggerSessionStart } = createMockPi([
      'read',
      'crawl',
      'crawl_read',
    ]);

    extension(pi);
    await triggerSessionStart();

    expect(pi.setActiveTools).toHaveBeenCalledWith(['read']);
    expect(activeTools).toEqual(['read']);
  });

  it('preserves crawl when CLI --tools crawl is set', async () => {
    process.argv = ['node', 'pi', '--tools', 'read,crawl'];
    const { pi, activeTools, triggerSessionStart } = createMockPi(['read', 'crawl']);

    extension(pi);
    await triggerSessionStart();

    // Explicit CLI selection must not strip crawl even if default is off
    expect(activeTools).toEqual(['read', 'crawl']);
  });

  it('enables crawl tools when persisted branch state enabled them', async () => {
    const { pi, activeTools, triggerSessionStart } = createMockPi(['read']);

    extension(pi);
    await triggerSessionStart([
      {
        type: 'custom',
        customType: 'crawl-config',
        data: { enabled: true },
      },
    ]);

    expect(activeTools).toEqual(expect.arrayContaining(['read', 'crawl', 'crawl_read']));
  });

  it('still removes crawl when persisted branch state disabled it', async () => {
    const { pi, activeTools, triggerSessionStart } = createMockPi(['read', 'crawl', 'crawl_read']);

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

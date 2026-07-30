import extension from './index';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { resetEnv } from './test-utils';

type SessionHandler = (event: unknown, ctx: { sessionManager: { getBranch: () => unknown[] } }) => Promise<void> | void;

describe('pi-brave-search extension activation', () => {
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

  it('deactivates auto-registered brave_search when enabledByDefault is false', async () => {
    const { pi, activeTools, triggerSessionStart } = createMockPi(['read', 'brave_search']);

    extension(pi);
    await triggerSessionStart();

    expect(pi.setActiveTools).toHaveBeenCalledWith(['read']);
    expect(activeTools).toEqual(['read']);
  });

  it('preserves brave_search when CLI --tools brave_search is set', async () => {
    process.argv = ['node', 'pi', '--tools=read,brave_search'];
    const { pi, activeTools, triggerSessionStart } = createMockPi(['read', 'brave_search']);

    extension(pi);
    await triggerSessionStart();

    expect(activeTools).toEqual(['read', 'brave_search']);
  });

  it('removes brave_search when persisted branch state disables it', async () => {
    const { pi, activeTools, triggerSessionStart } = createMockPi(['read', 'brave_search']);

    extension(pi);
    await triggerSessionStart([
      {
        type: 'custom',
        customType: 'brave-search-config',
        data: { enabled: false },
      },
    ]);

    expect(pi.setActiveTools).toHaveBeenCalledWith(['read']);
    expect(activeTools).toEqual(['read']);
  });

  it('enables brave_search when persisted branch state enables it', async () => {
    const { pi, activeTools, triggerSessionStart } = createMockPi(['read']);

    extension(pi);
    await triggerSessionStart([
      {
        type: 'custom',
        customType: 'brave-search-config',
        data: { enabled: true },
      },
    ]);

    expect(activeTools).toEqual(['read', 'brave_search']);
  });
});

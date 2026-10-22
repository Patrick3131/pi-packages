// Never consult the operator's real home/config during deterministic tests.
jest.mock('node:os', () => {
  const actual = jest.requireActual('node:os');
  const fs = jest.requireActual('node:fs');
  const path = jest.requireActual('node:path');
  const home = fs.mkdtempSync(path.join(actual.tmpdir(), 'pi-crawl-test-home-'));
  afterAll(() => fs.rmSync(home, { recursive: true, force: true }));
  return { ...actual, homedir: () => home };
});

/**
 * Jest setup file for pi-crawl4ai
 */

const { resetEnv, restoreFetch } = require('./src/test-utils');

// Clean up before each test
beforeEach(() => {
  resetEnv();
  restoreFetch();
});

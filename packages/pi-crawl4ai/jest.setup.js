/**
 * Jest setup file for pi-crawl4ai
 */

const { resetEnv, restoreFetch } = require('./src/test-utils');

// Clean up before each test
beforeEach(() => {
  resetEnv();
  restoreFetch();
});

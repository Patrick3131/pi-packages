const { resetEnv, restoreFetch } = require('./src/test-utils');

beforeEach(() => {
  resetEnv();
  restoreFetch();
});

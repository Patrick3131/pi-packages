/** @type {import('jest').Config} */
module.exports = {
  projects: ['<rootDir>/packages/pi-crawl4ai/jest.config.cjs'],
  coverageDirectory: '<rootDir>/coverage',
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    '!packages/*/src/**/*.d.ts',
    '!packages/*/src/**/index.ts',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};

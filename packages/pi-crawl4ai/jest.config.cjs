/** @type {import('jest').Config} */
module.exports = {
  displayName: 'pi-crawl4ai',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'mjs', 'json'],
  transformIgnorePatterns: ['/node_modules/(?!typebox/)'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
  transform: {
    '^.+\\.mjs$': '<rootDir>/jest-esm-transform.cjs',
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: require('path').join(__dirname, 'tsconfig.json'),
    }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};

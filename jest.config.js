/**
 * jest.config.js — Backend test configuration
 *
 * Uses Babel to transpile ESM → CommonJS for Jest (the backend is pure ESM:
 * "type": "module" in package.json). mongodb-memory-server spins up an
 * in-process MongoDB for integration tests — no real DB connection required.
 *
 * Run:  npm test
 * Watch: npm run test:watch
 * Coverage: npm run test:coverage
 */
export default {
  testEnvironment: 'node',

  // Transform ESM → CJS via Babel
  transform: {
    '^.+\\.js$': 'babel-jest',
  },

  // Test file locations
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.test.js',
    '<rootDir>/src/**/*.test.js',
  ],

  // Global test setup (DB connection, env)
  globalSetup: '<rootDir>/src/core/testing/globalSetup.js',
  globalTeardown: '<rootDir>/src/core/testing/globalTeardown.js',
  setupFilesAfterEnv: ['<rootDir>/src/core/testing/setupTests.js'],

  // Coverage
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/__tests__/**',
    '!src/**/dto/**',
    '!src/core/testing/**',
    '!src/server.js',
  ],
  coverageThreshold: {
    global: { branches: 60, functions: 70, lines: 70, statements: 70 },
  },

  // Silence verbose output in CI
  verbose: true,
};


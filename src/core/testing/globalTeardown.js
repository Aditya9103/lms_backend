/**
 * globalTeardown.js — Runs once after all test suites complete
 * Stops the mongodb-memory-server instance started in globalSetup.
 */
export default async function globalTeardown() {
  if (global.__MONGOD__) {
    await global.__MONGOD__.stop();
  }
}

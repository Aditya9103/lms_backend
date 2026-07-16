/**
 * setupTests.js — Runs after the test framework is installed (per-suite)
 * - Connects Mongoose to the in-memory DB
 * - Drops all collections between test files for isolation
 * - Closes Mongoose after each suite
 */
import mongoose from 'mongoose';

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI);
});

afterEach(async () => {
  // Drop all collections for test isolation
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

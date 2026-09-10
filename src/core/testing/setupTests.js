/**
 * setupTests.js — Runs after the test framework is installed (per-suite)
 * - Connects Mongoose to the in-memory DB
 * - Mocks Redis client so tests do not make network calls or timeout
 * - Drops all collections between test files for isolation
 * - Closes Mongoose after each suite
 */
import mongoose from 'mongoose';

// Mock Redis client globally for all tests
jest.mock('../../core/cache/redis.js', () => {
  const mockRedisClient = {
    status: 'ready',
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    scan: jest.fn().mockResolvedValue(['0', []]),
    on: jest.fn(),
    once: jest.fn(),
    connect: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn().mockResolvedValue(true),
    quit: jest.fn().mockResolvedValue(true),
    call: jest.fn().mockImplementation((cmd, ...args) => {
      const command = (cmd || '').toUpperCase();
      if (command === 'SCRIPT') {
        return Promise.resolve('e0e1e2e3e4e5e6e7e8e9e0e1e2e3e4e5e6e7e8e9');
      }
      return Promise.resolve([1, 60000]);
    }),
    duplicate: jest.fn().mockReturnThis(),
  };

  return {
    __esModule: true,
    redisClient: mockRedisClient,
    getAsync: jest.fn().mockResolvedValue(null),
    setAsync: jest.fn().mockResolvedValue(true),
    delAsync: jest.fn().mockResolvedValue(true),
    default: mockRedisClient,
  };
});

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

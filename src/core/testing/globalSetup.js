/**
 * globalSetup.js — Runs once before all test suites
 * Starts mongodb-memory-server and stores the URI in an env variable
 * so individual test files can connect via Mongoose without touching a real DB.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod;

export default async function globalSetup() {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  // Store instance for teardown
  global.__MONGOD__ = mongod;
}

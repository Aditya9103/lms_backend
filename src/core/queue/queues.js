import { Queue } from 'bullmq';
import { redisClient } from '../cache/redis.js';
import logger from '../logger/logger.js';

const queueConfig = {
  connection: redisClient,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      age: 3600, // keep completed jobs for 1 hour
      count: 500,
    },
    removeOnFail: {
      age: 24 * 3600, // keep failed jobs for 24 hours for inspection
    },
  },
};

export const QUEUE_NAMES = {
  EMAIL: 'email-queue',
  NOTIFICATION: 'notification-queue',
  MAINTENANCE: 'maintenance-queue',
};

// Lazy queue initialization helper to avoid throwing if Redis is unavailable during dev/testing
const createQueue = (name) => {
  try {
    const queue = new Queue(name, queueConfig);
    queue.on('error', (err) => {
      logger.debug(`[Queue:${name}] Error: ${err.message}`);
    });
    return queue;
  } catch (err) {
    logger.warn(`[Queue:${name}] Initialization deferred: ${err.message}`);
    return null;
  }
};

export const emailQueue = createQueue(QUEUE_NAMES.EMAIL);
export const notificationQueue = createQueue(QUEUE_NAMES.NOTIFICATION);
export const maintenanceQueue = createQueue(QUEUE_NAMES.MAINTENANCE);

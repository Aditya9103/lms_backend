/**
 * worker.js — Standalone background worker process
 *
 * Runs out-of-process from the API web server to process asynchronous
 * background jobs (transactional emails, push notifications, maintenance tasks).
 *
 * Scaled horizontally independently of the HTTP web processes.
 *
 * Run:
 *   node src/worker.js
 */
import './core/config/env.js';
import mongoose from 'mongoose';
import { Worker } from 'bullmq';
import config from './core/config/env.js';
import logger from './core/logger/logger.js';
import { redisClient } from './core/cache/redis.js';
import { QUEUE_NAMES } from './core/queue/queues.js';
import sendEmail from './core/utils/sendEmail.js';
import notificationService from './modules/notifications/notification.service.js';

logger.info('[Worker] Starting standalone background worker process...');

// Connect to MongoDB
try {
  await mongoose.connect(config.MONGO_URI);
  logger.info('[Worker] Connected to MongoDB.');
} catch (err) {
  logger.error('[Worker] MongoDB connection error:', err);
  process.exit(1);
}

const workerConfig = {
  connection: redisClient,
  concurrency: config.WORKER_CONCURRENCY || 5,
};

// ── 1. Email Worker ───────────────────────────────────────────────────────────
const emailWorker = new Worker(
  QUEUE_NAMES.EMAIL,
  async (job) => {
    const { email, subject, message } = job.data;
    logger.info(`[Worker:Email] Processing job ${job.id} for ${email}`);
    await sendEmail(email, subject, message);
    logger.info(`[Worker:Email] Completed job ${job.id}`);
  },
  workerConfig
);

emailWorker.on('failed', (job, err) => {
  logger.error(`[Worker:Email] Job ${job?.id} failed: ${err.message}`, { error: err.stack });
});

// ── 2. Notification Worker ───────────────────────────────────────────────────
const notificationWorker = new Worker(
  QUEUE_NAMES.NOTIFICATION,
  async (job) => {
    const { userId, type, title, message, metadata, link } = job.data;
    logger.info(`[Worker:Notification] Processing job ${job.id} for user ${userId}`);
    await notificationService.createNotification(userId, type, title, message, metadata, link);
    logger.info(`[Worker:Notification] Completed job ${job.id}`);
  },
  workerConfig
);

notificationWorker.on('failed', (job, err) => {
  logger.error(`[Worker:Notification] Job ${job?.id} failed: ${err.message}`, { error: err.stack });
});

// ── 3. Maintenance Worker ────────────────────────────────────────────────────
const maintenanceWorker = new Worker(
  QUEUE_NAMES.MAINTENANCE,
  async (job) => {
    logger.info(`[Worker:Maintenance] Executing maintenance task ${job.name} (ID: ${job.id})`);
    if (job.name === 'token-cleanup') {
      const User = mongoose.model('User');
      await User.updateMany(
        {},
        { $pull: { refreshTokens: { expiresAt: { $lt: new Date() } } } }
      );
      logger.info('[Worker:Maintenance] Expired refresh tokens pruned');
    }
  },
  workerConfig
);

maintenanceWorker.on('failed', (job, err) => {
  logger.error(`[Worker:Maintenance] Job ${job?.id} failed: ${err.message}`);
});

logger.info('[Worker] All workers active and listening for jobs.');

// ── Graceful Shutdown ────────────────────────────────────────────────────────
const shutdown = async (signal) => {
  logger.info(`[Worker] Received ${signal}. Initiating graceful shutdown...`);
  try {
    await Promise.all([
      emailWorker.close(),
      notificationWorker.close(),
      maintenanceWorker.close(),
    ]);
    logger.info('[Worker] BullMQ workers closed.');
    await mongoose.disconnect();
    logger.info('[Worker] MongoDB disconnected.');
    process.exit(0);
  } catch (err) {
    logger.error('[Worker] Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

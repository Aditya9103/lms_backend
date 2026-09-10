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
import { QUEUE_NAMES, maintenanceQueue, sendToDeadLetterQueue } from './core/queue/queues.js';
import sendEmail from './core/utils/sendEmail.js';
import notificationService from './modules/notifications/notification.service.js';

// Explicitly register Mongoose schemas so standalone worker never throws MissingSchemaError
import './modules/users/user.model.js';
import './modules/activityLog/activityLog.model.js';
import './modules/notifications/notification.model.js';

const workerConfig = {
  connection: redisClient,
  concurrency: config.WORKER_CONCURRENCY || 5,
};

// ── 1. Email Job Handler ───────────────────────────────────────────────────────
export const processEmailJob = async (job) => {
  const { email, subject, message } = job.data;
  logger.info(`[Worker:Email] Processing job ${job.id} for ${email}`);
  await sendEmail(email, subject, message);
  logger.info(`[Worker:Email] Completed job ${job.id}`);
  return { delivered: true, recipient: email };
};

// ── 2. Notification Job Handler ───────────────────────────────────────────────
export const processNotificationJob = async (job) => {
  const { userId, type, title, message, metadata, link } = job.data;
  logger.info(`[Worker:Notification] Processing job ${job.id} for user ${userId}`);
  const result = await notificationService.createNotification(userId, type, title, message, metadata, link);
  logger.info(`[Worker:Notification] Completed job ${job.id}`);
  return { delivered: true, notificationId: result?._id };
};

// ── 3. Maintenance Job Handler ────────────────────────────────────────────────
export const processMaintenanceJob = async (job) => {
  logger.info(`[Worker:Maintenance] Executing maintenance task ${job.name} (ID: ${job.id})`);
  
  if (job.name === 'token-cleanup') {
    const User = mongoose.model('User');
    const result = await User.updateMany(
      {},
      { $pull: { refreshTokens: { expiresAt: { $lt: new Date() } } } }
    );
    logger.info(`[Worker:Maintenance] Expired refresh tokens pruned (${result.modifiedCount} users affected)`);
    return { prunedCount: result.modifiedCount };
  }

  if (job.name === 'log-cleanup') {
    const ActivityLog = mongoose.model('ActivityLog');
    const retentionDays = job.data?.retentionDays || 90;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await ActivityLog.deleteMany({ createdAt: { $lt: cutoffDate } });
    logger.info(`[Worker:Maintenance] Pruned ${result.deletedCount} activity logs older than ${retentionDays} days`);
    return { deletedCount: result.deletedCount, cutoffDate };
  }

  return { executed: false, reason: `Unknown maintenance task: ${job.name}` };
};

// ── 4. Dead Letter Job Handler ────────────────────────────────────────────────
export const processDeadLetterJob = async (job) => {
  logger.warn(`[Worker:DLQ] Stored dead-letter job ${job.id} for inspection`, {
    originalQueue: job.data?.originalQueue,
    failedReason: job.data?.failedReason,
  });
  return { status: 'recorded', dlqId: job.id };
};

// ── Workers Setup ─────────────────────────────────────────────────────────────
export let emailWorker;
export let notificationWorker;
export let maintenanceWorker;
export let deadLetterWorker;

if (process.env.NODE_ENV !== 'test') {
  emailWorker = new Worker(QUEUE_NAMES.EMAIL, processEmailJob, workerConfig);
  emailWorker.on('failed', async (job, err) => {
    logger.error(`[Worker:Email] Job ${job?.id} failed: ${err.message}`, { error: err.stack });
    if (job && job.attemptsMade >= (job.opts?.attempts || 3)) {
      await sendToDeadLetterQueue(QUEUE_NAMES.EMAIL, job, err);
    }
  });

  notificationWorker = new Worker(QUEUE_NAMES.NOTIFICATION, processNotificationJob, workerConfig);
  notificationWorker.on('failed', async (job, err) => {
    logger.error(`[Worker:Notification] Job ${job?.id} failed: ${err.message}`, { error: err.stack });
    if (job && job.attemptsMade >= (job.opts?.attempts || 3)) {
      await sendToDeadLetterQueue(QUEUE_NAMES.NOTIFICATION, job, err);
    }
  });

  maintenanceWorker = new Worker(QUEUE_NAMES.MAINTENANCE, processMaintenanceJob, workerConfig);
  maintenanceWorker.on('failed', async (job, err) => {
    logger.error(`[Worker:Maintenance] Job ${job?.id} failed: ${err.message}`);
    if (job && job.attemptsMade >= (job.opts?.attempts || 3)) {
      await sendToDeadLetterQueue(QUEUE_NAMES.MAINTENANCE, job, err);
    }
  });

  deadLetterWorker = new Worker(QUEUE_NAMES.DEAD_LETTER, processDeadLetterJob, workerConfig);
} else {
  emailWorker = { processFn: processEmailJob, close: async () => {} };
  notificationWorker = { processFn: processNotificationJob, close: async () => {} };
  maintenanceWorker = { processFn: processMaintenanceJob, close: async () => {} };
  deadLetterWorker = { processFn: processDeadLetterJob, close: async () => {} };
}

// ── 5. Cron Job Scheduler ────────────────────────────────────────────────────
export const scheduleCronJobs = async () => {
  if (!maintenanceQueue || redisClient?.status !== 'ready') {
    logger.warn('[Worker:Cron] Redis not ready, skipping repeatable job scheduling');
    return;
  }

  try {
    // Schedule daily expired token pruning at 02:00 UTC
    await maintenanceQueue.add(
      'token-cleanup',
      {},
      {
        repeat: { pattern: '0 2 * * *' },
        jobId: 'cron:token-cleanup',
      }
    );

    // Schedule daily activity log retention pruning at 03:00 UTC (90 days retention)
    await maintenanceQueue.add(
      'log-cleanup',
      { retentionDays: 90 },
      {
        repeat: { pattern: '0 3 * * *' },
        jobId: 'cron:log-cleanup',
      }
    );

    logger.info('[Worker:Cron] Scheduled repeatable cron jobs (token-cleanup, log-cleanup).');
  } catch (err) {
    logger.error(`[Worker:Cron] Error scheduling repeatable cron jobs: ${err.message}`);
  }
};

// ── Graceful Shutdown ────────────────────────────────────────────────────────
export const shutdown = async (signal) => {
  logger.info(`[Worker] Received ${signal}. Initiating graceful shutdown...`);
  try {
    await Promise.all([
      emailWorker.close(),
      notificationWorker.close(),
      maintenanceWorker.close(),
      deadLetterWorker.close(),
    ]);
    logger.info('[Worker] BullMQ workers closed.');
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      logger.info('[Worker] MongoDB disconnected.');
    }
    if (process.env.NODE_ENV !== 'test') {
      process.exit(0);
    }
  } catch (err) {
    logger.error('[Worker] Error during shutdown:', err);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  }
};

// Standalone startup logic
if (process.env.NODE_ENV !== 'test') {
  logger.info('[Worker] Starting standalone background worker process...');
  mongoose.connect(config.MONGO_URI)
    .then(async () => {
      logger.info('[Worker] Connected to MongoDB.');
      await scheduleCronJobs();
      logger.info('[Worker] All workers active and listening for jobs.');
    })
    .catch((err) => {
      logger.error('[Worker] MongoDB connection error:', err);
      process.exit(1);
    });

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

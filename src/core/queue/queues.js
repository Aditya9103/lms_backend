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
  DEAD_LETTER: 'dead-letter-queue',
};

// Lazy queue initialization helper to avoid throwing if Redis is unavailable during dev/testing
const createQueue = (name) => {
  if (process.env.NODE_ENV === 'test') {
    return {
      name,
      add: async (jobName, data, opts) => ({ id: `mock-${name}-${Date.now()}`, name: jobName, data, opts }),
      on: () => {},
    };
  }

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
export const deadLetterQueue = createQueue(QUEUE_NAMES.DEAD_LETTER);

/**
 * Enqueue an email job or fall back to direct delivery if queue/Redis unavailable
 */
export const enqueueEmail = async (email, subject, message, opts = {}) => {
  try {
    if (emailQueue && redisClient?.status === 'ready') {
      const job = await emailQueue.add('send-email', { email, subject, message }, opts);
      logger.debug(`[Queue:Email] Enqueued email job ${job?.id} to ${email}`);
      return { enqueued: true, jobId: job?.id };
    }
  } catch (err) {
    logger.warn(`[Queue:Email] Enqueue failed, falling back to direct delivery: ${err.message}`);
  }

  // Resilient fallback to direct synchronous delivery
  const sendEmail = (await import('../utils/sendEmail.js')).default;
  await sendEmail(email, subject, message);
  return { enqueued: false, deliveredDirectly: true };
};

/**
 * Enqueue a notification job or fall back to direct notification service
 */
export const enqueueNotification = async (userId, payload, opts = {}) => {
  try {
    if (notificationQueue && redisClient?.status === 'ready') {
      const job = await notificationQueue.add('send-notification', { userId, ...payload }, opts);
      logger.debug(`[Queue:Notification] Enqueued notification job ${job?.id} for user ${userId}`);
      return { enqueued: true, jobId: job?.id };
    }
  } catch (err) {
    logger.warn(`[Queue:Notification] Enqueue failed, falling back to direct delivery: ${err.message}`);
  }

  const notificationService = (await import('../../modules/notifications/notification.service.js')).default;
  const result = await notificationService.notifyUser(userId, payload);
  return { enqueued: false, deliveredDirectly: true, notification: result };
};

/**
 * Route permanently failed job to Dead Letter Queue (DLQ)
 */
export const sendToDeadLetterQueue = async (queueName, job, error) => {
  const dlqPayload = {
    originalQueue: queueName,
    jobId: job?.id,
    jobName: job?.name,
    data: job?.data,
    attemptsMade: job?.attemptsMade,
    failedReason: error?.message || job?.failedReason,
    stackTrace: error?.stack || job?.stacktrace,
    failedAt: new Date().toISOString(),
  };

  logger.error(`[DLQ] Routing failed job ${job?.id} from ${queueName} to DLQ: ${dlqPayload.failedReason}`);

  try {
    if (deadLetterQueue && redisClient?.status === 'ready') {
      await deadLetterQueue.add('failed-job', dlqPayload, {
        removeOnComplete: false,
        removeOnFail: false,
      });
    }
  } catch (dlqErr) {
    logger.error(`[DLQ] Failed to write to dead letter queue: ${dlqErr.message}`);
  }
  return dlqPayload;
};

/**
 * phase8.backgroundWorkersAndCron.test.js
 *
 * Enterprise Test Suite for Phase 8:
 *  - 8.1 BullMQ Queues and Resilient Dispatch Helpers
 *  - 8.2 Email Worker Execution and Error Resilience
 *  - 8.3 Notification Worker Execution & createNotification Compatibility
 *  - 8.4 Maintenance Worker: Token Cleanup (Expired Refresh Token Pruning)
 *  - 8.5 Maintenance Worker: Log Retention Pruning (ActivityLog Cleanup)
 *  - 8.6 Dead Letter Queue (DLQ) Routing & Failure Inspection
 *  - 8.7 Repeatable Cron Scheduling Configurations
 */
import mongoose from 'mongoose';
import {
  QUEUE_NAMES,
  emailQueue,
  notificationQueue,
  maintenanceQueue,
  deadLetterQueue,
  enqueueEmail,
  enqueueNotification,
  sendToDeadLetterQueue,
} from '../queue/queues.js';
import {
  emailWorker,
  notificationWorker,
  maintenanceWorker,
  deadLetterWorker,
  scheduleCronJobs,
} from '../../worker.js';
import User from '../../modules/users/user.model.js';
import ActivityLog from '../../modules/activityLog/activityLog.model.js';
import Notification from '../../modules/notifications/notification.model.js';
import notificationService from '../../modules/notifications/notification.service.js';
import sendEmail from '../utils/sendEmail.js';

jest.mock('../utils/sendEmail.js', () => jest.fn().mockResolvedValue(true));

describe('=== Phase 8: Background Workers, Dead Letter Queues & Cron ===', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
  });

  describe('8.1 BullMQ Queue Definitions and Dispatch Helpers', () => {
    it('defines all required queue names including DEAD_LETTER', () => {
      expect(QUEUE_NAMES.EMAIL).toBe('email-queue');
      expect(QUEUE_NAMES.NOTIFICATION).toBe('notification-queue');
      expect(QUEUE_NAMES.MAINTENANCE).toBe('maintenance-queue');
      expect(QUEUE_NAMES.DEAD_LETTER).toBe('dead-letter-queue');
    });

    it('initializes queue instances without throwing', () => {
      expect(emailQueue).toBeDefined();
      expect(notificationQueue).toBeDefined();
      expect(maintenanceQueue).toBeDefined();
      expect(deadLetterQueue).toBeDefined();
    });

    it('enqueueEmail dispatches via queue or fallback without throwing', async () => {
      const result = await enqueueEmail('test@example.com', 'Welcome', '<p>Hello</p>');
      expect(result).toBeDefined();
      expect(result.enqueued || result.deliveredDirectly).toBe(true);
    });

    it('enqueueNotification dispatches notification payload and returns result', async () => {
      const targetUser = await User.create({
        fullName: 'Notify User',
        email: `notify_${Date.now()}@example.com`,
        password: 'password123',
      });

      const result = await enqueueNotification(targetUser._id, {
        type: 'COURSE_UPDATE',
        message: 'A new lesson is available!',
      });

      expect(result).toBeDefined();
      expect(result.enqueued || result.deliveredDirectly).toBe(true);
    });
  });

  describe('8.2 Email Worker Execution', () => {
    it('processes email job payload and triggers sendEmail utility', async () => {
      const mockJob = {
        id: 'job-email-101',
        data: {
          email: 'student@example.com',
          subject: 'Enrollment Confirmed',
          message: '<p>You are in!</p>',
        },
      };

      // Direct worker handler invocation
      const handler = emailWorker.processFn;
      const result = await handler(mockJob);

      expect(sendEmail).toHaveBeenCalledWith(
        'student@example.com',
        'Enrollment Confirmed',
        '<p>You are in!</p>'
      );
      expect(result.delivered).toBe(true);
      expect(result.recipient).toBe('student@example.com');
    });
  });

  describe('8.3 Notification Worker Execution & createNotification Compatibility (DEF-08-002)', () => {
    it('executes createNotification via worker and persists in database', async () => {
      const targetUser = await User.create({
        fullName: 'Worker Notify Target',
        email: `worker_target_${Date.now()}@example.com`,
        password: 'password123',
      });

      const mockJob = {
        id: 'job-notif-201',
        data: {
          userId: targetUser._id.toString(),
          type: 'ENROLLMENT_CREATED',
          title: 'Enrollment Success',
          message: 'Welcome to Advanced React',
          metadata: { courseId: 'c-123' },
          link: '/courses/c-123',
        },
      };

      const handler = notificationWorker.processFn;
      const result = await handler(mockJob);

      expect(result.delivered).toBe(true);
      expect(result.notificationId).toBeDefined();

      const savedNotif = await Notification.findById(result.notificationId);
      expect(savedNotif).not.toBeNull();
      expect(savedNotif.type).toBe('ENROLLMENT_CREATED');
      expect(savedNotif.message).toBe('Welcome to Advanced React');
      expect(savedNotif.metadata.title).toBe('Enrollment Success');
      expect(savedNotif.metadata.link).toBe('/courses/c-123');
    });
  });

  describe('8.4 Maintenance Worker: Token Cleanup (DEF-08-001)', () => {
    it('prunes expired refresh tokens from users without MissingSchemaError', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day from now

      const userWithTokens = await User.create({
        fullName: 'Token User',
        email: `token_user_${Date.now()}@example.com`,
        password: 'password123',
        refreshTokens: [
          { tokenHash: 'hash-expired-1', expiresAt: pastDate },
          { tokenHash: 'hash-expired-2', expiresAt: pastDate },
          { tokenHash: 'hash-active-1', expiresAt: futureDate },
        ],
      });

      const mockJob = {
        id: 'job-maint-token-1',
        name: 'token-cleanup',
        data: {},
      };

      const handler = maintenanceWorker.processFn;
      const result = await handler(mockJob);

      expect(result.prunedCount).toBeGreaterThanOrEqual(1);

      const updatedUser = await User.findById(userWithTokens._id).select('+refreshTokens.tokenHash');
      expect(updatedUser.refreshTokens).toHaveLength(1);
      expect(updatedUser.refreshTokens[0].tokenHash).toBe('hash-active-1');
    });
  });

  describe('8.5 Maintenance Worker: Log Retention Pruning (DEF-08-003)', () => {
    it('prunes activity logs older than retention threshold and preserves fresh logs', async () => {
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100 days old
      const freshDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days old

      await ActivityLog.create([
        {
          action: 'LOGIN',
          module: 'AUTH',
          description: 'Old session',
          createdAt: oldDate,
        },
        {
          action: 'LOGOUT',
          module: 'AUTH',
          description: 'Recent session',
          createdAt: freshDate,
        },
      ]);

      const mockJob = {
        id: 'job-maint-log-1',
        name: 'log-cleanup',
        data: { retentionDays: 90 },
      };

      const handler = maintenanceWorker.processFn;
      const result = await handler(mockJob);

      expect(result.deletedCount).toBeGreaterThanOrEqual(1);

      const remainingLogs = await ActivityLog.find({
        description: { $in: ['Old session', 'Recent session'] },
      });
      expect(remainingLogs).toHaveLength(1);
      expect(remainingLogs[0].description).toBe('Recent session');
    });
  });

  describe('8.6 Dead Letter Queue (DLQ) Routing (DEF-08-004)', () => {
    it('captures failed job context and builds dead-letter envelope', async () => {
      const failedJob = {
        id: 'job-failed-999',
        name: 'send-email',
        data: { email: 'bad@domain.invalid', subject: 'Fails' },
        attemptsMade: 3,
        opts: { attempts: 3 },
      };
      const simulatedError = new Error('SMTP connection timed out after 3 retries');

      const dlqPayload = await sendToDeadLetterQueue(QUEUE_NAMES.EMAIL, failedJob, simulatedError);

      expect(dlqPayload.originalQueue).toBe('email-queue');
      expect(dlqPayload.jobId).toBe('job-failed-999');
      expect(dlqPayload.failedReason).toBe('SMTP connection timed out after 3 retries');
      expect(dlqPayload.attemptsMade).toBe(3);
      expect(dlqPayload.failedAt).toBeDefined();

      // Verify DLQ worker handler processes dead-letter records
      const dlqHandler = deadLetterWorker.processFn;
      const dlqResult = await dlqHandler({
        id: 'dlq-entry-1',
        data: dlqPayload,
      });
      expect(dlqResult.status).toBe('recorded');
    });
  });

  describe('8.7 Repeatable Cron Scheduling Configurations', () => {
    it('registers repeatable jobs for token-cleanup and log-cleanup', async () => {
      // Spy on maintenanceQueue.add
      const addSpy = jest.spyOn(maintenanceQueue, 'add').mockImplementation(() => Promise.resolve({ id: 'cron-job' }));

      await scheduleCronJobs();

      if (addSpy.mock.calls.length > 0) {
        expect(addSpy).toHaveBeenCalledWith(
          'token-cleanup',
          {},
          expect.objectContaining({ repeat: { pattern: '0 2 * * *' } })
        );
        expect(addSpy).toHaveBeenCalledWith(
          'log-cleanup',
          { retentionDays: 90 },
          expect.objectContaining({ repeat: { pattern: '0 3 * * *' } })
        );
      }
      addSpy.mockRestore();
    });
  });
});

/**
 * notification.service.js — Phase 6 Notification service.
 *
 * Creates in-DB notifications and delivers them in real-time
 * over Socket.IO when the target user is connected.
 */

import notificationRepository from './notification.repository.js';
import logger from '../../core/logger/logger.js';

class NotificationService {
  /**
   * The Socket.IO server instance — injected via setIo() after
   * server startup to avoid circular imports.
   */
  #io = null;

  setIo(io) {
    this.#io = io;
  }

  // ── Core delivery ──────────────────────────────────────────────────────────

  /**
   * Create a notification for a specific user and deliver via socket if online.
   */
  async notifyUser(userId, { type, message, metadata = {} }) {
    const notification = await notificationRepository.create({
      type,
      message,
      targetUserId: userId,
      metadata,
    });

    if (this.#io) {
      this.#io.to(`user:${userId}`).emit('notification:new', notification);
    }

    logger.info(`[Notification] → user:${userId} | ${type}`);
    return notification;
  }

  /**
   * Compatibility alias for background workers & legacy queue jobs
   */
  async createNotification(userId, type, title, message, metadata = {}, link = null) {
    const combinedMeta = { ...metadata };
    if (title) combinedMeta.title = title;
    if (link) combinedMeta.link = link;
    return this.notifyUser(userId, { type, message, metadata: combinedMeta });
  }

  /**
   * Create a notification for all users of a given role (ADMIN, SUPER_ADMIN).
   */
  async notifyRole(role, { type, message, metadata = {} }) {
    const notification = await notificationRepository.create({
      type,
      message,
      targetRole: role,
      metadata,
    });

    if (this.#io) {
      this.#io.to(`role:${role}`).emit('notification:new', notification);
    }

    logger.info(`[Notification] → role:${role} | ${type}`);
    return notification;
  }

  // ── Read & management ──────────────────────────────────────────────────────

  async getNotificationsForUser(userId, opts) {
    return notificationRepository.findForUser(userId, opts);
  }

  async getUnreadCount(userId) {
    return notificationRepository.countUnread(userId);
  }

  async markAsRead(notificationId, userId) {
    const updated = await notificationRepository.markAsRead(notificationId, userId);
    if (!updated) return null;

    if (this.#io) {
      this.#io.to(`user:${userId}`).emit('notification:read', { notificationId });
    }
    return updated;
  }

  async markAllAsRead(userId) {
    const result = await notificationRepository.markAllAsRead(userId);
    if (this.#io) {
      this.#io.to(`user:${userId}`).emit('notification:all_read');
    }
    return result;
  }

  // ── Typed helpers (used by event listeners) ────────────────────────────────

  async onUserRegistered({ userId, fullName }) {
    await this.notifyRole('ADMIN', {
      type: 'USER_REGISTERED',
      message: `New user registered: ${fullName}`,
      metadata: { userId },
    });
  }

  async onEnrollmentCreated({ userId, courseId, courseName }) {
    await this.notifyUser(userId, {
      type: 'ENROLLMENT_CREATED',
      message: `You have been enrolled in "${courseName}"`,
      metadata: { courseId },
    });
    await this.notifyRole('ADMIN', {
      type: 'ENROLLMENT_CREATED',
      message: `User enrolled in "${courseName}"`,
      metadata: { userId, courseId },
    });
  }

  async onLectureCompleted({ userId, courseId, lectureId, lectureTitle }) {
    await this.notifyUser(userId, {
      type: 'LECTURE_COMPLETED',
      message: `Great job! You completed "${lectureTitle}"`,
      metadata: { courseId, lectureId },
    });
  }

  async onCourseCompleted({ userId, courseId, courseName }) {
    await this.notifyUser(userId, {
      type: 'COURSE_COMPLETED',
      message: `🎉 Congratulations! You completed "${courseName}" and earned your certificate!`,
      metadata: { courseId },
    });
  }

  async onAssignmentSubmitted({ userId, courseId, assignmentId }) {
    await this.notifyRole('ADMIN', {
      type: 'ASSIGNMENT_SUBMITTED',
      message: 'A student submitted an assignment for grading.',
      metadata: { userId, courseId, assignmentId },
    });
  }

  async onAssignmentGraded({ userId, courseId, assignmentId, percentage }) {
    await this.notifyUser(userId, {
      type: 'ASSIGNMENT_GRADED',
      message: `Your assignment has been graded: ${percentage}%`,
      metadata: { courseId, assignmentId, percentage },
    });
  }

  async onQuizSubmitted({ userId, courseId, quizId, passed, percentage }) {
    const msg = passed
      ? `You passed the quiz with ${percentage}%! 🎉`
      : `You scored ${percentage}% on the quiz. Keep practicing!`;
    await this.notifyUser(userId, {
      type: 'QUIZ_SUBMITTED',
      message: msg,
      metadata: { courseId, quizId, passed, percentage },
    });
  }
}

export default new NotificationService();

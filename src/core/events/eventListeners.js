/**
 * eventListeners.js — Phase 6 event → notification wiring.
 *
 * Registers one listener per domain event on the in-process EventBus.
 * Each listener delegates to the notification service which persists
 * the notification and delivers it via Socket.IO.
 *
 * Call registerEventListeners() ONCE at server startup, after
 * initSocket() so notificationService.#io is set.
 */

import eventBus from '../events/eventBus.js';
import { Events } from '../events/eventNames.js';
import notificationService from '../../modules/notifications/notification.service.js';
import logger from '../logger/logger.js';

export const registerEventListeners = () => {
  // ── User lifecycle ─────────────────────────────────────────────────────────
  eventBus.on(Events.USER_REGISTERED, async (payload) => {
    await notificationService.onUserRegistered(payload);
  });

  // ── Enrollment ─────────────────────────────────────────────────────────────
  eventBus.on(Events.ENROLLMENT_CREATED, async (payload) => {
    await notificationService.onEnrollmentCreated(payload);
  });

  // ── Learning progress ──────────────────────────────────────────────────────
  eventBus.on(Events.LECTURE_COMPLETED, async (payload) => {
    await notificationService.onLectureCompleted(payload);
  });

  eventBus.on(Events.COURSE_COMPLETED, async (payload) => {
    await notificationService.onCourseCompleted(payload);
  });

  // ── Assessments ────────────────────────────────────────────────────────────
  eventBus.on(Events.QUIZ_SUBMITTED, async (payload) => {
    await notificationService.onQuizSubmitted(payload);
  });

  eventBus.on(Events.ASSIGNMENT_SUBMITTED, async (payload) => {
    await notificationService.onAssignmentSubmitted(payload);
  });

  eventBus.on(Events.ASSIGNMENT_GRADED, async (payload) => {
    await notificationService.onAssignmentGraded(payload);
  });

  logger.info('[EventListeners] All event listeners registered');
};

/**
 * Canonical event name constants.
 *
 * All event names used across the system are defined here.
 * Never use raw string literals for event names in application code.
 *
 * Delivery guarantees:
 *  - EventEmitter (best-effort):  LECTURE_COMPLETED, COURSE_COMPLETED,
 *    ASSIGNMENT_SUBMITTED, ASSIGNMENT_GRADED, QUIZ_SUBMITTED,
 *    USER_REGISTERED, ENROLLMENT_CREATED
 *  - BullMQ (durable):            PAYMENT_SUCCEEDED → enrollment creation
 *    (process crash between payment confirmation and enrollment must not
 *     result in a paying customer not getting course access)
 */
export const Events = Object.freeze({
  // User lifecycle
  USER_REGISTERED: 'user.registered',

  // Payment & enrollment (PAYMENT_SUCCEEDED uses BullMQ, not EventEmitter)
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  ENROLLMENT_CREATED: 'enrollment.created',

  // Learning progress
  LECTURE_COMPLETED: 'lecture.completed',
  COURSE_COMPLETED: 'course.completed',

  // Assessments
  QUIZ_SUBMITTED: 'quiz.submitted',
  ASSIGNMENT_SUBMITTED: 'assignment.submitted',
  ASSIGNMENT_GRADED: 'assignment.graded',
});

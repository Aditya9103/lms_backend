/**
 * progress.controller.js — Phase 5 controllers for progress, quiz, assignment, certificate,
 * and course publish lifecycle endpoints.
 */

import progressService from './progress.service.js';
import { sendSuccess } from '../../core/utils/apiResponse.js';
import asyncHandler from '../../core/middlewares/asyncHandler.middleware.js';

// ── Lecture progress ───────────────────────────────────────────────────────

/**
 * POST /api/v1/courses/:courseId/progress/lecture
 * Body: { lectureId, watchedPercent, lastPositionSeconds }
 */
export const updateLectureProgress = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const { lectureId, watchedPercent, lastPositionSeconds } = req.body;
  const result = await progressService.updateLectureProgress(
    req.user.id,
    courseId,
    lectureId,
    watchedPercent,
    lastPositionSeconds
  );
  return sendSuccess(res, result);
});

/**
 * GET /api/v1/courses/:courseId/progress
 */
export const getCourseProgress = asyncHandler(async (req, res) => {
  const progress = await progressService.getCourseProgress(req.user.id, req.params.courseId);
  return sendSuccess(res, progress);
});

// ── Quiz ───────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/courses/:courseId/quiz/:quizId/submit
 * Body: { answers: { [questionId]: value }, timeTakenSeconds }
 */
export const submitQuiz = asyncHandler(async (req, res) => {
  const { courseId, quizId } = req.params;
  const { answers, timeTakenSeconds } = req.body;
  const result = await progressService.submitQuiz(
    req.user.id,
    courseId,
    quizId,
    answers,
    timeTakenSeconds
  );
  return sendSuccess(res, result);
});

// ── Assignment ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/courses/:courseId/assignment/:assignmentId/submit
 * Body: { fileUrl }  (after client uploads to Cloudinary or multipart)
 */
export const submitAssignment = asyncHandler(async (req, res) => {
  const { courseId, assignmentId } = req.params;
  const { fileUrl } = req.body;
  const result = await progressService.submitAssignment(
    req.user.id,
    courseId,
    assignmentId,
    fileUrl
  );
  return sendSuccess(res, result);
});

/**
 * POST /api/v1/courses/:courseId/assignment/:assignmentId/grade
 * Body: { targetUserId, totalScore, maxScore, feedback, rubricScores }
 * Only ADMIN / instructor may call this.
 */
export const gradeAssignment = asyncHandler(async (req, res) => {
  const { courseId, assignmentId } = req.params;
  const { targetUserId, totalScore, maxScore, feedback, rubricScores } = req.body;
  const result = await progressService.gradeAssignment(
    req.user.id,
    targetUserId,
    courseId,
    assignmentId,
    { totalScore, maxScore, feedback, rubricScores }
  );
  return sendSuccess(res, result);
});

// ── Certificate ────────────────────────────────────────────────────────────

/**
 * GET /api/v1/certificates/:courseId
 */
export const getCertificate = asyncHandler(async (req, res) => {
  const cert = await progressService.getCertificate(req.user.id, req.params.courseId);
  return sendSuccess(res, cert);
});

// ── Course publish lifecycle ───────────────────────────────────────────────

/**
 * POST /api/v1/courses/:id/publish
 */
export const publishCourse = asyncHandler(async (req, res) => {
  const course = await progressService.publishCourse(req.params.id, req.user.id);
  return sendSuccess(res, course, 'Course published successfully');
});

/**
 * POST /api/v1/courses/:id/unpublish
 */
export const unpublishCourse = asyncHandler(async (req, res) => {
  const course = await progressService.unpublishCourse(req.params.id, req.user.id);
  return sendSuccess(res, course, 'Course moved back to draft');
});

/**
 * DELETE /api/v1/courses/:id/soft
 * Soft-deletes (archives) a course.
 */
export const softDeleteCourse = asyncHandler(async (req, res) => {
  const result = await progressService.softDeleteCourse(req.params.id, req.user.id);
  return sendSuccess(res, result);
});

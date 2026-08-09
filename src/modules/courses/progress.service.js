/**
 * progress.service.js — Phase 5 progress tracking service.
 *
 * Responsibilities:
 *  - Update per-lecture watchedPercent and lastPositionSeconds
 *  - Mark lecture as completed when threshold is reached
 *  - Recompute overallPercent for the course
 *  - Submit quiz attempts (validates maxAttempts, records scores)
 *  - Submit assignment files
 *  - Grade assignments with rubric scores (admin/instructor)
 *  - Issue certificates when completionThreshold is met
 */

import userRepository from '../users/user.repository.js';
import courseRepository from '../courses/course.repository.js';
import AppError from '../../core/utils/AppError.js';
import logger from '../../core/logger/logger.js';

const VIDEO_COMPLETION_THRESHOLD = Number(process.env.VIDEO_COMPLETION_THRESHOLD ?? 90);

class ProgressService {
  // ── Internal helpers ───────────────────────────────────────────────────────

  /**
   * Find or initialise the course progress entry for a user.
   * Returns { user, courseProgress } — caller must save user.
   */
  async _getOrCreateCourseProgress(userId, courseId) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    let courseProgress = user.progress.find(
      (p) => p.courseId.toString() === courseId.toString()
    );
    if (!courseProgress) {
      user.progress.push({ courseId, lectures: [], quizAttempts: [], assignments: [] });
      courseProgress = user.progress[user.progress.length - 1];
    }
    return { user, courseProgress };
  }

  /**
   * Recompute overallPercent for a course based on completed lectures.
   * Requires the total lecture count from the Course document.
   */
  async _recomputeOverall(courseProgress, courseId) {
    const course = await courseRepository.findById(courseId);
    if (!course) return;

    // Count all lectures (sections + legacy flat)
    let totalLectures = (course.lectures?.length ?? 0);
    for (const sec of course.sections ?? []) {
      totalLectures += sec.lectures?.length ?? 0;
    }
    if (totalLectures === 0) return;

    const completedCount = courseProgress.lectures.filter((l) => l.completed).length;
    courseProgress.overallPercent = Math.round((completedCount / totalLectures) * 100);
    courseProgress.lastActivityAt = new Date();

    // Auto-issue certificate if threshold is met and not yet issued
    const threshold = course.completionThreshold ?? 80;
    if (
      course.certificateEnabled &&
      !courseProgress.certificateIssued &&
      courseProgress.overallPercent >= threshold
    ) {
      courseProgress.certificateIssued = true;
      courseProgress.certificateIssuedAt = new Date();
      logger.info(`[Progress] Certificate auto-issued for user ${courseProgress.courseId}`);
    }
  }

  // ── Lecture progress ───────────────────────────────────────────────────────

  /**
   * POST /progress/lecture
   * Updates watchedPercent and lastPositionSeconds for a lecture.
   * Marks as completed when watchedPercent >= VIDEO_COMPLETION_THRESHOLD.
   */
  async updateLectureProgress(userId, courseId, lectureId, watchedPercent, lastPositionSeconds) {
    const { user, courseProgress } = await this._getOrCreateCourseProgress(userId, courseId);

    let lp = courseProgress.lectures.find(
      (l) => l.lectureId.toString() === lectureId.toString()
    );
    if (!lp) {
      courseProgress.lectures.push({ lectureId });
      lp = courseProgress.lectures[courseProgress.lectures.length - 1];
    }

    lp.watchedPercent = Math.max(lp.watchedPercent, watchedPercent ?? 0);
    lp.lastPositionSeconds = lastPositionSeconds ?? lp.lastPositionSeconds;
    lp.lastWatchedAt = new Date();

    if (!lp.completed && lp.watchedPercent >= VIDEO_COMPLETION_THRESHOLD) {
      lp.completed = true;
      lp.completedAt = new Date();
    }

    await this._recomputeOverall(courseProgress, courseId);
    await userRepository.save(user);

    return { lectureProgress: lp, overallPercent: courseProgress.overallPercent };
  }

  /**
   * GET /progress/:courseId
   * Returns the full progress entry for a course.
   */
  async getCourseProgress(userId, courseId) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);
    const progress = user.progress.find(
      (p) => p.courseId.toString() === courseId.toString()
    );
    return progress ?? { courseId, lectures: [], quizAttempts: [], assignments: [], overallPercent: 0 };
  }

  // ── Quiz engine ────────────────────────────────────────────────────────────

  /**
   * POST /progress/quiz
   * Submit a quiz attempt. Validates maxAttempts, records score.
   */
  async submitQuiz(userId, courseId, quizId, answers, timeTakenSeconds) {
    const course = await courseRepository.findById(courseId);
    if (!course) throw new AppError('Course not found', 404);

    // Find the quiz in sections
    let quiz = null;
    for (const sec of course.sections ?? []) {
      quiz = sec.quizzes?.find((q) => q._id.toString() === quizId.toString());
      if (quiz) break;
    }
    if (!quiz) throw new AppError('Quiz not found', 404);

    const { user, courseProgress } = await this._getOrCreateCourseProgress(userId, courseId);

    // Check attempt count
    const previousAttempts = courseProgress.quizAttempts.filter(
      (a) => a.quizId.toString() === quizId.toString()
    );
    if (quiz.maxAttempts && previousAttempts.length >= quiz.maxAttempts) {
      throw new AppError(`Maximum attempts (${quiz.maxAttempts}) reached for this quiz`, 403);
    }

    // Grade the quiz
    let totalPoints = 0;
    let earnedPoints = 0;
    for (const q of quiz.questions) {
      totalPoints += q.points ?? 1;
      const submitted = answers[q._id.toString()];
      if (q.type === 'single' || q.type === 'truefalse') {
        if (submitted === q.answer) earnedPoints += q.points ?? 1;
      } else if (q.type === 'multiple') {
        const correct = JSON.stringify([...(q.answer ?? [])].sort());
        const given = JSON.stringify([...(submitted ?? [])].sort());
        if (correct === given) earnedPoints += q.points ?? 1;
      }
      // 'short' type is manually graded — not auto-scored here
    }

    const percentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const passed = percentage >= (quiz.passingScore ?? 60);

    courseProgress.quizAttempts.push({
      quizId,
      attemptNumber: previousAttempts.length + 1,
      score: earnedPoints,
      maxScore: totalPoints,
      percentage,
      passed,
      answers,
      timeTakenSeconds,
      submittedAt: new Date(),
    });

    courseProgress.lastActivityAt = new Date();
    await userRepository.save(user);

    return { score: earnedPoints, maxScore: totalPoints, percentage, passed };
  }

  // ── Assignments ────────────────────────────────────────────────────────────

  /**
   * POST /progress/assignment/submit
   * Submit an assignment file.
   */
  async submitAssignment(userId, courseId, assignmentId, fileUrl) {
    const { user, courseProgress } = await this._getOrCreateCourseProgress(userId, courseId);

    let submission = courseProgress.assignments.find(
      (a) => a.assignmentId.toString() === assignmentId.toString()
    );
    if (!submission) {
      courseProgress.assignments.push({ assignmentId, fileUrl, status: 'SUBMITTED' });
    } else {
      submission.fileUrl = fileUrl;
      submission.status = 'RESUBMITTED';
      submission.submittedAt = new Date();
    }

    courseProgress.lastActivityAt = new Date();
    await userRepository.save(user);
    return { message: 'Assignment submitted' };
  }

  /**
   * POST /progress/assignment/grade
   * Grade an assignment with rubric scores. Append-only grade history.
   * Only admins / co-instructors of the course call this.
   */
  async gradeAssignment(
    graderId,
    targetUserId,
    courseId,
    assignmentId,
    { totalScore, maxScore, feedback, rubricScores }
  ) {
    const { user, courseProgress } = await this._getOrCreateCourseProgress(
      targetUserId,
      courseId
    );

    const submission = courseProgress.assignments.find(
      (a) => a.assignmentId.toString() === assignmentId.toString()
    );
    if (!submission) throw new AppError('No submission found for this assignment', 404);

    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

    submission.gradeHistory.push({
      gradedBy: graderId,
      totalScore,
      maxScore,
      percentage,
      feedback,
      rubricScores: rubricScores ?? [],
      gradedAt: new Date(),
    });
    submission.status = 'GRADED';

    courseProgress.lastActivityAt = new Date();
    await userRepository.save(user);
    logger.info(`[Progress] Assignment ${assignmentId} graded by ${graderId} for user ${targetUserId}`);
    return { percentage, feedback };
  }

  // ── Certificates ───────────────────────────────────────────────────────────

  /**
   * GET /certificates/:courseId
   * Returns certificate metadata if the learner has earned it.
   */
  async getCertificate(userId, courseId) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    const progress = user.progress.find(
      (p) => p.courseId.toString() === courseId.toString()
    );
    if (!progress?.certificateIssued) {
      throw new AppError('Certificate not earned yet. Complete the required percentage of the course.', 403);
    }

    const course = await courseRepository.findById(courseId);
    if (!course) throw new AppError('Course not found', 404);

    return {
      userId,
      courseId,
      courseName: course.title,
      learnerName: user.fullName,
      completionPercent: progress.overallPercent,
      issuedAt: progress.certificateIssuedAt,
      instructorName: course.createdBy,
    };
  }

  // ── Course publish lifecycle ───────────────────────────────────────────────

  /**
   * POST /courses/:id/publish
   */
  async publishCourse(courseId, instructorId) {
    const course = await courseRepository.findById(courseId);
    if (!course) throw new AppError('Course not found', 404);

    const isOwner =
      course.instructorId?.toString() === instructorId.toString() ||
      (course.coInstructors ?? []).some((ci) => ci.toString() === instructorId.toString());

    if (!isOwner) throw new AppError('Only the course instructor can publish this course', 403);
    if (course.status === 'published') throw new AppError('Course is already published', 400);

    // Validate minimum content
    const totalLectures =
      (course.lectures?.length ?? 0) +
      (course.sections ?? []).reduce((sum, s) => sum + (s.lectures?.length ?? 0), 0);
    if (totalLectures === 0) {
      throw new AppError('Cannot publish a course with no lectures', 400);
    }

    course.status = 'published';
    course.publishedAt = new Date();
    await courseRepository.save(course);
    logger.info(`[Course] Published: ${course.title} (${courseId})`);
    return course;
  }

  /**
   * POST /courses/:id/unpublish → back to draft
   */
  async unpublishCourse(courseId, instructorId) {
    const course = await courseRepository.findById(courseId);
    if (!course) throw new AppError('Course not found', 404);

    const isOwner = course.instructorId?.toString() === instructorId.toString();
    if (!isOwner) throw new AppError('Only the course owner can unpublish this course', 403);

    course.status = 'draft';
    await courseRepository.save(course);
    return course;
  }

  /**
   * DELETE /courses/:id  → soft delete
   */
  async softDeleteCourse(courseId, instructorId) {
    const course = await courseRepository.findById(courseId);
    if (!course) throw new AppError('Course not found', 404);

    const isOwner = course.instructorId?.toString() === instructorId.toString();
    if (!isOwner) throw new AppError('Only the course owner can delete this course', 403);

    course.softDeleted = true;
    course.softDeletedAt = new Date();
    course.status = 'archived';
    await courseRepository.save(course);
    logger.info(`[Course] Soft-deleted: ${course.title} (${courseId})`);
    return { message: 'Course archived successfully' };
  }
}

export default new ProgressService();

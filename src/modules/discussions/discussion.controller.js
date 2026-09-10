import asyncHandler from '../../core/middlewares/asyncHandler.middleware.js';
import AppError from '../../core/utils/AppError.js';
import { sendSuccess } from '../../core/utils/apiResponse.js';
import discussionService from './discussion.service.js';

// ── Phase 6 ─────────────────────────────────────────────────────────────────

export const addQuestion = asyncHandler(async (req, res, next) => {
  const { courseId, lectureId, question, timestamp } = req.body;
  const userId = req.user.id;

  if (!courseId || !lectureId || !question || !question.trim()) {
    return next(new AppError('All fields are required', 400));
  }

  const discussion = await discussionService.addQuestion(userId, courseId, lectureId, question.trim(), timestamp);
  return sendSuccess(res, { discussion }, 201, 'Question posted successfully');
});

export const addReply = asyncHandler(async (req, res, next) => {
  const { discussionId, reply } = req.body;
  const userId = req.user.id;

  if (!discussionId || !reply || !reply.trim()) {
    return next(new AppError('Discussion ID and reply are required', 400));
  }

  const discussion = await discussionService.addReply(userId, discussionId, reply.trim());
  return sendSuccess(res, { discussion }, 200, 'Reply added successfully');
});

export const getDiscussions = asyncHandler(async (req, res) => {
  const { courseId, lectureId } = req.params;
  // Phase 9: staff see hidden posts; regular users do not
  const isStaff = ['ADMIN', 'SUPER_ADMIN', 'INSTRUCTOR'].includes(req.user?.role);
  const discussions = await discussionService.getDiscussions(courseId, lectureId, isStaff);
  return sendSuccess(res, { discussions }, 200);
});

// ── Phase 6: upvote (toggle) ─────────────────────────────────────────────────

export const upvoteQuestion = asyncHandler(async (req, res) => {
  const { discussionId } = req.params;
  const userId = req.user.id;
  const discussion = await discussionService.upvoteQuestion(userId, discussionId);
  return sendSuccess(res, { discussion }, 200, 'Vote updated');
});

// ── Phase 6: mark answered ───────────────────────────────────────────────────

export const markAnswered = asyncHandler(async (req, res) => {
  const { discussionId } = req.params;
  const userId = req.user.id;
  const discussion = await discussionService.markAnswered(userId, discussionId);
  return sendSuccess(res, { discussion }, 200, 'Marked as answered');
});

// ── Phase 9: flag / report ───────────────────────────────────────────────────

export const flagQuestion = asyncHandler(async (req, res) => {
  const { discussionId } = req.params;
  const userId = req.user.id;
  const discussion = await discussionService.flagQuestion(userId, discussionId);
  return sendSuccess(res, { discussion }, 200, 'Post reported. Our moderators will review it.');
});

// ── Phase 9: hide / unhide (admin/instructor only) ───────────────────────────

export const hideDiscussion = asyncHandler(async (req, res) => {
  const { discussionId } = req.params;
  const discussion = await discussionService.hideDiscussion(discussionId);
  return sendSuccess(res, { discussion }, 200, 'Post hidden from public view');
});

export const unhideDiscussion = asyncHandler(async (req, res) => {
  const { discussionId } = req.params;
  const discussion = await discussionService.unhideDiscussion(discussionId);
  return sendSuccess(res, { discussion }, 200, 'Post restored to public view');
});

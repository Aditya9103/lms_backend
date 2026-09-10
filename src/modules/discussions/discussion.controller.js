import asyncHandler from '../../core/middlewares/asyncHandler.middleware.js';
import AppError from '../../core/utils/AppError.js';
import discussionService from './discussion.service.js';

// ── Phase 6 ─────────────────────────────────────────────────────────────────

export const addQuestion = asyncHandler(async (req, res, next) => {
  const { courseId, lectureId, question, timestamp } = req.body;
  const userId = req.user.id;

  if (!courseId || !lectureId || !question) {
    return next(new AppError('All fields are required', 400));
  }

  const discussion = await discussionService.addQuestion(userId, courseId, lectureId, question, timestamp);
  res.status(201).json({ success: true, message: 'Question posted successfully', discussion });
});

export const addReply = asyncHandler(async (req, res, next) => {
  const { discussionId, reply } = req.body;
  const userId = req.user.id;

  if (!discussionId || !reply) {
    return next(new AppError('Discussion ID and reply are required', 400));
  }

  const discussion = await discussionService.addReply(userId, discussionId, reply);
  res.status(200).json({ success: true, message: 'Reply added successfully', discussion });
});

export const getDiscussions = asyncHandler(async (req, res, next) => {
  const { courseId, lectureId } = req.params;
  // Phase 9: staff see hidden posts; regular users do not
  const isStaff = ['ADMIN', 'SUPER_ADMIN', 'INSTRUCTOR'].includes(req.user?.role);
  const discussions = await discussionService.getDiscussions(courseId, lectureId, isStaff);
  res.status(200).json({ success: true, discussions });
});

// ── Phase 6: upvote (toggle) ─────────────────────────────────────────────────

export const upvoteQuestion = asyncHandler(async (req, res, next) => {
  const { discussionId } = req.params;
  const userId = req.user.id;
  const discussion = await discussionService.upvoteQuestion(userId, discussionId);
  res.status(200).json({ success: true, message: 'Vote updated', discussion });
});

// ── Phase 6: mark answered ───────────────────────────────────────────────────

export const markAnswered = asyncHandler(async (req, res, next) => {
  const { discussionId } = req.params;
  const userId = req.user.id;
  const discussion = await discussionService.markAnswered(userId, discussionId);
  res.status(200).json({ success: true, message: 'Marked as answered', discussion });
});

// ── Phase 9: flag / report ───────────────────────────────────────────────────

export const flagQuestion = asyncHandler(async (req, res, next) => {
  const { discussionId } = req.params;
  const userId = req.user.id;
  const discussion = await discussionService.flagQuestion(userId, discussionId);
  res.status(200).json({ success: true, message: 'Post reported. Our moderators will review it.', discussion });
});

// ── Phase 9: hide / unhide (admin/instructor only) ───────────────────────────

export const hideDiscussion = asyncHandler(async (req, res, next) => {
  const { discussionId } = req.params;
  const discussion = await discussionService.hideDiscussion(discussionId);
  res.status(200).json({ success: true, message: 'Post hidden from public view', discussion });
});

export const unhideDiscussion = asyncHandler(async (req, res, next) => {
  const { discussionId } = req.params;
  const discussion = await discussionService.unhideDiscussion(discussionId);
  res.status(200).json({ success: true, message: 'Post restored to public view', discussion });
});

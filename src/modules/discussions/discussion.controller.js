import asyncHandler from '../../core/middlewares/asyncHandler.middleware.js';
import AppError from '../../core/utils/AppError.js';
import discussionService from './discussion.service.js';

export const addQuestion = asyncHandler(async (req, res, next) => {
  const { courseId, lectureId, question, timestamp } = req.body;
  const userId = req.user.id;

  if (!courseId || !lectureId || !question) {
    return next(new AppError('All fields are required', 400));
  }

  try {
    const discussion = await discussionService.addQuestion(userId, courseId, lectureId, question, timestamp);
    res.status(201).json({
      success: true,
      message: 'Question posted successfully',
      discussion,
    });
  } catch (error) {
    return next(error);
  }
});

export const addReply = asyncHandler(async (req, res, next) => {
  const { discussionId, reply } = req.body;
  const userId = req.user.id;

  if (!discussionId || !reply) {
    return next(new AppError('Discussion ID and reply are required', 400));
  }

  try {
    const discussion = await discussionService.addReply(userId, discussionId, reply);
    res.status(200).json({
      success: true,
      message: 'Reply added successfully',
      discussion,
    });
  } catch (error) {
    return next(error);
  }
});

export const getDiscussions = asyncHandler(async (req, res, next) => {
  const { courseId, lectureId } = req.params;

  try {
    const discussions = await discussionService.getDiscussions(courseId, lectureId);
    res.status(200).json({
      success: true,
      discussions,
    });
  } catch (error) {
    return next(error);
  }
});

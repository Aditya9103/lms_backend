import interactionService from './interaction.service.js';
import asyncHandler from '../../core/middlewares/asyncHandler.middleware.js';
import { sendSuccess } from '../../core/utils/apiResponse.js';

export const toggleBookmark = asyncHandler(async (req, res) => {
  const { courseId, lectureId, timestamp, label } = req.body;
  const userId = req.user.id;

  const result = await interactionService.toggleBookmark(userId, courseId, lectureId, timestamp, label);

  return sendSuccess(res, { bookmarks: result.bookmarks }, 200, result.message);
});

export const getBookmarks = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const userId = req.user.id;

  const bookmarks = await interactionService.getBookmarks(userId, courseId);

  return sendSuccess(res, { bookmarks }, 200);
});

export const deleteBookmark = asyncHandler(async (req, res) => {
  const { bookmarkId } = req.params;
  const userId = req.user.id;

  const result = await interactionService.deleteBookmark(userId, bookmarkId);

  return sendSuccess(res, { bookmarks: result.bookmarks }, 200, result.message);
});

export const addNote = asyncHandler(async (req, res) => {
  const { courseId, lectureId, lectureTitle, timestamp, text } = req.body;
  const userId = req.user.id;

  const notes = await interactionService.addNote(userId, courseId, lectureId, lectureTitle, timestamp, text);

  return sendSuccess(res, { notes }, 200, 'Note saved');
});

export const getNotes = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const userId = req.user.id;

  const notes = await interactionService.getNotes(userId, courseId);

  return sendSuccess(res, { notes }, 200);
});

export const deleteNote = asyncHandler(async (req, res) => {
  const { noteId } = req.params;
  const userId = req.user.id;

  await interactionService.deleteNote(userId, noteId);

  return sendSuccess(res, null, 200, 'Note deleted');
});

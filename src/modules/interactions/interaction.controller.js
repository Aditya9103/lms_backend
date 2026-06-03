import interactionService from './interaction.service.js';
import AppError from '../../core/utils/AppError.js';

export const toggleBookmark = async (req, res, next) => {
  try {
    const { courseId, lectureId, timestamp, label } = req.body;
    const userId = req.user.id;

    const result = await interactionService.toggleBookmark(userId, courseId, lectureId, timestamp, label);

    res.status(200).json({
      success: true,
      message: result.message,
      bookmarks: result.bookmarks,
    });
  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};

export const getBookmarks = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    const bookmarks = await interactionService.getBookmarks(userId, courseId);

    res.status(200).json({ success: true, bookmarks });
  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};

export const addNote = async (req, res, next) => {
  try {
    const { courseId, lectureId, lectureTitle, timestamp, text } = req.body;
    const userId = req.user.id;

    const notes = await interactionService.addNote(userId, courseId, lectureId, lectureTitle, timestamp, text);

    res.status(200).json({
      success: true,
      message: 'Note saved',
      notes,
    });
  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};

export const getNotes = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    const notes = await interactionService.getNotes(userId, courseId);

    res.status(200).json({ success: true, notes });
  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};

export const deleteNote = async (req, res, next) => {
  try {
    const { noteId } = req.params;
    const userId = req.user.id;

    await interactionService.deleteNote(userId, noteId);

    res.status(200).json({ success: true, message: 'Note deleted' });
  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};

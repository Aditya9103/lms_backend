import User from '../models/user.model.js';
import AppError from '../utils/AppError.js';

/**
 * @BOOKMARKS
 */
export const toggleBookmark = async (req, res, next) => {
    try {
        const { courseId, lectureId, timestamp, label } = req.body;
        const userId = req.user.id;

        const user = await User.findById(userId);
        if (!user) return next(new AppError('User not found', 404));

        const bookmarkIndex = user.bookmarks.findIndex(
            b => b.courseId.toString() === courseId && b.lectureId === lectureId && Math.abs(b.timestamp - timestamp) < 1
        );

        if (bookmarkIndex > -1) {
            user.bookmarks.splice(bookmarkIndex, 1);
            await user.save();
            return res.status(200).json({ success: true, message: 'Bookmark removed' });
        }

        user.bookmarks.push({ courseId, lectureId, timestamp, label });
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Bookmark added',
            bookmarks: user.bookmarks
        });
    } catch (error) {
        return next(new AppError(error.message, 500));
    }
};

export const getBookmarks = async (req, res, next) => {
    try {
        const { courseId } = req.params;
        const userId = req.user.id;

        const user = await User.findById(userId);
        const bookmarks = user.bookmarks.filter(b => b.courseId.toString() === courseId);

        res.status(200).json({ success: true, bookmarks });
    } catch (error) {
        return next(new AppError(error.message, 500));
    }
};

/**
 * @NOTES
 */
export const addNote = async (req, res, next) => {
    try {
        const { courseId, lectureId, lectureTitle, timestamp, text } = req.body;
        const userId = req.user.id;

        const user = await User.findById(userId);
        user.notes.push({ courseId, lectureId, lectureTitle, timestamp, text });
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Note saved',
            notes: user.notes.filter(n => n.courseId.toString() === courseId)
        });
    } catch (error) {
        return next(new AppError(error.message, 500));
    }
};

export const getNotes = async (req, res, next) => {
    try {
        const { courseId } = req.params;
        const userId = req.user.id;

        const user = await User.findById(userId);
        const notes = user.notes.filter(n => n.courseId.toString() === courseId);

        res.status(200).json({ success: true, notes });
    } catch (error) {
        return next(new AppError(error.message, 500));
    }
};

export const deleteNote = async (req, res, next) => {
    try {
        const { noteId } = req.params;
        const userId = req.user.id;

        const user = await User.findById(userId);
        user.notes = user.notes.filter(n => n._id.toString() !== noteId);
        await user.save();

        res.status(200).json({ success: true, message: 'Note deleted' });
    } catch (error) {
        return next(new AppError(error.message, 500));
    }
};

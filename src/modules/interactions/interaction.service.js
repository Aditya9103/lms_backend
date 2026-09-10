import userRepository from '../users/user.repository.js';
import AppError from '../../core/utils/AppError.js';

class InteractionService {
  async toggleBookmark(userId, courseId, lectureId, timestamp, label) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    if (!user.bookmarks) user.bookmarks = [];

    const bookmarkIndex = user.bookmarks.findIndex(
      b => b.courseId?.toString() === courseId?.toString() &&
           b.lectureId === lectureId &&
           Math.abs((b.timestamp || 0) - (timestamp || 0)) < 1
    );

    let message;
    if (bookmarkIndex > -1) {
      user.bookmarks.splice(bookmarkIndex, 1);
      message = 'Bookmark removed';
    } else {
      user.bookmarks.push({ courseId, lectureId, timestamp, label });
      message = 'Bookmark added';
    }

    await userRepository.save(user);
    return { message, bookmarks: user.bookmarks };
  }

  async getBookmarks(userId, courseId) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    return (user.bookmarks || []).filter(b => b.courseId?.toString() === courseId?.toString());
  }

  async deleteBookmark(userId, bookmarkId) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    user.bookmarks = (user.bookmarks || []).filter(b => b._id?.toString() !== bookmarkId?.toString());
    await userRepository.save(user);
    return { message: 'Bookmark deleted', bookmarks: user.bookmarks };
  }

  async addNote(userId, courseId, lectureId, lectureTitle, timestamp, text) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    if (!user.notes) user.notes = [];
    user.notes.push({ courseId, lectureId, lectureTitle, timestamp, text });
    await userRepository.save(user);

    return user.notes.filter(n => n.courseId?.toString() === courseId?.toString());
  }

  async getNotes(userId, courseId) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    return (user.notes || []).filter(n => n.courseId?.toString() === courseId?.toString());
  }

  async deleteNote(userId, noteId) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    user.notes = (user.notes || []).filter(n => n._id?.toString() !== noteId?.toString());
    await userRepository.save(user);
  }
}

export default new InteractionService();

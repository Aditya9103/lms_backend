import discussionRepository from './discussion.repository.js';
import userRepository from '../users/user.repository.js';
import AppError from '../../core/utils/AppError.js';

class DiscussionService {
  async addQuestion(userId, courseId, lectureId, question, timestamp) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    const discussion = await discussionRepository.createDiscussion({
      courseId,
      lectureId,
      userId,
      userName: user.fullName,
      userAvatar: user.avatar?.secure_url,
      question,
      timestamp,
    });

    return discussion;
  }

  async addReply(userId, discussionId, reply) {
    const discussion = await discussionRepository.findDiscussionById(discussionId);
    if (!discussion) throw new AppError('Discussion not found', 404);

    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    discussion.replies.push({
      userId,
      userName: user.fullName,
      userAvatar: user.avatar?.secure_url,
      reply,
    });

    await discussionRepository.save(discussion);
    return discussion;
  }

  async getDiscussions(courseId, lectureId) {
    return await discussionRepository.findDiscussions(courseId, lectureId);
  }
}

export default new DiscussionService();

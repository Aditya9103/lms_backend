import discussionRepository from './discussion.repository.js';
import userRepository from '../users/user.repository.js';
import AppError from '../../core/utils/AppError.js';

/**
 * DiscussionService — Phase 6 + Phase 9 extended
 *
 * Phase 6:  addQuestion, addReply, getDiscussions, upvoteQuestion, markAnswered
 * Phase 9:  flagQuestion, hideDiscussion, unhideDiscussion, getDiscussions
 *           (filters hidden for non-staff)
 */
class DiscussionService {

  async addQuestion(userId, courseId, lectureId, question, timestamp) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    return await discussionRepository.createDiscussion({
      courseId,
      lectureId,
      userId,
      userName:   user.fullName,
      userAvatar: user.avatar?.secure_url,
      question,
      timestamp,
    });
  }

  async addReply(userId, discussionId, reply) {
    const discussion = await discussionRepository.findDiscussionById(discussionId);
    if (!discussion) throw new AppError('Discussion not found', 404);

    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    discussion.replies.push({
      userId,
      userName:   user.fullName,
      userAvatar: user.avatar?.secure_url,
      reply,
    });

    return await discussionRepository.save(discussion);
  }

  /**
   * getDiscussions — Phase 9 moderation filter
   *   isStaff = true  → returns all discussions including hidden (with hidden:true flag)
   *   isStaff = false → omits hidden discussions entirely
   */
  async getDiscussions(courseId, lectureId, isStaff = false) {
    const discussions = await discussionRepository.findDiscussions(courseId, lectureId);
    if (isStaff) return discussions;
    // Regular users only see visible posts
    return discussions.filter((d) => !d.hidden);
  }

  // ── Phase 6: upvote (toggle) ────────────────────────────────────────────────
  async upvoteQuestion(userId, discussionId) {
    const discussion = await discussionRepository.findDiscussionById(discussionId);
    if (!discussion) throw new AppError('Discussion not found', 404);

    const alreadyUpvoted = discussion.upvotedBy?.some(
      (id) => id.toString() === userId.toString()
    );

    if (alreadyUpvoted) {
      return await discussionRepository.unvote(discussionId, userId);
    }
    return await discussionRepository.upvote(discussionId, userId);
  }

  // ── Phase 6: resolve (mark answered) ───────────────────────────────────────
  async markAnswered(userId, discussionId) {
    const discussion = await discussionRepository.findDiscussionById(discussionId);
    if (!discussion) throw new AppError('Discussion not found', 404);
    return await discussionRepository.resolve(discussionId, userId);
  }

  // ── Phase 9: flag / report ──────────────────────────────────────────────────
  async flagQuestion(userId, discussionId) {
    const discussion = await discussionRepository.findDiscussionById(discussionId);
    if (!discussion) throw new AppError('Discussion not found', 404);

    // Prevent duplicate flags by the same user
    if (discussion.flaggedBy?.some((id) => id.toString() === userId.toString())) {
      throw new AppError('You have already reported this post', 409);
    }

    return await discussionRepository.flag(discussionId, userId);
  }

  // ── Phase 9: hide / unhide (moderator action) ───────────────────────────────
  async hideDiscussion(discussionId) {
    const discussion = await discussionRepository.findDiscussionById(discussionId);
    if (!discussion) throw new AppError('Discussion not found', 404);
    return await discussionRepository.hide(discussionId);
  }

  async unhideDiscussion(discussionId) {
    const discussion = await discussionRepository.findDiscussionById(discussionId);
    if (!discussion) throw new AppError('Discussion not found', 404);
    return await discussionRepository.unhide(discussionId);
  }
}

export default new DiscussionService();

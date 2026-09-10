import Discussion from './discussion.model.js';

/**
 * DiscussionRepository — Phase 9 extended
 * Adds: upvote, flag, hide, resolve operations.
 */
class DiscussionRepository {
  async createDiscussion(data) {
    return await Discussion.create(data);
  }

  async findDiscussionById(id) {
    return await Discussion.findById(id);
  }

  /**
   * findDiscussions — returns discussions for a lecture.
   * Hidden posts are excluded for regular users by the service layer.
   */
  async findDiscussions(courseId, lectureId) {
    return await Discussion.find({ courseId, lectureId })
      .sort({ upvotes: -1, createdAt: -1 })  // top-voted first, then newest
      .lean();
  }

  async save(discussion) {
    return await discussion.save();
  }

  // ── Phase 6: upvote ─────────────────────────────────────────────────────────
  async upvote(discussionId, userId) {
    // Atomic increment — only if user hasn't upvoted yet (addToSet)
    return await Discussion.findByIdAndUpdate(
      discussionId,
      {
        $addToSet: { upvotedBy: userId },
        $inc: { upvotes: 1 },
      },
      { new: true }
    );
  }

  async unvote(discussionId, userId) {
    return await Discussion.findByIdAndUpdate(
      discussionId,
      {
        $pull:  { upvotedBy: userId },
        $inc:   { upvotes: -1 },
      },
      { new: true }
    );
  }

  // ── Phase 6: resolve (mark answered) ────────────────────────────────────────
  async resolve(discussionId, resolvedBy) {
    return await Discussion.findByIdAndUpdate(
      discussionId,
      { resolved: true, resolvedBy },
      { new: true }
    );
  }

  // ── Phase 9: flag (report) ───────────────────────────────────────────────────
  async flag(discussionId, userId) {
    return await Discussion.findByIdAndUpdate(
      discussionId,
      {
        flagged: true,
        $addToSet: { flaggedBy: userId },
      },
      { new: true }
    );
  }

  // ── Phase 9: hide (moderator action) ────────────────────────────────────────
  async hide(discussionId) {
    return await Discussion.findByIdAndUpdate(
      discussionId,
      { hidden: true, hiddenAt: new Date() },
      { new: true }
    );
  }

  async unhide(discussionId) {
    return await Discussion.findByIdAndUpdate(
      discussionId,
      { hidden: false, $unset: { hiddenAt: '' } },
      { new: true }
    );
  }
}

export default new DiscussionRepository();

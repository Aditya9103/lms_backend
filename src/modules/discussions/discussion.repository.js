import Discussion from './discussion.model.js';

class DiscussionRepository {
  async createDiscussion(data) {
    return await Discussion.create(data);
  }

  async findDiscussionById(id) {
    return await Discussion.findById(id);
  }

  async findDiscussions(courseId, lectureId) {
    return await Discussion.find({ courseId, lectureId }).sort({ createdAt: -1 });
  }

  async save(discussion) {
    return await discussion.save();
  }
}

export default new DiscussionRepository();

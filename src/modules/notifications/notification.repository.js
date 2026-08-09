/**
 * notification.repository.js — Phase 6 Notification data access.
 */

import Notification from './notification.model.js';

class NotificationRepository {
  async create(data) {
    return await Notification.create(data);
  }

  async createMany(notifications) {
    return await Notification.insertMany(notifications);
  }

  async findForUser(userId, { limit = 20, skip = 0 } = {}) {
    return await Notification.find(
      {
        $or: [
          { targetUserId: userId },
          { targetRole: null, targetUserId: null }, // broadcast
        ],
      },
      null,
      { sort: { createdAt: -1 }, limit, skip }
    );
  }

  async findForRole(role, { limit = 20, skip = 0 } = {}) {
    return await Notification.find(
      { targetRole: role },
      null,
      { sort: { createdAt: -1 }, limit, skip }
    );
  }

  async markAsRead(notificationId, userId) {
    return await Notification.findOneAndUpdate(
      { _id: notificationId, targetUserId: userId },
      { read: true },
      { new: true }
    );
  }

  async markAllAsRead(userId) {
    return await Notification.updateMany({ targetUserId: userId }, { read: true });
  }

  async countUnread(userId) {
    return await Notification.countDocuments({ targetUserId: userId, read: false });
  }

  async deleteOlderThan(days) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return await Notification.deleteMany({ createdAt: { $lt: cutoff } });
  }
}

export default new NotificationRepository();

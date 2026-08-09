/**
 * notification.controller.js — Phase 6 Notification HTTP handlers.
 */

import notificationService from './notification.service.js';
import { sendSuccess } from '../../core/utils/apiResponse.js';
import asyncHandler from '../../core/middlewares/asyncHandler.middleware.js';

/** GET /api/v1/notifications */
export const getMyNotifications = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const skip = Number(req.query.skip) || 0;
  const notifications = await notificationService.getNotificationsForUser(
    req.user.id,
    { limit, skip }
  );
  const unreadCount = await notificationService.getUnreadCount(req.user.id);
  return sendSuccess(res, { notifications, unreadCount });
});

/** PATCH /api/v1/notifications/:id/read */
export const markRead = asyncHandler(async (req, res) => {
  const updated = await notificationService.markAsRead(req.params.id, req.user.id);
  return sendSuccess(res, updated);
});

/** PATCH /api/v1/notifications/read-all */
export const markAllRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllAsRead(req.user.id);
  return sendSuccess(res, result);
});

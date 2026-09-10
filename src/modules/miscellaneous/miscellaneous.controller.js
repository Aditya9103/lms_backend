import asyncHandler from '../../core/middlewares/asyncHandler.middleware.js';
import userService from '../users/user.service.js';
import AppError from '../../core/utils/AppError.js';
import { enqueueEmail } from '../../core/queue/queues.js';
import { sendSuccess } from '../../core/utils/apiResponse.js';

export const contactUs = asyncHandler(async (req, res, next) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return next(new AppError('Name, Email, Message are required', 400));
  }

  try {
    const subject = 'Contact Us Form';
    const textMessage = `${name} - ${email} <br /> ${message}`;
    await enqueueEmail(process.env.CONTACT_US_EMAIL, subject, textMessage);
  } catch (error) {
    return next(new AppError(error.message, 400));
  }

  return sendSuccess(res, null, 200, 'Your request has been submitted successfully');
});

export const userStats = asyncHandler(async (_req, res) => {
  const stats = await userService.getAdminUserStats();
  return sendSuccess(
    res,
    {
      allUsersCount: stats.allUsersCount,
      subscribedUsersCount: stats.subscribedUsersCount,
    },
    200,
    'All registered users count'
  );
});

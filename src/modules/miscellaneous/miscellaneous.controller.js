import asyncHandler from '../../core/middlewares/asyncHandler.middleware.js';
import userService from '../users/user.service.js';
import AppError from '../../core/utils/AppError.js';
import sendEmail from '../../core/utils/sendEmail.js';

export const contactUs = asyncHandler(async (req, res, next) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return next(new AppError('Name, Email, Message are required', 400));
  }

  try {
    const subject = 'Contact Us Form';
    const textMessage = `${name} - ${email} <br /> ${message}`;
    await sendEmail(process.env.CONTACT_US_EMAIL, subject, textMessage);
  } catch (error) {
    console.log(error);
    return next(new AppError(error.message, 400));
  }

  res.status(200).json({
    success: true,
    message: 'Your request has been submitted successfully',
  });
});

export const userStats = asyncHandler(async (req, res, next) => {
  try {
    const stats = await userService.getAdminUserStats();
    res.status(200).json({
      success: true,
      message: 'All registered users count',
      allUsersCount: stats.allUsersCount,
      subscribedUsersCount: stats.subscribedUsersCount,
    });
  } catch (error) {
    return next(error);
  }
});

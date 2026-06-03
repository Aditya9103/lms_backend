import crypto from 'crypto';
import fs from 'fs/promises';

import cloudinary from 'cloudinary';
import { OAuth2Client } from 'google-auth-library';

import asyncHandler from '../../core/middlewares/asyncHandler.middleware.js';
import AppError from '../../core/utils/AppError.js';
import sendEmail from '../../core/utils/sendEmail.js';
import userService from './user.service.js';


const cookieOptions = {
  secure: true,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  httpOnly: true,
  sameSite: 'none',
};



/**
 * @REGISTER
 * @ROUTE @POST {{URL}}/api/v1/user/register
 * @ACCESS Public
 */
export const registerUser = asyncHandler(async (req, res, next) => {
  const { fullName, email, password } = req.body;

  if (!fullName || !email || !password) {
    return next(new AppError('All fields are required', 400));
  }

  try {
    const { user, token } = await userService.registerUser({ fullName, email, password }, req.file);
    
    res.cookie('token', token, cookieOptions);
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * @LOGIN
 * @ROUTE @POST {{URL}}/api/v1/user/login
 * @ACCESS Public
 */
export const loginUser = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError('Email and Password are required', 400));
  }

  try {
    const { user, token } = await userService.loginUser(email, password);
    
    res.cookie('token', token, cookieOptions);
    res.status(200).json({
      success: true,
      message: 'User logged in successfully',
      user,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * @LOGOUT
 * @ROUTE @POST {{URL}}/api/v1/user/logout
 * @ACCESS Public
 */
export const logoutUser = asyncHandler(async (_req, res, _next) => {
  // Setting the cookie value to null
  res.cookie('token', null, {
    secure: true,
    maxAge: 0,
    httpOnly: true,
    sameSite: 'none',
  });



  // Sending the response
  res.status(200).json({
    success: true,
    message: 'User logged out successfully',
  });
});

/**
 * @LOGGED_IN_USER_DETAILS
 * @ROUTE @GET {{URL}}/api/v1/user/me
 * @ACCESS Private(Logged in users only)
 */
export const getLoggedInUserDetails = asyncHandler(async (req, res, next) => {
  try {
    const user = await userService.updateStreak(req.user.id);
    res.status(200).json({
      success: true,
      message: 'User details',
      user,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * @FORGOT_PASSWORD
 * @ROUTE @POST {{URL}}/api/v1/user/reset
 * @ACCESS Public
 */
export const forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;
  if (!email) return next(new AppError('Email is required', 400));

  try {
    await userService.forgotPassword(email);
    res.status(200).json({
      success: true,
      message: `Reset password token has been sent to ${email} successfully`,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * @RESET_PASSWORD
 * @ROUTE @POST {{URL}}/api/v1/user/reset/:resetToken
 * @ACCESS Public
 */
export const resetPassword = asyncHandler(async (req, res, next) => {
  const { resetToken } = req.params;
  const { password } = req.body;

  if (!password) return next(new AppError('Password is required', 400));

  try {
    await userService.resetPassword(resetToken, password);
    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * @CHANGE_PASSWORD
 * @ROUTE @POST {{URL}}/api/v1/user/change-password
 * @ACCESS Private (Logged in users only)
 */
export const changePassword = asyncHandler(async (req, res, next) => {
  const { oldPassword, newPassword } = req.body;
  const { id } = req.user;

  if (!oldPassword || !newPassword) {
    return next(new AppError('Old password and new password are required', 400));
  }

  try {
    await userService.changePassword(id, oldPassword, newPassword);
    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * @UPDATE_USER
 * @ROUTE @POST {{URL}}/api/v1/user/update/:id
 * @ACCESS Private (Logged in user only)
 */
export const updateUser = asyncHandler(async (req, res, next) => {
  const { fullName } = req.body;
  const { id } = req.params;

  try {
    await userService.updateUser(id, fullName, req.file);
    res.status(200).json({
      success: true,
      message: 'User details updated successfully',
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * @UPDATE_COURSE_PROGRESS
 * @ROUTE @POST {{URL}}/api/v1/user/progress/:courseId/:lectureId
 * @ACCESS Private (Logged in user only)
 */
export const updateCourseProgress = asyncHandler(async (req, res, next) => {
  const { courseId, lectureId } = req.params;
  const { id } = req.user;

  try {
    const progress = await userService.updateCourseProgress(id, courseId, lectureId);
    res.status(200).json({
      success: true,
      message: 'Progress updated successfully',
      progress,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * @UPDATE_VIDEO_PROGRESS
 * @ROUTE @POST {{URL}}/api/v1/user/video-progress
 * @ACCESS Private (Logged in user only)
 */
export const updateVideoProgress = asyncHandler(async (req, res, next) => {
  const { courseId, lectureId, timestamp } = req.body;
  const { id } = req.user;

  if (!courseId || !lectureId) {
    return next(new AppError('Course ID and Lecture ID are required', 400));
  }

  try {
    const recentlyWatched = await userService.updateVideoProgress(id, courseId, lectureId, timestamp);
    res.status(200).json({
      success: true,
      message: 'Video progress saved',
      recentlyWatched,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * @SUBMIT_QUIZ
 * @ROUTE @POST {{URL}}/api/v1/user/quiz/submit
 * @ACCESS Private (Logged in user only)
 */
export const submitQuiz = asyncHandler(async (req, res, next) => {
  const { courseId, quizId, score, totalQuestions, topic } = req.body;
  const { id } = req.user;

  if (!courseId || !quizId) {
    return next(new AppError('Course ID and Quiz ID are required', 400));
  }

  try {
    const { progress, weakTopics } = await userService.submitQuiz(id, courseId, quizId, score, totalQuestions, topic);
    res.status(200).json({
      success: true,
      message: 'Quiz submitted successfully',
      progress,
      weakTopics
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * @SUBMIT_ASSIGNMENT
 * @ROUTE @POST {{URL}}/api/v1/user/assignment/submit
 * @ACCESS Private (Logged in user only)
 */
export const submitAssignment = asyncHandler(async (req, res, next) => {
  const { courseId, assignmentId } = req.body;
  const { id } = req.user;

  if (!courseId || !assignmentId) {
    return next(new AppError('Course ID and Assignment ID are required', 400));
  }

  try {
    const progress = await userService.submitAssignment(id, courseId, assignmentId);
    res.status(200).json({
      success: true,
      message: 'Assignment submitted successfully',
      progress
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * @GOOGLE_AUTH
 * @ROUTE @POST {{URL}}/api/v1/user/google-auth
 * @ACCESS Public
 */
export const googleAuth = asyncHandler(async (req, res, next) => {
  const { credential } = req.body;
  if (!credential) return next(new AppError('Google credential is required', 400));

  try {
    const { user, token } = await userService.googleAuth(credential);
    res.cookie('token', token, cookieOptions);
    res.status(200).json({
      success: true,
      message: 'Google Authentication successful',
      user,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * @OTP_SIGNUP
 * @ROUTE @POST {{URL}}/api/v1/user/otp-signup
 * @ACCESS Public
 */
export const otpSignup = asyncHandler(async (req, res, next) => {
  const { fullName, email, password } = req.body;
  if (!fullName || !email) return next(new AppError('Full Name and Email are required', 400));

  try {
    await userService.otpSignup(fullName, email, password, req.file);
    res.status(200).json({ success: true, message: 'OTP sent to email' });
  } catch (error) {
    return next(error);
  }
});

export const verifySignupOtp = asyncHandler(async (req, res, next) => {
  const { email, otp } = req.body;
  if (!email || !otp) return next(new AppError('Email and OTP are required', 400));

  try {
    const { user, token } = await userService.verifyOtp(email, otp, 'signup');
    res.cookie('token', token, cookieOptions);
    res.status(200).json({ success: true, message: 'User registered successfully', user });
  } catch (error) {
    return next(error);
  }
});

export const otpLogin = asyncHandler(async (req, res, next) => {
  const { email } = req.body;
  if (!email) return next(new AppError('Email is required', 400));

  try {
    await userService.otpLogin(email);
    res.status(200).json({ success: true, message: 'OTP sent to email' });
  } catch (error) {
    return next(error);
  }
});

export const verifyLoginOtp = asyncHandler(async (req, res, next) => {
  const { email, otp } = req.body;
  if (!email || !otp) return next(new AppError('Email and OTP are required', 400));

  try {
    const { user, token } = await userService.verifyOtp(email, otp, 'login');
    res.cookie('token', token, cookieOptions);
    res.status(200).json({ success: true, message: 'Logged in successfully', user });
  } catch (error) {
    return next(error);
  }
});

export const resendOtp = asyncHandler(async (req, res, next) => {
  const { email } = req.body;
  if (!email) return next(new AppError('Email is required', 400));

  try {
    await userService.resendOtp(email);
    res.status(200).json({ success: true, message: 'OTP resent successfully' });
  } catch (error) {
    return next(error);
  }
});

/**
 * @ADMIN_OTP_SIGNUP
 * @ROUTE @POST {{URL}}/api/v1/user/admin/otp-signup
 * @ACCESS Public
 */
export const adminOtpSignup = asyncHandler(async (req, res, next) => {
  const { fullName, email, password, adminSecret } = req.body;
  if (!fullName || !email || !adminSecret) return next(new AppError('Full Name, Email, and Admin Secret are required', 400));

  try {
    await userService.adminOtpSignup(fullName, email, password, adminSecret, req.file);
    res.status(200).json({ success: true, message: 'OTP sent to email' });
  } catch (error) {
    return next(error);
  }
});

export const adminVerifySignupOtp = asyncHandler(async (req, res, next) => {
  const { email, otp } = req.body;
  if (!email || !otp) return next(new AppError('Email and OTP are required', 400));

  try {
    const { user, token } = await userService.verifyOtp(email, otp, 'signup', 'ADMIN');
    res.cookie('token', token, cookieOptions);
    res.status(200).json({ success: true, message: 'Admin account verified successfully', user });
  } catch (error) {
    return next(error);
  }
});

export const adminOtpLogin = asyncHandler(async (req, res, next) => {
  const { email } = req.body;
  if (!email) return next(new AppError('Email is required', 400));

  try {
    await userService.otpLogin(email, 'ADMIN');
    res.status(200).json({ success: true, message: 'OTP sent to email' });
  } catch (error) {
    return next(error);
  }
});

export const adminVerifyLoginOtp = asyncHandler(async (req, res, next) => {
  const { email, otp } = req.body;
  if (!email || !otp) return next(new AppError('Email and OTP are required', 400));

  try {
    const { user, token } = await userService.verifyOtp(email, otp, 'login', 'ADMIN');
    res.cookie('token', token, cookieOptions);
    res.status(200).json({ success: true, message: 'Admin logged in successfully', user });
  } catch (error) {
    return next(error);
  }
});

export const adminPasswordLogin = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) return next(new AppError('Email and Password are required', 400));

  try {
    const { user, token } = await userService.adminPasswordLogin(email, password);
    res.cookie('token', token, cookieOptions);
    res.status(200).json({ success: true, message: 'Admin logged in successfully', user });
  } catch (error) {
    return next(error);
  }
});

export const superAdminSignup = asyncHandler(async (req, res, next) => {
  const { fullName, email, password, superAdminSecurityCode } = req.body;
  if (!fullName || !email || !password || !superAdminSecurityCode) {
    return next(new AppError('All fields including security code are required', 400));
  }

  try {
    const { user, token } = await userService.superAdminSignup(fullName, email, password, superAdminSecurityCode);
    res.cookie('token', token, cookieOptions);
    res.status(201).json({ success: true, message: 'Super Admin registered successfully', user });
  } catch (error) {
    return next(error);
  }
});

/**
 * user.controller.js — User & Auth HTTP handlers
 *
 * All handlers use:
 *  - sendSuccess() from apiResponse.js for the response envelope
 *  - Zod DTOs (via validate middleware) instead of manual field checks
 *  - setRefreshTokenCookie / clearRefreshTokenCookie for token transport
 *
 * Envelope shape: { success: true, data: { ... } }
 * Error shape:    { success: false, error: { code, message } }
 */
import asyncHandler from '../../core/middlewares/asyncHandler.middleware.js';
import AppError from '../../core/utils/AppError.js';
import userService from './user.service.js';
import {
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} from '../../core/middlewares/auth.middleware.js';
import { sendSuccess } from '../../core/utils/apiResponse.js';

// ── Auth helpers ──────────────────────────────────────────────────────────────

/**
 * Shared response for all login/verify endpoints.
 * Sets the refresh token cookie + returns the access token in the body.
 */
const sendAuthResponse = (res, { user, token, rawRefreshToken }, status = 200) => {
  if (rawRefreshToken) setRefreshTokenCookie(res, rawRefreshToken);
  return sendSuccess(res, { accessToken: token, user }, status);
};

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * @openapi
 * /user/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user account
 */
export const registerUser = asyncHandler(async (req, res) => {
  const result = await userService.registerUser(req.body, req.file);
  return sendAuthResponse(res, result, 201);
});

// ── Password-based Auth ───────────────────────────────────────────────────────

/**
 * @openapi
 * /user/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email and password
 */
export const loginUser = asyncHandler(async (req, res) => {
  const result = await userService.loginUser(req.body.email, req.body.password);
  return sendAuthResponse(res, result);
});

/**
 * @openapi
 * /user/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout — revokes refresh token cookie
 */
export const logoutUser = asyncHandler(async (req, res) => {
  if (req.cookies?.refreshToken) {
    try {
      const user = await userService.getUserByRefreshToken(req.cookies.refreshToken);
      if (user) await userService.revokeToken(user._id, req.cookies.refreshToken);
    } catch (_) { /* best-effort — clear cookie regardless */ }
  }
  clearRefreshTokenCookie(res);
  return sendSuccess(res, null, 200);
});

// ── Profile ───────────────────────────────────────────────────────────────────

export const getLoggedInUserDetails = asyncHandler(async (req, res) => {
  const user = await userService.updateStreak(req.user.id);
  return sendSuccess(res, { user });
});

export const updateUser = asyncHandler(async (req, res) => {
  const { fullName } = req.body;
  const user = await userService.updateUser(req.params.id, fullName, req.file);
  return sendSuccess(res, { user }, 200, 'Profile updated successfully');
});

// ── Password reset ────────────────────────────────────────────────────────────

export const forgotPassword = asyncHandler(async (req, res) => {
  await userService.forgotPassword(req.body.email);
  return sendSuccess(res, null);
});

export const resetPassword = asyncHandler(async (req, res) => {
  await userService.resetPassword(req.params.resetToken, req.body.password);
  return sendSuccess(res, null);
});

export const changePassword = asyncHandler(async (req, res) => {
  await userService.changePassword(req.user.id, req.body.oldPassword, req.body.newPassword);
  return sendSuccess(res, null);
});

// ── OTP Flow ──────────────────────────────────────────────────────────────────

export const otpSignup = asyncHandler(async (req, res) => {
  const { fullName, email, password } = req.body;
  await userService.otpSignup(fullName, email, password, req.file);
  return sendSuccess(res, null);
});

export const verifySignupOtp = asyncHandler(async (req, res) => {
  const result = await userService.verifyOtp(req.body.email, req.body.otp, 'signup');
  return sendAuthResponse(res, result, 201);
});

export const otpLogin = asyncHandler(async (req, res) => {
  await userService.otpLogin(req.body.email);
  return sendSuccess(res, null);
});

export const verifyLoginOtp = asyncHandler(async (req, res) => {
  const result = await userService.verifyOtp(req.body.email, req.body.otp, 'login');
  return sendAuthResponse(res, result);
});

export const resendOtp = asyncHandler(async (req, res) => {
  await userService.resendOtp(req.body.email);
  return sendSuccess(res, null);
});

// ── Admin Auth ────────────────────────────────────────────────────────────────

export const adminOtpSignup = asyncHandler(async (req, res) => {
  const { fullName, email, password, adminSecret } = req.body;
  await userService.adminOtpSignup(fullName, email, password, adminSecret, req.file);
  return sendSuccess(res, null);
});

export const adminVerifySignupOtp = asyncHandler(async (req, res) => {
  const result = await userService.verifyOtp(req.body.email, req.body.otp, 'signup', 'ADMIN');
  return sendAuthResponse(res, result, 201);
});

export const adminOtpLogin = asyncHandler(async (req, res) => {
  await userService.otpLogin(req.body.email, 'ADMIN');
  return sendSuccess(res, null);
});

export const adminVerifyLoginOtp = asyncHandler(async (req, res) => {
  const result = await userService.verifyOtp(req.body.email, req.body.otp, 'login', 'ADMIN');
  return sendAuthResponse(res, result);
});

export const adminPasswordLogin = asyncHandler(async (req, res) => {
  const result = await userService.adminPasswordLogin(req.body.email, req.body.password);
  return sendAuthResponse(res, result);
});

// ── Super Admin ───────────────────────────────────────────────────────────────

export const superAdminSignup = asyncHandler(async (req, res) => {
  const { fullName, email, password, superAdminSecurityCode } = req.body;
  const result = await userService.superAdminSignup(fullName, email, password, superAdminSecurityCode);
  return sendAuthResponse(res, result, 201);
});

// ── Google OAuth ──────────────────────────────────────────────────────────────

export const googleAuth = asyncHandler(async (req, res, next) => {
  if (!req.body?.credential) return next(new AppError('Google credential is required', 400));
  const result = await userService.googleAuth(req.body.credential);
  return sendAuthResponse(res, result);
});

// ── Progress & Assessment ─────────────────────────────────────────────────────

export const updateCourseProgress = asyncHandler(async (req, res) => {
  const { courseId, lectureId } = req.params;
  const progress = await userService.updateCourseProgress(req.user.id, courseId, lectureId);
  return sendSuccess(res, { progress });
});

export const updateVideoProgress = asyncHandler(async (req, res) => {
  const { courseId, lectureId, timestamp, positionSeconds, lastPositionSeconds } = req.body;
  const time = timestamp ?? positionSeconds ?? lastPositionSeconds ?? 0;
  const recentlyWatched = await userService.updateVideoProgress(
    req.user.id, courseId, lectureId, Number(time)
  );
  return sendSuccess(res, { recentlyWatched });
});

export const submitQuiz = asyncHandler(async (req, res) => {
  const { courseId, quizId, score, totalQuestions, topic } = req.body;
  const result = await userService.submitQuiz(
    req.user.id, courseId, quizId, score, totalQuestions, topic
  );
  return sendSuccess(res, { progress: result.progress, weakTopics: result.weakTopics });
});

export const submitAssignment = asyncHandler(async (req, res) => {
  const { courseId, assignmentId } = req.body;
  const progress = await userService.submitAssignment(
    req.user.id, courseId, assignmentId, req.file
  );
  return sendSuccess(res, { progress });
});

export const gradeAssignment = asyncHandler(async (req, res) => {
  const { userId, courseId, assignmentId, score } = req.body;
  const gradedAssignment = await userService.gradeAssignment(
    userId, courseId, assignmentId, score
  );
  return sendSuccess(res, { gradedAssignment });
});

import { Router } from 'express';
import {
  changePassword,
  forgotPassword,
  getLoggedInUserDetails,
  loginUser,
  logoutUser,
  registerUser,
  resetPassword,
  updateUser,
  updateCourseProgress,
  updateVideoProgress,
  submitQuiz,
  submitAssignment,
  googleAuth,
  otpSignup,
  verifySignupOtp,
  otpLogin,
  verifyLoginOtp,
  resendOtp,
  adminOtpSignup,
  adminVerifySignupOtp,
  adminOtpLogin,
  adminVerifyLoginOtp,
  adminPasswordLogin,
  superAdminSignup,
  superAdminOtpLogin,
  superAdminVerifyLoginOtp,
  superAdminPasswordLogin,
  gradeAssignment,
} from './user.controller.js';
import { isLoggedIn, authorizeRoles, refreshAccessToken } from '../../core/middlewares/auth.middleware.js';
import upload from '../../core/middlewares/multer.middleware.js';
import validate from '../../core/middlewares/validate.middleware.js';
import { authLimiter, uploadLimiter, refreshLimiter } from '../../core/middlewares/rateLimiter.middleware.js';
import {
  RegisterDto,
  LoginDto,
  OtpRequestDto,
  OtpVerifyDto,
  ResendOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  UpdateProfileDto,
  VideoProgressDto,
  QuizSubmitDto,
  AdminPasswordLoginDto,
  AdminOtpSignupDto,
  SuperAdminSignupDto,
} from './dto/user.dto.js';

const router = Router();

// ─── Public Auth ──────────────────────────────────────────────────────────────

/**
 * @openapi
 * /user/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/RegisterDto'
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error or email already exists
 */
router.post('/register', authLimiter, uploadLimiter, upload.single('avatar'), validate(RegisterDto), registerUser);

router.post('/otp-signup', authLimiter, uploadLimiter, upload.single('avatar'), validate(OtpRequestDto), otpSignup);
router.post('/verify-signup-otp', authLimiter, validate(OtpVerifyDto), verifySignupOtp);

/**
 * @openapi
 * /user/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email and password
 */
router.post('/login', authLimiter, validate(LoginDto), loginUser);

router.post('/otp-login', authLimiter, validate(OtpRequestDto), otpLogin);
router.post('/verify-login-otp', authLimiter, validate(OtpVerifyDto), verifyLoginOtp);
router.post('/resend-otp', authLimiter, validate(ResendOtpDto), resendOtp);

// ─── Admin Auth ───────────────────────────────────────────────────────────────
router.post('/admin/otp-signup', authLimiter, uploadLimiter, upload.single('avatar'), validate(AdminOtpSignupDto), adminOtpSignup);
router.post('/admin/verify-signup-otp', authLimiter, validate(OtpVerifyDto), adminVerifySignupOtp);
router.post('/admin/otp-login', authLimiter, validate(OtpRequestDto), adminOtpLogin);
router.post('/admin/verify-login-otp', authLimiter, validate(OtpVerifyDto), adminVerifyLoginOtp);
router.post('/admin/password-login', authLimiter, validate(AdminPasswordLoginDto), adminPasswordLogin);

// ─── Super Admin Auth ─────────────────────────────────────────────────────────
router.post('/super-admin/signup', authLimiter, validate(SuperAdminSignupDto), superAdminSignup);
router.post('/super-admin/otp-login', authLimiter, validate(OtpRequestDto), superAdminOtpLogin);
router.post('/super-admin/verify-login-otp', authLimiter, validate(OtpVerifyDto), superAdminVerifyLoginOtp);
router.post('/super-admin/password-login', authLimiter, validate(LoginDto), superAdminPasswordLogin);

// ─── OAuth & Session ──────────────────────────────────────────────────────────
router.post('/google-auth', authLimiter, googleAuth);
router.post('/logout', logoutUser);
router.post('/refresh', refreshLimiter, refreshAccessToken);

// ─── Authenticated User Routes ────────────────────────────────────────────────
router.get('/me', isLoggedIn, getLoggedInUserDetails);
router.post('/reset', authLimiter, validate(ForgotPasswordDto), forgotPassword);
router.post('/reset/:resetToken', authLimiter, validate(ResetPasswordDto), resetPassword);
router.post('/forgot-password', authLimiter, validate(ForgotPasswordDto), forgotPassword);
router.post('/reset-password/:resetToken', authLimiter, validate(ResetPasswordDto), resetPassword);
router.post('/change-password', isLoggedIn, validate(ChangePasswordDto), changePassword);
router.put('/update/:id', isLoggedIn, upload.single('avatar'), validate(UpdateProfileDto), updateUser);

// ─── Progress & Assessment ────────────────────────────────────────────────────
router.post('/progress/:courseId/:lectureId', isLoggedIn, updateCourseProgress);
router.post('/video-progress', isLoggedIn, validate(VideoProgressDto), updateVideoProgress);
router.post('/quiz/submit', isLoggedIn, validate(QuizSubmitDto), submitQuiz);
router.post('/assignment/submit', isLoggedIn, uploadLimiter, upload.single('assignmentFile'), submitAssignment);
router.put('/assignment/grade', isLoggedIn, authorizeRoles('ADMIN', 'SUPER_ADMIN'), gradeAssignment);

export default router;

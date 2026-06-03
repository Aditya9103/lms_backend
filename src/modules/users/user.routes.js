import { Router } from "express";
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
} from "./user.controller.js";
import { isLoggedIn } from "../../core/middlewares/auth.middleware.js";
import upload from "../../core/middlewares/multer.middleware.js";

const router = Router();

router.post("/register", upload.single("avatar"), registerUser);
router.post("/otp-signup", upload.single("avatar"), otpSignup);
router.post("/verify-signup-otp", verifySignupOtp);
router.post("/login", loginUser);
router.post("/otp-login", otpLogin);
router.post("/verify-login-otp", verifyLoginOtp);
router.post("/resend-otp", resendOtp);

// Admin Routes
router.post("/admin/otp-signup", upload.single("avatar"), adminOtpSignup);
router.post("/admin/verify-signup-otp", adminVerifySignupOtp);
router.post("/admin/otp-login", adminOtpLogin);
router.post("/admin/verify-login-otp", adminVerifyLoginOtp);
router.post("/admin/password-login", adminPasswordLogin);

// Super Admin Routes
router.post("/super-admin/signup", superAdminSignup);

router.post("/google-auth", googleAuth);
router.post("/logout", logoutUser);
router.get("/me", isLoggedIn, getLoggedInUserDetails);
router.post("/reset", forgotPassword);
router.post("/reset/:resetToken", resetPassword);
router.post("/change-password", isLoggedIn, changePassword);
router.put("/update/:id", isLoggedIn, upload.single("avatar"), updateUser);
router.post("/progress/:courseId/:lectureId", isLoggedIn, updateCourseProgress);
router.post("/video-progress", isLoggedIn, updateVideoProgress);
router.post("/quiz/submit", isLoggedIn, submitQuiz);
router.post("/assignment/submit", isLoggedIn, submitAssignment);

export default router;

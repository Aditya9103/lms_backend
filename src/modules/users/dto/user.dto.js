import { z } from 'zod';

/** Minimum shared fields */
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password cannot exceed 128 characters');

const emailSchema = z
  .string()
  .email('Invalid email address')
  .toLowerCase()
  .trim();

const fullNameSchema = z
  .string()
  .min(4, 'Name must be at least 4 characters')
  .max(60, 'Name cannot exceed 60 characters')
  .trim();

/** POST /user/register */
export const RegisterDto = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

/** POST /user/login */
export const LoginDto = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

/** POST /user/otp-signup, /user/otp-login */
export const OtpRequestDto = z.object({
  email: emailSchema,
  fullName: fullNameSchema.optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
});

/** POST /user/verify-signup-otp, /user/verify-login-otp */
export const OtpVerifyDto = z.object({
  email: emailSchema,
  otp: z.string().length(6, 'OTP must be exactly 6 digits').regex(/^\d{6}$/, 'OTP must be numeric'),
});

/** POST /user/resend-otp */
export const ResendOtpDto = z.object({
  email: emailSchema,
});

/** POST /user/reset (forgot password) */
export const ForgotPasswordDto = z.object({
  email: emailSchema,
});

/** POST /user/reset/:token (reset password) */
export const ResetPasswordDto = z.object({
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

/** POST /user/change-password */
export const ChangePasswordDto = z.object({
  oldPassword: z.string().min(1, 'Old password is required'),
  newPassword: passwordSchema,
});

/** PUT /user/update/:id */
export const UpdateProfileDto = z.object({
  fullName: fullNameSchema.optional(),
  email: emailSchema.optional(),
}).strict();

/** POST /user/video-progress */
export const VideoProgressDto = z.object({
  courseId: z.string().min(1),
  lectureId: z.string().min(1),
  positionSeconds: z.coerce.number().min(0),
  durationSeconds: z.coerce.number().min(1),
});

/** POST /user/quiz/submit */
export const QuizSubmitDto = z.object({
  courseId: z.string().min(1),
  sectionId: z.string().min(1),
  quizId: z.string().min(1),
  answers: z.array(
    z.object({
      questionId: z.string().min(1),
      selectedOption: z.union([z.number(), z.array(z.number()), z.string()]),
    })
  ).min(1, 'At least one answer is required'),
});

/** Admin login routes */
export const AdminPasswordLoginDto = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  securityCode: z.string().optional(),
});

/** POST /user/super-admin/signup */
export const SuperAdminSignupDto = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
  securityCode: z.string().min(1, 'Security code is required'),
});

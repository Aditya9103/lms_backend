import cloudinary from 'cloudinary';
import crypto from 'crypto';
import fs from 'fs/promises';
import { OAuth2Client } from 'google-auth-library';
import userRepository from './user.repository.js';
import { enqueueEmail } from '../../core/queue/queues.js';
import AppError from '../../core/utils/AppError.js';
import config from '../../core/config/env.js';
import {
  checkLockout,
  recordFailedAttempt,
  resetFailedAttempts,
} from '../../core/middlewares/auth.middleware.js';
import logger from '../../core/logger/logger.js';

class UserService {
  
  async registerUser(userData, file) {
    const { fullName, email, password } = userData;
    const userExists = await userRepository.findByEmail(email);

    if (userExists) {
      throw new AppError('Email already exists', 409);
    }

    const user = await userRepository.create({
      fullName,
      email,
      password,
      isVerified: true,
      avatar: {
        public_id: email,
        secure_url: 'https://res.cloudinary.com/dnad8ehxf',
      },
    });

    if (!user) {
      throw new AppError('User registration failed, please try again later', 400);
    }

    if (file) {
      try {
        const result = await cloudinary.v2.uploader.upload(file.path, {
          folder: 'lms',
          width: 250,
          height: 250,
          gravity: 'faces',
          crop: 'fill',
        });
        if (result) {
          user.avatar.public_id = result.public_id;
          user.avatar.secure_url = result.secure_url;
          await fs.rm(`uploads/${file.filename}`);
        }
      } catch (error) {
        throw new AppError(error || 'File not uploaded, please try again', 400);
      }
    }

    const rawRefreshToken = user.generateRefreshToken(user._id.toString());
    await userRepository.save(user);
    const token = await user.generateJWTToken();
    user.password = undefined;

    return { user, token, rawRefreshToken };
  }

  async loginUser(email, password) {
    // Select password field explicitly
    const user = await userRepository.findByEmailWithPassword(email);

    if (!user) {
      throw new AppError('Email or Password do not match or user does not exist', 401);
    }

    // Shared lockout check (same counter for all login methods)
    checkLockout(user);

    const passwordMatch = await user.comparePassword(password);
    if (!passwordMatch) {
      recordFailedAttempt(user);
      await userRepository.save(user);
      throw new AppError('Email or Password do not match or user does not exist', 401);
    }

    if (!user.isVerified) {
      throw new AppError('Please verify your email via OTP before logging in', 403);
    }

    resetFailedAttempts(user);
    user.lastLoginDate = Date.now();
    const rawRefreshToken = user.generateRefreshToken(user._id.toString());
    await userRepository.save(user);

    const token = await user.generateJWTToken();
    user.password = undefined;

    logger.info(`[Auth] Login success: ${user.email}`);
    return { user, token, rawRefreshToken };
  }

  async updateStreak(userId) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    if (!user.streak) {
      user.streak = { count: 0, lastActivity: null };
    }

    const now = new Date();
    const lastActivity = user.streak.lastActivity ? new Date(user.streak.lastActivity) : null;

    if (lastActivity) {
      const isSameDay =
        now.getFullYear() === lastActivity.getFullYear() &&
        now.getMonth() === lastActivity.getMonth() &&
        now.getDate() === lastActivity.getDate();

      if (!isSameDay) {
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const isYesterday =
          yesterday.getFullYear() === lastActivity.getFullYear() &&
          yesterday.getMonth() === lastActivity.getMonth() &&
          yesterday.getDate() === lastActivity.getDate();

        if (isYesterday) {
          user.streak.count = (user.streak.count || 0) + 1;
        } else {
          user.streak.count = 1;
        }
        user.streak.lastActivity = now;
      }
    } else {
      user.streak.count = 1;
      user.streak.lastActivity = now;
    }

    await userRepository.save(user);
    return user;
  }

  async forgotPassword(email) {
    const user = await userRepository.findByEmail(email);
    if (!user) throw new AppError('Email not registered', 400);

    const resetToken = await user.generatePasswordResetToken();
    await userRepository.save(user);

    const resetPasswordUrl = `${config.FRONTEND_URL}/reset-password/${resetToken}`;
    const subject = 'Reset Password';
    const message = `You can reset your password by clicking <a href=${resetPasswordUrl} target="_blank">Reset your password</a>\nIf the above link does not work for some reason then copy paste this link in new tab ${resetPasswordUrl}.\n If you have not requested this, kindly ignore.`;

    try {
      await enqueueEmail(email, subject, message);
    } catch (error) {
      user.forgotPasswordToken = undefined;
      user.forgotPasswordExpiry = undefined;
      await userRepository.save(user);
      throw new AppError(error.message || 'Something went wrong, please try again.', 500);
    }
  }

  async resetPassword(resetToken, password) {
    const forgotPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const user = await userRepository.findByForgotPasswordToken(forgotPasswordToken, Date.now());

    if (!user) throw new AppError('Token is invalid or expired, please try again', 400);

    user.password = password;
    user.forgotPasswordExpiry = undefined;
    user.forgotPasswordToken = undefined;

    await userRepository.save(user);
  }

  async changePassword(userId, oldPassword, newPassword) {
    const user = await userRepository.findByIdWithPassword(userId);
    if (!user) throw new AppError('Invalid user id or user does not exist', 400);

    const isPasswordValid = await user.comparePassword(oldPassword);
    if (!isPasswordValid) throw new AppError('Invalid old password', 400);

    user.password = newPassword;
    await userRepository.save(user);
  }

  async updateUser(userId, fullName, file) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('Invalid user id or user does not exist', 400);

    if (fullName) user.fullName = fullName;

    if (file) {
      if (user.avatar?.public_id && !user.avatar.public_id.includes('@')) {
        try {
          await cloudinary.v2.uploader.destroy(user.avatar.public_id);
        } catch (_) {}
      }
      try {
        const result = await cloudinary.v2.uploader.upload(file.path, {
          folder: 'lms', width: 250, height: 250, gravity: 'faces', crop: 'fill',
        });
        if (result) {
          user.avatar.public_id = result.public_id;
          user.avatar.secure_url = result.secure_url;
        }
      } catch (error) {
        throw new AppError(error.message || 'File not uploaded, please try again', 400);
      } finally {
        try {
          await fs.rm(`uploads/${file.filename}`, { force: true });
        } catch (_) {
          try { await fs.unlink(file.path); } catch (_) {}
        }
      }
    }
    await userRepository.save(user);
    return user;
  }

  async updateCourseProgress(userId, courseId, lectureId) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    let prog = user.progress.find((p) => p.courseId.toString() === courseId.toString());

    if (!prog) {
      user.progress.push({
        courseId,
        completedLectures: [],
        lectures: [],
        quizAttempts: [],
        completedQuizzes: [],
        completedAssignments: [],
        assignments: [],
      });
      prog = user.progress[user.progress.length - 1];
    }

    if (!Array.isArray(prog.completedLectures)) {
      prog.completedLectures = [];
    }

    const lectureIdStr = lectureId.toString();
    const lectureIndex = prog.completedLectures.indexOf(lectureIdStr);
    if (lectureIndex !== -1) {
      prog.completedLectures.splice(lectureIndex, 1);
    } else {
      prog.completedLectures.push(lectureIdStr);
    }

    await userRepository.save(user);
    return user.progress;
  }

  async updateVideoProgress(userId, courseId, lectureId, timestamp) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    const existingIndex = user.recentlyWatched.findIndex(
      (item) => item.courseId.toString() === courseId && item.lectureId.toString() === lectureId
    );

    if (existingIndex !== -1) {
      user.recentlyWatched.splice(existingIndex, 1);
    }

    user.recentlyWatched.unshift({
      courseId,
      lectureId,
      timestamp,
      lastAccessed: new Date(),
    });

    if (user.recentlyWatched.length > 10) {
      user.recentlyWatched.pop();
    }

    await userRepository.save(user);
    return user.recentlyWatched;
  }

  async submitQuiz(userId, courseId, quizId, score, totalQuestions, topic) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    if (!Array.isArray(user.weakTopics)) {
      user.weakTopics = [];
    }

    const progressIndex = user.progress.findIndex((p) => p.courseId.toString() === courseId.toString());

    if (progressIndex !== -1) {
      if (!Array.isArray(user.progress[progressIndex].completedQuizzes)) {
        user.progress[progressIndex].completedQuizzes = [];
      }
      const quizIndex = user.progress[progressIndex].completedQuizzes.findIndex(
        (q) => q.quizId.toString() === quizId.toString()
      );

      if (quizIndex === -1) {
        user.progress[progressIndex].completedQuizzes.push({ quizId, score, totalQuestions });
      } else {
        if (score > user.progress[progressIndex].completedQuizzes[quizIndex].score) {
          user.progress[progressIndex].completedQuizzes[quizIndex].score = score;
        }
      }
    } else {
      user.progress.push({
        courseId,
        completedQuizzes: [{ quizId, score, totalQuestions }],
      });
    }

    if (topic && (score / totalQuestions) < 0.7) {
      if (!user.weakTopics.includes(topic)) {
        user.weakTopics.push(topic);
      }
    } else if (topic) {
      user.weakTopics = user.weakTopics.filter((t) => t !== topic);
    }

    await userRepository.save(user);
    return { progress: user.progress, weakTopics: user.weakTopics };
  }

  async submitAssignment(userId, courseId, assignmentId, file) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    let fileUrl = null;
    if (file) {
      try {
        const result = await cloudinary.v2.uploader.upload(file.path, {
          folder: 'lms_submissions',
          resource_type: 'auto',
        });
        if (result) {
          fileUrl = result.secure_url;
        }
      } catch (error) {
        throw new AppError(error.message || 'File not uploaded, please try again', 400);
      } finally {
        try {
          await fs.rm(`uploads/${file.filename}`, { force: true });
        } catch (_) {
          try { await fs.unlink(file.path); } catch (_) {}
        }
      }
    }

    const progressIndex = user.progress.findIndex((p) => p.courseId.toString() === courseId.toString());

    if (progressIndex !== -1) {
      if (!Array.isArray(user.progress[progressIndex].completedAssignments)) {
        user.progress[progressIndex].completedAssignments = [];
      }
      const assignmentIndex = user.progress[progressIndex].completedAssignments.findIndex(
        (a) => a.assignmentId.toString() === assignmentId.toString()
      );

      if (assignmentIndex === -1) {
        user.progress[progressIndex].completedAssignments.push({
          assignmentId,
          status: 'SUBMITTED',
          fileUrl,
        });
      } else {
        if (fileUrl) {
          user.progress[progressIndex].completedAssignments[assignmentIndex].fileUrl = fileUrl;
        }
      }
    } else {
      user.progress.push({
        courseId,
        completedAssignments: [{ assignmentId, status: 'SUBMITTED', fileUrl }],
      });
    }

    await userRepository.save(user);
    return user.progress;
  }

  async gradeAssignment(userId, courseId, assignmentId, score) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    const progressIndex = user.progress.findIndex((p) => p.courseId.toString() === courseId.toString());
    if (progressIndex === -1) throw new AppError('Course progress not found for user', 404);

    if (!Array.isArray(user.progress[progressIndex].completedAssignments)) {
      user.progress[progressIndex].completedAssignments = [];
    }

    const assignmentIndex = user.progress[progressIndex].completedAssignments.findIndex(
      (a) => a.assignmentId.toString() === assignmentId.toString()
    );

    if (assignmentIndex === -1) {
      throw new AppError('Assignment submission not found', 404);
    }

    user.progress[progressIndex].completedAssignments[assignmentIndex].score = score;
    user.progress[progressIndex].completedAssignments[assignmentIndex].status = 'GRADED';

    await userRepository.save(user);
    return user.progress[progressIndex].completedAssignments[assignmentIndex];
  }

  async googleAuth(credential) {
    const client = new OAuth2Client(config.GOOGLE_CLIENT_ID);
    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken: credential,
        audience: config.GOOGLE_CLIENT_ID,
      });
    } catch (error) {
      throw new AppError('Invalid Google Token', 401);
    }

    const { email, name, picture, sub } = ticket.getPayload();
    let user = await userRepository.findByEmail(email);

    if (user) {
      // Shared lockout check — even Google OAuth goes through it
      checkLockout(user);

      if (!user.googleId) {
        user.googleId = sub;
        user.authProvider = 'google';
        user.isVerified = true;
      }
      resetFailedAttempts(user);
      user.lastLoginDate = Date.now();
    } else {
      user = await userRepository.create({
        fullName: name,
        email,
        avatar: { public_id: email, secure_url: picture },
        googleId: sub,
        authProvider: 'google',
        isVerified: true,
        lastLoginDate: Date.now(),
      });
    }

    const rawRefreshToken = user.generateRefreshToken('google-oauth');
    await userRepository.save(user);

    const token = await user.generateJWTToken();
    user.password = undefined;

    logger.info(`[Auth] Google login: ${user.email}`);
    return { user, token, rawRefreshToken };
  }

  async sendOtpEmail(email, type, otp) {
    const subject = type === 'signup' ? 'Your Verification Code' : 'Your Login Verification Code';
    const message = `
      <h2>${subject}</h2>
      <p>Your code is: <strong>${otp}</strong></p>
      <p>This code will expire in 10 minutes.</p>
    `;
    await enqueueEmail(email, subject, message);
  }

  async otpSignup(fullName, email, password, file) {
    let user = await userRepository.findByEmail(email);
    if (user && user.isVerified) throw new AppError('Email already registered and verified', 409);

    if (!user) {
      user = await userRepository.create({
        fullName,
        email,
        password: password || undefined,
        authProvider: 'otp',
        avatar: { public_id: email, secure_url: 'https://res.cloudinary.com/dnad8ehxf' }
      });
    } else {
      user.fullName = fullName;
      if (password) user.password = password;
    }

    if (file) {
      try {
        const result = await cloudinary.v2.uploader.upload(file.path, {
          folder: 'lms', width: 250, height: 250, gravity: 'faces', crop: 'fill'
        });
        if (result) {
          user.avatar.public_id = result.public_id;
          user.avatar.secure_url = result.secure_url;
          await fs.rm(`uploads/${file.filename}`);
        }
      } catch (error) {}
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = crypto.createHash('sha256').update(otp).digest('hex');
    user.otpExpiresAt = Date.now() + 10 * 60 * 1000;
    user.otpType = 'signup';
    user.lastOtpSentAt = Date.now();
    user.otpResendCount = 0;
    
    await userRepository.save(user);

    try {
      await this.sendOtpEmail(email, 'signup', otp);
    } catch (error) {
      user.otp = undefined;
      user.otpExpiresAt = undefined;
      await userRepository.save(user);
      throw new AppError('Email could not be sent', 500);
    }
  }

  async verifyOtp(email, otp, expectedType, role = 'USER') {
    const user = await userRepository.findByEmailWithOtp(email);
    if (!user) throw new AppError('User not found', 404);

    // Shared lockout check — OTP shares same counter as password login
    checkLockout(user);

    if (expectedType === 'signup' && user.isVerified) throw new AppError('Already verified', 400);
    if (expectedType === 'login' && !user.isVerified) throw new AppError('Not verified', 404);
    if (role === 'ADMIN' && user.role !== 'ADMIN') throw new AppError('Unauthorized access', 403);

    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

    if (user.otp !== hashedOtp || user.otpExpiresAt < Date.now()) {
      recordFailedAttempt(user);
      await userRepository.save(user);
      throw new AppError(user.otp !== hashedOtp ? 'Invalid OTP' : 'OTP expired', 400);
    }

    resetFailedAttempts(user);
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiresAt = undefined;
    user.otpType = undefined;
    user.lastLoginDate = Date.now();

    const rawRefreshToken = user.generateRefreshToken('otp-verify');
    await userRepository.save(user);

    const token = await user.generateJWTToken();
    user.password = undefined;

    logger.info(`[Auth] OTP ${expectedType} verified: ${user.email}`);
    return { user, token, rawRefreshToken };
  }

  async otpLogin(email, role = 'USER') {
    const user = await userRepository.findByEmail(email);
    if (!user || !user.isVerified) throw new AppError('User not found or not verified', 404);
    if (role === 'ADMIN' && user.role !== 'ADMIN') throw new AppError('Unauthorized access', 403);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = crypto.createHash('sha256').update(otp).digest('hex');
    user.otpExpiresAt = Date.now() + 10 * 60 * 1000;
    user.otpType = 'login';
    user.lastOtpSentAt = Date.now();
    user.otpResendCount = 0;
    
    await userRepository.save(user);

    try {
      await this.sendOtpEmail(email, 'login', otp);
    } catch (error) {
      user.otp = undefined;
      user.otpExpiresAt = undefined;
      await userRepository.save(user);
      throw new AppError('Email could not be sent', 500);
    }
  }

  async resendOtp(email) {
    const user = await userRepository.findByEmail(email);
    if (!user) throw new AppError('User not found', 404);

    if (user.lastOtpSentAt && Date.now() - user.lastOtpSentAt.getTime() < 60000) {
      throw new AppError('Please wait 60 seconds before requesting a new OTP', 429);
    }

    if (user.otpResendCount >= 3) {
      throw new AppError('Maximum OTP requests exceeded. Please try again later.', 429);
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = crypto.createHash('sha256').update(otp).digest('hex');
    user.otpExpiresAt = Date.now() + 10 * 60 * 1000;
    user.lastOtpSentAt = Date.now();
    user.otpResendCount = (user.otpResendCount || 0) + 1;
    await userRepository.save(user);

    try {
      await this.sendOtpEmail(email, user.otpType || 'login', otp);
    } catch (error) {
      user.otp = undefined;
      user.otpExpiresAt = undefined;
      await userRepository.save(user);
      throw new AppError('Email could not be sent', 500);
    }
  }

  async adminOtpSignup(fullName, email, password, adminSecret, file) {
    if (adminSecret !== process.env.ADMIN_SECRET) throw new AppError('Invalid Admin Secret', 403);

    let user = await userRepository.findByEmail(email);
    if (user && user.isVerified) throw new AppError('Email already registered and verified', 409);

    if (!user) {
      user = await userRepository.create({
        fullName,
        email,
        password: password || undefined,
        authProvider: 'otp',
        role: 'ADMIN',
        avatar: { public_id: email, secure_url: 'https://res.cloudinary.com/dnad8ehxf' }
      });
    } else {
      user.fullName = fullName;
      user.role = 'ADMIN';
      if (password) user.password = password;
    }

    if (file) {
      try {
        const result = await cloudinary.v2.uploader.upload(file.path, {
          folder: 'lms', width: 250, height: 250, gravity: 'faces', crop: 'fill'
        });
        if (result) {
          user.avatar.public_id = result.public_id;
          user.avatar.secure_url = result.secure_url;
          await fs.rm(`uploads/${file.filename}`);
        }
      } catch (error) {}
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = crypto.createHash('sha256').update(otp).digest('hex');
    user.otpExpiresAt = Date.now() + 10 * 60 * 1000;
    user.otpType = 'signup';
    user.lastOtpSentAt = Date.now();
    user.otpResendCount = 0;
    await userRepository.save(user);

    try {
      await this.sendOtpEmail(email, 'signup', otp);
    } catch (error) {
      user.otp = undefined;
      user.otpExpiresAt = undefined;
      await userRepository.save(user);
      throw new AppError('Email could not be sent', 500);
    }
  }

  async adminPasswordLogin(email, password) {
    const user = await userRepository.findByEmailWithPassword(email);

    if (!user) throw new AppError('Email or Password do not match', 401);

    // Shared lockout check
    checkLockout(user);

    const passwordMatch = await user.comparePassword(password);
    if (!passwordMatch) {
      recordFailedAttempt(user);
      await userRepository.save(user);
      throw new AppError('Email or Password do not match', 401);
    }

    if (!user.isVerified) throw new AppError('Please verify your email before logging in', 403);
    if (user.role !== 'ADMIN') throw new AppError('Unauthorized access', 403);

    resetFailedAttempts(user);
    user.lastLoginDate = Date.now();
    const rawRefreshToken = user.generateRefreshToken('admin-password');
    await userRepository.save(user);

    const token = await user.generateJWTToken();
    user.password = undefined;

    logger.info(`[Auth] Admin password login: ${user.email}`);
    return { user, token, rawRefreshToken };
  }

  async superAdminSignup(fullName, email, password, superAdminSecurityCode) {
    if (superAdminSecurityCode !== config.SUPER_ADMIN_SECURITY_CODE) {
      throw new AppError('Invalid setup security code', 403);
    }

    const userExists = await userRepository.findByEmail(email);
    if (userExists) throw new AppError('Email already exists', 409);

    const user = await userRepository.create({
      fullName,
      email,
      password,
      role: 'SUPER_ADMIN',
      isVerified: true,
      avatar: { public_id: email, secure_url: 'https://res.cloudinary.com/dnad8ehxf' }
    });

    if (!user) throw new AppError('Failed to create super admin', 400);

    const rawRefreshToken = user.generateRefreshToken('initial-setup');
    await userRepository.save(user);
    const token = await user.generateJWTToken();
    user.password = undefined;

    return { user, token, rawRefreshToken };
  }
  async getAdminUserStats() {
    const allUsersCount = await userRepository.countUsers({});
    const subscribedUsersCount = await userRepository.countUsers({
      'subscription.status': 'active',
    });
    return { allUsersCount, subscribedUsersCount };
  }

  /** Lookup by raw refresh token (for logout). */
  async getUserByRefreshToken(rawToken) {
    return await userRepository.findByRefreshToken(rawToken);
  }

  /** Revoke a single refresh token for a user. */
  async revokeToken(userId, rawToken) {
    return await userRepository.revokeRefreshToken(userId, rawToken);
  }
}

export default new UserService();

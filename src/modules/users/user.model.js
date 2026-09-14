import crypto from 'crypto';

import { Schema, model } from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../../core/config/env.js';

const userSchema = new Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Name is required'],
      minlength: [4, 'Name must be at least 4 characters'],
      lowercase: true,
      trim: true, // Removes unnecessary spaces
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      match: [
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
        'Please fill in a valid email address',
      ], // Matches email against regex
    },
    password: {
      type: String,
      // required: [true, 'Password is required'], // Removed for Google Auth compatibility
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // Will not select password upon looking up a document
    },
    googleId: {
      type: String,
      default: null,
    },
    authProvider: {
      type: String,
      enum: ['email', 'google', 'otp'],
      default: 'email',
    },
    lastLoginDate: {
      type: Date,
      default: Date.now,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    otp: {
      type: String,
      select: false,
    },
    otpExpiresAt: {
      type: Date,
    },
    otpType: {
      type: String,
      enum: ['signup', 'login'],
    },
    otpResendCount: {
      type: Number,
      default: 0,
    },
    lastOtpSentAt: {
      type: Date,
    },
    subscription: {
      id: String,
      status: String,
    },
    avatar: {
      public_id: {
        type: String,
      },
      secure_url: {
        type: String,
      },
    },
    role: {
      type: String,
      enum: ['USER', 'ADMIN', 'SUPER_ADMIN'],
      default: 'USER',
    },
    superAdminSecurityCode: {
      type: String,
      select: false,
    },
    permissions: [{ type: String }],

    // ── Auth security ─────────────────────────────────────────────────────────
    failedLoginAttempts: { type: Number, default: 0 },
    lockoutUntil: { type: Date, default: null },

    // Refresh tokens: stored as hashed tokens with per-device metadata.
    // Never store raw refresh tokens in the DB.
    refreshTokens: [
      {
        tokenHash: { type: String, required: true, select: false },
        deviceInfo: { type: String, default: 'unknown' },
        createdAt: { type: Date, default: Date.now },
        expiresAt: { type: Date, required: true },
        isRevoked: { type: Boolean, default: false },
      },
    ],

    forgotPasswordToken: String,
    forgotPasswordExpiry: Date,
    progress: [
      {
        courseId: {
          type: Schema.Types.ObjectId,
          ref: 'Course',
          required: true,
        },
        // ── Lecture progress ────────────────────────────────────────────────
        completedLectures: [{ type: String }],
        lectures: [
          {
            lectureId: { type: Schema.Types.ObjectId, required: true },
            watchedPercent: { type: Number, default: 0, min: 0, max: 100 },
            lastPositionSeconds: { type: Number, default: 0 },
            completed: { type: Boolean, default: false },
            completedAt: Date,
            lastWatchedAt: { type: Date, default: Date.now },
          },
        ],
        // ── Quiz attempts ────────────────────────────────────────────────────
        completedQuizzes: [
          {
            quizId: { type: Schema.Types.ObjectId },
            score: Number,
            totalQuestions: Number,
          },
        ],
        quizAttempts: [
          {
            quizId: { type: Schema.Types.ObjectId, required: true },
            attemptNumber: { type: Number, default: 1 },
            score: Number,
            maxScore: Number,
            percentage: Number,
            passed: Boolean,
            answers: Schema.Types.Mixed,
            timeTakenSeconds: Number,
            submittedAt: { type: Date, default: Date.now },
          },
        ],
        // ── Assignment submissions + append-only grade history ───────────────
        completedAssignments: [
          {
            assignmentId: { type: Schema.Types.ObjectId },
            status: { type: String, default: 'SUBMITTED' },
            fileUrl: String,
            score: Number,
          },
        ],
        assignments: [
          {
            assignmentId: { type: Schema.Types.ObjectId, required: true },
            status: {
              type: String,
              enum: ['SUBMITTED', 'GRADED', 'RESUBMITTED'],
              default: 'SUBMITTED',
            },
            fileUrl: String,
            submittedAt: { type: Date, default: Date.now },
            gradeHistory: [
              {
                gradedBy: { type: Schema.Types.ObjectId, ref: 'User' },
                totalScore: Number,
                maxScore: Number,
                percentage: Number,
                feedback: String,
                rubricScores: [
                  {
                    criterionId: Schema.Types.ObjectId,
                    criterionName: String,
                    earnedPoints: Number,
                    maxPoints: Number,
                    comment: String,
                  },
                ],
                gradedAt: { type: Date, default: Date.now },
              },
            ],
          },
        ],
        overallPercent: { type: Number, default: 0, min: 0, max: 100 },
        certificateIssued: { type: Boolean, default: false },
        certificateIssuedAt: Date,
        enrolledAt: { type: Date, default: Date.now },
        lastActivityAt: { type: Date, default: Date.now },
      },
    ],

    recentlyWatched: [
      {
        courseId: { type: Schema.Types.ObjectId, ref: 'Course' },
        lectureId: { type: Schema.Types.ObjectId },
        timestamp: { type: Number, default: 0 },
        lastAccessed: { type: Date, default: Date.now },
      },
    ],
    weakTopics: [String],
    streak: {
      count: {
        type: Number,
        default: 0,
      },
      lastActivity: {
        type: Date,
        default: Date.now,
      },
    },
    bookmarks: [
      {
        courseId: { type: Schema.Types.ObjectId, ref: 'Course' },
        lectureId: String,
        timestamp: Number,
        label: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    notes: [
      {
        courseId: { type: Schema.Types.ObjectId, ref: 'Course' },
        lectureId: String,
        lectureTitle: String,
        timestamp: Number,
        text: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Hashes password before saving to the database
userSchema.pre('save', async function (next) {
  // If password is not modified then do not hash it
  if (!this.isModified('password')) return next();

  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods = {
  // method which will help us compare plain password with hashed password and returns true or false
  comparePassword: async function (plainPassword) {
    if (!this.password || typeof this.password !== 'string' || !plainPassword) {
      return false;
    }
    return await bcrypt.compare(plainPassword, this.password);
  },

  /**
   * Generates a short-lived access token (15 min).
   * Payload is minimal — no subscription data (fetch fresh on each request).
   */
  generateJWTToken: async function () {
    return jwt.sign(
      { id: this._id, role: this.role },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRY }
    );
  },

  /**
   * Generates a cryptographically random refresh token,
   * stores its SHA-256 hash in the refreshTokens array,
   * and returns the raw token to be set as an httpOnly cookie.
   *
   * @param {string} deviceInfo - User-Agent string for session tracking
   * @returns {string} rawRefreshToken
   */
  generateRefreshToken: function (deviceInfo = 'unknown') {
    const rawToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (config.REFRESH_TOKEN_EXPIRY_DAYS || 30));

    // Clean up truly expired tokens before adding new one (preserve revoked unexpired tokens for reuse detection)
    this.refreshTokens = (this.refreshTokens || []).filter(
      (t) => t.expiresAt > new Date()
    );

    this.refreshTokens.push({ tokenHash, deviceInfo, expiresAt });
    return rawToken;
  },

  // This will generate a token for password reset
  generatePasswordResetToken: async function () {
    // creating a random token using node's built-in crypto module
    const resetToken = crypto.randomBytes(20).toString('hex');

    // Again using crypto module to hash the generated resetToken with sha256 algorithm and storing it in database
    this.forgotPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Adding forgot password expiry to 15 minutes
    this.forgotPasswordExpiry = Date.now() + 15 * 60 * 1000;

    return resetToken;
  },
};

const User = model('User', userSchema);

export default User;

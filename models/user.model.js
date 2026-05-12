import crypto from 'crypto';

import { Schema, model } from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const userSchema = new Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Name is required'],
      minlength: [5, 'Name must be at least 5 characters'],
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
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // Will not select password upon looking up a document
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
      enum: ['USER', 'ADMIN'],
      default: 'USER',
    },
    forgotPasswordToken: String,
    forgotPasswordExpiry: Date,
    progress: [
      {
        courseId: {
          type: Schema.Types.ObjectId,
          ref: 'Course',
        },
        completedLectures: [
          {
            type: Schema.Types.ObjectId,
          },
        ],
        completedQuizzes: [
          {
            quizId: Schema.Types.ObjectId,
            score: Number,
            totalQuestions: Number,
            completedAt: { type: Date, default: Date.now },
          },
        ],
        completedAssignments: [
          {
            assignmentId: Schema.Types.ObjectId,
            status: { type: String, enum: ['SUBMITTED', 'GRADED'], default: 'SUBMITTED' },
            score: Number,
            submittedAt: { type: Date, default: Date.now },
          },
        ],
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
    return await bcrypt.compare(plainPassword, this.password);
  },

  // Will generate a JWT token with user id as payload
  generateJWTToken: async function () {
    return await jwt.sign(
      { id: this._id, role: this.role, subscription: this.subscription },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRY,
      }
    );
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

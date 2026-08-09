import { model, Schema } from 'mongoose';

// ── Sub-schemas ───────────────────────────────────────────────────────────────

const inVideoQuizSchema = new Schema({
  timestamp: { type: Number, required: true },
  question: { type: String, required: true },
  options: [String],
  answer: Number, // index of correct option (for single-choice)
}, { _id: true });

const lectureSchema = new Schema({
  title: String,
  description: String,
  lecture: {
    public_id: { type: String, required: true },
    secure_url: { type: String, required: true },
  },
  duration: Number, // in seconds
  isFree: { type: Boolean, default: false }, // preview lectures
  dripDays: { type: Number, default: 0 },    // 0 = immediately available
  inVideoQuizzes: [inVideoQuizSchema],
}, { _id: true });

/**
 * Phase 5 quiz question — supports four types:
 *  - single   (original MCQ, answer is an index)
 *  - multiple (multi-select, answers is array of indices)
 *  - truefalse (answer is 0=false or 1=true)
 *  - short    (answer is a string, graded by instructor)
 */
const questionSchema = new Schema({
  type: {
    type: String,
    enum: ['single', 'multiple', 'truefalse', 'short'],
    default: 'single',
  },
  question: { type: String, required: true },
  options: [String],              // not used for 'short'
  answer: Schema.Types.Mixed,    // Number | Number[] | String depending on type
  explanation: String,           // shown after submission
  points: { type: Number, default: 1 },
}, { _id: true });

const quizSchema = new Schema({
  title: { type: String, required: true },
  questions: [questionSchema],
  dueDate: Date,
  timeLimit: Number,      // seconds; null = no limit
  maxAttempts: { type: Number, default: 3 },
  passingScore: { type: Number, default: 60 }, // percentage
}, { _id: true });

/**
 * Rubric criterion — each criterion has a name, description, and max points.
 * Graders fill in earnedPoints per criterion.
 */
const rubricCriterionSchema = new Schema({
  name: { type: String, required: true },
  description: String,
  maxPoints: { type: Number, required: true },
}, { _id: true });

const assignmentSchema = new Schema({
  title: { type: String, required: true },
  description: String,
  file: {
    public_id: String,
    secure_url: String,
  },
  dueDate: Date,
  maxScore: { type: Number, default: 100 },
  rubric: [rubricCriterionSchema],
}, { _id: true });

const sectionSchema = new Schema({
  title: { type: String, required: true },
  lectures: [lectureSchema],
  quizzes: [quizSchema],
  assignments: [assignmentSchema],
  // prerequisiteSectionId: null means section is freely accessible
  prerequisiteSectionId: { type: Schema.Types.ObjectId, default: null },
}, { _id: true });

// ── Main Course Schema ────────────────────────────────────────────────────────

const courseSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      minlength: [8, 'Title must be atleast 8 characters'],
      maxlength: [60, 'Title cannot be more than 60 characters'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      minlength: [20, 'Description must be atleast 20 characters long'],
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
    },
    level: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner',
    },
    language: { type: String, default: 'English' },
    tags: [String],

    // ── Publish lifecycle ──────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
    publishedAt: Date,
    softDeleted: { type: Boolean, default: false, index: true },
    softDeletedAt: Date,

    // ── Instructors ────────────────────────────────────────────────────────
    createdBy: {
      type: String,
      required: [true, 'Course instructor name is required'],
    },
    instructorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    coInstructors: [{ type: Schema.Types.ObjectId, ref: 'User' }],

    // ── Content ────────────────────────────────────────────────────────────
    sections: [sectionSchema],

    // Legacy flat lectures array (kept for backward compat with existing data)
    lectures: [lectureSchema],

    thumbnail: {
      public_id: { type: String },
      secure_url: { type: String },
    },
    numberOfLectures: { type: Number, default: 0 },

    // ── Drip delivery ──────────────────────────────────────────────────────
    dripEnabled: { type: Boolean, default: false },
    // If dripEnabled, each lecture's dripDays field dictates availability
    // relative to enrollment date.

    // ── Certificates ───────────────────────────────────────────────────────
    certificateEnabled: { type: Boolean, default: true },
    // Percentage of lectures a learner must complete to earn the certificate.
    completionThreshold: { type: Number, default: 80, min: 0, max: 100 },
  },
  {
    timestamps: true,
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
courseSchema.index({ status: 1, softDeleted: 1 }); // catalog query
courseSchema.index({ instructorId: 1, status: 1 }); // instructor dashboard
courseSchema.index({ tags: 1 });
courseSchema.index({ category: 1, status: 1 });
courseSchema.index({ title: 'text', description: 'text', tags: 'text' }); // full-text search

const Course = model('Course', courseSchema);

export default Course;

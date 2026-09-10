import { Schema, model } from 'mongoose';

/**
 * Discussion schema — Phase 9 extended
 *
 * New fields:
 *   upvotes     — running count (optimistic, server-confirmed)
 *   upvotedBy   — Set of user IDs to prevent duplicate upvotes
 *   flagged     — true once any user reports the post
 *   flaggedBy   — list of reporting user IDs
 *   hidden      — true when a moderator hides the post
 *   resolvedBy  — admin/instructor who marked it answered
 *   resolved    — Phase 6: answered flag (kept)
 */
const discussionSchema = new Schema({
    courseId: {
        type: Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },
    lectureId: {
        type: String,
        required: true
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    userName: String,
    userAvatar: String,
    question: {
        type: String,
        required: true,
        trim: true
    },
    timestamp: {
        type: Number,
        default: null
    },

    // ── Engagement ─────────────────────────────────────────────────────────
    upvotes:   { type: Number, default: 0 },
    upvotedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],

    // ── Moderation (Phase 9) ────────────────────────────────────────────────
    flagged:   { type: Boolean, default: false },
    flaggedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    hidden:    { type: Boolean, default: false },  // set by admin/instructor
    hiddenAt:  { type: Date },

    // ── Resolution (Phase 6) ────────────────────────────────────────────────
    resolved:   { type: Boolean, default: false },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    replies: [
        {
            userId:     { type: Schema.Types.ObjectId, ref: 'User' },
            userName:   String,
            userAvatar: String,
            reply:      String,
            createdAt:  { type: Date, default: Date.now }
        }
    ],
}, {
    timestamps: true
});

// Performance index — most queries filter by courseId + lectureId
discussionSchema.index({ courseId: 1, lectureId: 1, createdAt: -1 });

const Discussion = model('Discussion', discussionSchema);

export default Discussion;

import { Schema, model } from 'mongoose';

/**
 * ActivityLog model — Phase 9 updated
 *
 * TTL index on createdAt: MongoDB automatically deletes documents older
 * than 90 days (7,776,000 seconds). The TTL background worker runs every
 * ~60 seconds, so deletion is near-real-time once the threshold is crossed.
 * No application-level cron job is needed.
 */
const activityLogSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    role: { type: String },
    action: { type: String, required: true },
    module: { type: String },
    description: { type: String },
    ipAddress: { type: String },
    deviceInfo: { type: String },
    browser: { type: String },
    location: { type: String },
  },
  { timestamps: true }
);

// Phase 9: 90-day TTL — MongoDB auto-deletes logs after expireAfterSeconds
activityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7_776_000 }); // 90 days

const ActivityLog = model('ActivityLog', activityLogSchema);

export default ActivityLog;

import { Schema, model } from 'mongoose';

const activityLogSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    role: {
      type: String,
    },
    action: {
      type: String,
      required: true,
    },
    module: {
      type: String,
    },
    description: {
      type: String,
    },
    ipAddress: {
      type: String,
    },
    deviceInfo: {
      type: String,
    },
    browser: {
      type: String,
    },
    location: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

const ActivityLog = model('ActivityLog', activityLogSchema);

export default ActivityLog;

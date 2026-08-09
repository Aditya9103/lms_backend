import { Schema, model } from 'mongoose';

const notificationSchema = new Schema(
  {
    type: {
      type: String,
      required: true, // e.g., 'NEW_USER', 'ADMIN_REGISTRATION', 'SYSTEM_ERROR'
    },
    message: {
      type: String,
      required: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
    metadata: {
      type: Schema.Types.Mixed,  // arbitrary payload — courseId, lectureId, etc.
      default: {},
    },
    link: String,                // optional deep-link URL for the frontend
    targetRole: {
      type: String,
      enum: ['ADMIN', 'SUPER_ADMIN'],
    },
    targetUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

const Notification = model('Notification', notificationSchema);

export default Notification;

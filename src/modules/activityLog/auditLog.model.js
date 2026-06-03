import { Schema, model } from 'mongoose';

const auditLogSchema = new Schema(
  {
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    entity: {
      type: String, // e.g., 'User', 'Course', 'Settings'
      required: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
    },
    oldValue: {
      type: Schema.Types.Mixed,
    },
    newValue: {
      type: Schema.Types.Mixed,
    },
    ipAddress: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

const AuditLog = model('AuditLog', auditLogSchema);

export default AuditLog;

import { Schema, model } from 'mongoose';

const systemLogSchema = new Schema(
  {
    level: {
      type: String,
      enum: ['info', 'warn', 'error', 'critical'],
      default: 'info',
    },
    message: {
      type: String,
      required: true,
    },
    meta: {
      type: Schema.Types.Mixed, // For storing flexible metadata (e.g., error stack, response times)
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

const SystemLog = model('SystemLog', systemLogSchema);

export default SystemLog;

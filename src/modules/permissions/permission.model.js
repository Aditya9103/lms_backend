import { Schema, model } from 'mongoose';

const permissionSchema = new Schema(
  {
    role: {
      type: String,
      required: true,
      unique: true,
      enum: ['ADMIN', 'SUPER_ADMIN'],
    },
    permissions: [
      {
        type: String, // e.g., 'manage_users', 'manage_admins', 'manage_courses'
      },
    ],
  },
  {
    timestamps: true,
  }
);

const Permission = model('Permission', permissionSchema);

export default Permission;

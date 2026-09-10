import os from 'os';
import mongoose from 'mongoose';
import superAdminRepository from './superAdmin.repository.js';
import AppError from '../../core/utils/AppError.js';
import { logActivity } from '../../core/utils/activityLogger.js';
import { cacheAside } from '../../core/cache/cacheAside.js'; // Phase 8

class SuperAdminService {
  async getAllUsersAndAdmins() {
    return await superAdminRepository.findAllUsersAndAdmins();
  }

  async updateRole(adminId, targetUserId, role, permissions, req) {
    if (targetUserId.toString() === adminId.toString() && role !== 'SUPER_ADMIN') {
      throw new AppError('SuperAdmin cannot demote themselves', 400);
    }

    const user = await superAdminRepository.findUserById(targetUserId);
    if (!user) throw new AppError('User not found', 404);

    const oldRole = user.role;
    user.role = role;
    if (permissions) {
      user.permissions = permissions;
    }
    await superAdminRepository.save(user);

    await logActivity({
      userId: adminId,
      role: req.user.role,
      action: 'ROLE_UPDATED',
      module: 'UserManagement',
      description: `Updated role for user ${user.email} from ${oldRole} to ${role}`,
      req,
    });

    return user;
  }

  async createAdmin(adminId, fullName, email, password, permissions, req) {
    if (!password || password.length < 8) {
      throw new AppError('Password must be at least 8 characters long', 400);
    }

    const existingUser = await superAdminRepository.findUserByEmail(email);
    if (existingUser) throw new AppError('Email already in use', 400);

    const admin = await superAdminRepository.createUser({
      fullName,
      email,
      password,
      role: 'ADMIN',
      permissions: permissions || [],
      isVerified: true,
    });

    await logActivity({
      userId: adminId,
      role: req.user.role,
      action: 'ADMIN_CREATED',
      module: 'AdminManagement',
      description: `Created new admin with email ${email}`,
      req,
    });

    admin.password = undefined;
    return admin;
  }

  async getActivities() {
    return await superAdminRepository.getActivities();
  }

  async requestLogDeletion(days = 90) {
    const numDays = Math.max(1, Number(days) || 90);
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - numDays);
    const count = await superAdminRepository.countOldLogs(dateLimit);
    return { count, dateLimit, days: numDays };
  }

  async executeLogDeletion(adminId, dateLimit, req) {
    if (!dateLimit) throw new AppError('Date limit is required to delete logs', 400);
    const parsedDate = new Date(dateLimit);
    if (isNaN(parsedDate.getTime())) {
      throw new AppError('Invalid date limit provided', 400);
    }
    const result = await superAdminRepository.deleteOldLogs(parsedDate);

    await logActivity({
      userId: adminId,
      role: req.user.role,
      action: 'LOGS_DELETED',
      module: 'SystemSettings',
      description: `Deleted ${result.deletedCount} logs older than ${parsedDate}`,
      req,
    });

    return result.deletedCount;
  }

  async getSystemHealth() {
    const cpus = os.cpus();
    const memoryUsage = process.memoryUsage();

    return {
      uptime: process.uptime(),
      dbState: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        appAllocated: memoryUsage.rss,
      },
      cpu: {
        cores: cpus.length,
        model: cpus[0].model,
      },
    };
  }

  // Phase 8: cache dashboard stats for 2 min — aggregation is expensive
  async getDashboardStats() {
    return await cacheAside(
      'superadmin:dashboard:stats',
      async () => {
        const totalUsers   = await superAdminRepository.countUsers({ role: 'USER' });
        const totalAdmins  = await superAdminRepository.countUsers({ role: 'ADMIN' });
        const yesterday    = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);
        const newUsersToday = await superAdminRepository.countUsers({ createdAt: { $gt: yesterday }, role: 'USER' });
        return { totalUsers, totalAdmins, newUsersToday, activeSessions: Math.floor(Math.random() * 50) + 10 };
      },
      { ttl: 120 } // 2-minute TTL for admin stats
    );
  }
}

export default new SuperAdminService();

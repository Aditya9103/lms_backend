import os from 'os';
import mongoose from 'mongoose';
import superAdminRepository from './superAdmin.repository.js';
import AppError from '../../core/utils/AppError.js';
import { logActivity } from '../../core/utils/activityLogger.js';

class SuperAdminService {
  async getAllUsersAndAdmins() {
    return await superAdminRepository.findAllUsersAndAdmins();
  }

  async updateRole(adminId, targetUserId, role, permissions, req) {
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
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);
    const count = await superAdminRepository.countOldLogs(dateLimit);
    return { count, dateLimit, days };
  }

  async executeLogDeletion(adminId, dateLimit, req) {
    if (!dateLimit) throw new AppError('Date limit is required to delete logs', 400);
    const parsedDate = new Date(dateLimit);
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

  async getDashboardStats() {
    const totalUsers = await superAdminRepository.countUsers({ role: 'USER' });
    const totalAdmins = await superAdminRepository.countUsers({ role: 'ADMIN' });

    const yesterday = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);
    const newUsersToday = await superAdminRepository.countUsers({ createdAt: { $gt: yesterday }, role: 'USER' });

    return {
      totalUsers,
      totalAdmins,
      newUsersToday,
      activeSessions: Math.floor(Math.random() * 50) + 10,
    };
  }
}

export default new SuperAdminService();

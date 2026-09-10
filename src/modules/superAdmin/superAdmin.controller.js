import asyncHandler from '../../core/middlewares/asyncHandler.middleware.js';
import superAdminService from './superAdmin.service.js';
import AppError from '../../core/utils/AppError.js';
import { sendSuccess } from '../../core/utils/apiResponse.js';

export const getAllUsersAndAdmins = asyncHandler(async (_req, res) => {
  const users = await superAdminService.getAllUsersAndAdmins();
  return sendSuccess(res, { users }, 200);
});

export const updateRole = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role, permissions } = req.body;

  const user = await superAdminService.updateRole(req.user.id, id, role, permissions, req);
  return sendSuccess(res, { user }, 200, 'User role updated successfully');
});

export const createAdmin = asyncHandler(async (req, res, next) => {
  const { fullName, email, password, permissions } = req.body;
  if (!fullName || !email || !password) {
    return next(new AppError('Full name, email, and password are required', 400));
  }

  const admin = await superAdminService.createAdmin(req.user.id, fullName, email, password, permissions, req);
  return sendSuccess(res, { admin }, 201, 'Admin created successfully');
});

export const getActivities = asyncHandler(async (_req, res) => {
  const logs = await superAdminService.getActivities();
  return sendSuccess(res, { logs }, 200);
});

export const requestLogDeletion = asyncHandler(async (req, res) => {
  const { days } = req.body;
  const data = await superAdminService.requestLogDeletion(days);
  return sendSuccess(
    res,
    data,
    200,
    `Found ${data.count} logs older than ${data.days || 90} days ready for deletion.`
  );
});

export const executeLogDeletion = asyncHandler(async (req, res) => {
  const { dateLimit } = req.body;
  const count = await superAdminService.executeLogDeletion(req.user.id, dateLimit, req);
  return sendSuccess(res, { deletedCount: count }, 200, `Successfully deleted ${count} logs.`);
});

export const getSystemHealth = asyncHandler(async (_req, res) => {
  const health = await superAdminService.getSystemHealth();
  return sendSuccess(res, { health }, 200);
});

export const getDashboardStats = asyncHandler(async (_req, res) => {
  const stats = await superAdminService.getDashboardStats();
  return sendSuccess(res, { stats }, 200);
});

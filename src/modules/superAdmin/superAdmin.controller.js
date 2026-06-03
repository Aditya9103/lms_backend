import asyncHandler from '../../core/middlewares/asyncHandler.middleware.js';
import superAdminService from './superAdmin.service.js';
import AppError from '../../core/utils/AppError.js';

export const getAllUsersAndAdmins = asyncHandler(async (req, res, next) => {
  try {
    const users = await superAdminService.getAllUsersAndAdmins();
    res.status(200).json({ success: true, users });
  } catch (error) {
    return next(error);
  }
});

export const updateRole = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { role, permissions } = req.body;

  try {
    const user = await superAdminService.updateRole(req.user.id, id, role, permissions, req);
    res.status(200).json({
      success: true,
      message: 'User role updated successfully',
      user,
    });
  } catch (error) {
    return next(error);
  }
});

export const createAdmin = asyncHandler(async (req, res, next) => {
  const { fullName, email, password, permissions } = req.body;
  if (!fullName || !email || !password) {
    return next(new AppError('Full name, email, and password are required', 400));
  }

  try {
    const admin = await superAdminService.createAdmin(req.user.id, fullName, email, password, permissions, req);
    res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      admin,
    });
  } catch (error) {
    return next(error);
  }
});

export const getActivities = asyncHandler(async (req, res, next) => {
  try {
    const logs = await superAdminService.getActivities();
    res.status(200).json({ success: true, logs });
  } catch (error) {
    return next(error);
  }
});

export const requestLogDeletion = asyncHandler(async (req, res, next) => {
  const { days } = req.body;
  try {
    const data = await superAdminService.requestLogDeletion(days);
    res.status(200).json({
      success: true,
      message: `Found ${data.count} logs older than ${data.days || 90} days ready for deletion.`,
      ...data,
    });
  } catch (error) {
    return next(error);
  }
});

export const executeLogDeletion = asyncHandler(async (req, res, next) => {
  const { dateLimit } = req.body;
  try {
    const count = await superAdminService.executeLogDeletion(req.user.id, dateLimit, req);
    res.status(200).json({
      success: true,
      message: `Successfully deleted ${count} logs.`,
    });
  } catch (error) {
    return next(error);
  }
});

export const getSystemHealth = asyncHandler(async (req, res, next) => {
  try {
    const health = await superAdminService.getSystemHealth();
    res.status(200).json({ success: true, health });
  } catch (error) {
    return next(error);
  }
});

export const getDashboardStats = asyncHandler(async (req, res, next) => {
  try {
    const stats = await superAdminService.getDashboardStats();
    res.status(200).json({ success: true, stats });
  } catch (error) {
    return next(error);
  }
});

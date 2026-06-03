import asyncHandler from '../../core/middlewares/asyncHandler.middleware.js';
import dashboardService from './dashboard.service.js';

export const getLearnerDashboardData = asyncHandler(async (req, res, next) => {
  try {
    const data = await dashboardService.getLearnerDashboardData(req.user.id);
    res.status(200).json({
      success: true,
      message: 'Learner dashboard data fetched successfully',
      data,
    });
  } catch (error) {
    return next(error);
  }
});

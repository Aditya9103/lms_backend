import { Router } from 'express';
import { getLearnerDashboardData } from './dashboard.controller.js';
import { isLoggedIn } from '../../core/middlewares/auth.middleware.js';

const router = Router();

router.get('/learner', isLoggedIn, getLearnerDashboardData);

export default router;

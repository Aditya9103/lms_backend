import { Router } from 'express';
import { getLearnerDashboardData } from '../controllers/dashboard.controller.js';
import { isLoggedIn } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/learner', isLoggedIn, getLearnerDashboardData);

export default router;

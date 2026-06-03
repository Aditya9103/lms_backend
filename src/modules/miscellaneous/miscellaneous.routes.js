import { Router } from 'express';
import {
  contactUs,
  userStats,
} from './miscellaneous.controller.js';
import { authorizeRoles, isLoggedIn } from '../../core/middlewares/auth.middleware.js';

const router = Router();

// {{URL}}/api/v1/
router.route('/contact').post(contactUs);
router
  .route('/admin/stats/users')
  .get(isLoggedIn, authorizeRoles('ADMIN'), userStats);

export default router;

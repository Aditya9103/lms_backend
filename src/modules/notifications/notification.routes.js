import { Router } from 'express';
import { getMyNotifications, markRead, markAllRead } from './notification.controller.js';
import { isLoggedIn } from '../../core/middlewares/auth.middleware.js';

const router = Router();

router.use(isLoggedIn);

router.get('/', getMyNotifications);
router.patch('/read-all', markAllRead);
router.patch('/:id/read', markRead);

export default router;

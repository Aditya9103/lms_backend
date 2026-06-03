import { Router } from 'express';
import { addQuestion, addReply, getDiscussions } from './discussion.controller.js';
import { isLoggedIn } from '../../core/middlewares/auth.middleware.js';

const router = Router();

router.post('/question', isLoggedIn, addQuestion);
router.post('/reply', isLoggedIn, addReply);
router.get('/:courseId/:lectureId', isLoggedIn, getDiscussions);

export default router;

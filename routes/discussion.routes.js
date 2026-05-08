import { Router } from 'express';
import { addQuestion, addReply, getDiscussions } from '../controllers/discussion.controller.js';
import { isLoggedIn } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/question', isLoggedIn, addQuestion);
router.post('/reply', isLoggedIn, addReply);
router.get('/:courseId/:lectureId', isLoggedIn, getDiscussions);

export default router;

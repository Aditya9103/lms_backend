import { Router } from 'express';
import {
  addQuestion,
  addReply,
  getDiscussions,
  upvoteQuestion,
  markAnswered,
  flagQuestion,
  hideDiscussion,
  unhideDiscussion,
} from './discussion.controller.js';
import { isLoggedIn, authorizeRoles } from '../../core/middlewares/auth.middleware.js';

const router = Router();

// ── Phase 6 ──────────────────────────────────────────────────────────────────
router.post('/question',            isLoggedIn, addQuestion);
router.post('/reply',               isLoggedIn, addReply);
router.get('/:courseId/:lectureId', isLoggedIn, getDiscussions);
router.post('/:discussionId/upvote',  isLoggedIn, upvoteQuestion);
router.patch('/:discussionId/resolve', isLoggedIn, authorizeRoles('ADMIN', 'SUPER_ADMIN', 'INSTRUCTOR'), markAnswered);

// ── Phase 9: moderation ───────────────────────────────────────────────────────
router.patch('/:discussionId/flag',   isLoggedIn, flagQuestion);                                       // any logged-in user can report
router.patch('/:discussionId/hide',   isLoggedIn, authorizeRoles('ADMIN', 'SUPER_ADMIN', 'INSTRUCTOR'), hideDiscussion);
router.patch('/:discussionId/unhide', isLoggedIn, authorizeRoles('ADMIN', 'SUPER_ADMIN', 'INSTRUCTOR'), unhideDiscussion);

export default router;

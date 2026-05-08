import { Router } from 'express';
import { createBlog, getAllBlogs, getBlogById, deleteBlog } from '../controllers/blog.controller.js';
import { isLoggedIn, authorizeRoles } from '../middlewares/auth.middleware.js';
import upload from '../middlewares/multer.middleware.js';

const router = Router();

router.get('/', getAllBlogs);
router.get('/:id', getBlogById);

// Admin only routes
router.post('/', isLoggedIn, authorizeRoles('ADMIN'), upload.single('thumbnail'), createBlog);
router.delete('/:id', isLoggedIn, authorizeRoles('ADMIN'), deleteBlog);

export default router;

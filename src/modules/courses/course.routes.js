import { Router } from 'express';
import {
  addLectureToCourseById,
  createCourse,
  deleteCourseById,
  getAllCourses,
  getLecturesByCourseId,
  removeLectureFromCourse,
  updateCourseById,
  addSection,
  addQuizToSection,
  addAssignmentToSection
} from './course.controller.js';
import {
  authorizeRoles,
  authorizeSubscribers,
  isLoggedIn,
} from '../../core/middlewares/auth.middleware.js';
import upload from '../../core/middlewares/multer.middleware.js';

const router = Router();

router
  .route('/')
  .get(getAllCourses)
  .post(
    isLoggedIn,
    authorizeRoles('ADMIN'),
    upload.single('thumbnail'),
    createCourse
  )
  .delete(isLoggedIn, authorizeRoles('ADMIN'), removeLectureFromCourse);

router
  .route('/:id')
  .get(isLoggedIn, authorizeSubscribers, getLecturesByCourseId)
  .post(
    isLoggedIn,
    authorizeRoles('ADMIN'),
    upload.single('lecture'),
    addLectureToCourseById
  )
  .delete(isLoggedIn, authorizeRoles('ADMIN'), deleteCourseById)
  .put(isLoggedIn, authorizeRoles('ADMIN'), updateCourseById);

router
  .route('/:id/sections')
  .post(isLoggedIn, authorizeRoles('ADMIN'), addSection);

router
  .route('/:id/sections/:sectionId/quizzes')
  .post(isLoggedIn, authorizeRoles('ADMIN'), addQuizToSection);

router
  .route('/:id/sections/:sectionId/assignments')
  .post(isLoggedIn, authorizeRoles('ADMIN'), upload.single('assignmentFile'), addAssignmentToSection);

export default router;

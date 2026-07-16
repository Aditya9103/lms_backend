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
  addLectureToSection,
  addQuizToSection,
  addAssignmentToSection,
  getCourseSubmissions,
  getCloudinarySignature,
} from './course.controller.js';
import {
  authorizeRoles,
  authorizeSubscribers,
  isLoggedIn,
} from '../../core/middlewares/auth.middleware.js';
import upload from '../../core/middlewares/multer.middleware.js';
import validate from '../../core/middlewares/validate.middleware.js';
import {
  CreateCourseDto,
  UpdateCourseDto,
  AddSectionDto,
  AddLectureDto,
  AddQuizDto,
  AddAssignmentDto,
  CourseListQueryDto,
} from './dto/course.dto.js';

const router = Router();

/**
 * @openapi
 * /courses/cloudinary-signature:
 *   get:
 *     tags: [Courses]
 *     summary: Get a signed Cloudinary upload signature (Admin only)
 *     security: [bearerAuth: []]
 */
router.get('/cloudinary-signature', isLoggedIn, authorizeRoles('ADMIN'), getCloudinarySignature);

/**
 * @openapi
 * /courses:
 *   get:
 *     tags: [Courses]
 *     summary: List all published courses (paginated + filterable)
 *   post:
 *     tags: [Courses]
 *     summary: Create a new course (Admin only)
 *     security: [bearerAuth: []]
 */
router
  .route('/')
  .get(validate(CourseListQueryDto, 'query'), getAllCourses)
  .post(
    isLoggedIn,
    authorizeRoles('ADMIN'),
    upload.single('thumbnail'),
    validate(CreateCourseDto),
    createCourse
  )
  .delete(isLoggedIn, authorizeRoles('ADMIN'), removeLectureFromCourse);

/**
 * @openapi
 * /courses/{id}:
 *   get:
 *     tags: [Courses]
 *     summary: Get course with lectures (enrolled students / admins only)
 *     security: [bearerAuth: []]
 *   put:
 *     tags: [Courses]
 *     summary: Update a course (Admin only)
 *     security: [bearerAuth: []]
 *   delete:
 *     tags: [Courses]
 *     summary: Soft-delete a course (Admin only)
 *     security: [bearerAuth: []]
 */
router
  .route('/:id')
  .get(isLoggedIn, authorizeSubscribers, getLecturesByCourseId)
  .post(
    isLoggedIn,
    authorizeRoles('ADMIN'),
    upload.single('lecture'),
    validate(AddLectureDto),
    addLectureToCourseById
  )
  .delete(isLoggedIn, authorizeRoles('ADMIN'), deleteCourseById)
  .put(isLoggedIn, authorizeRoles('ADMIN'), validate(UpdateCourseDto), updateCourseById);

router
  .route('/:id/sections')
  .post(isLoggedIn, authorizeRoles('ADMIN'), validate(AddSectionDto), addSection);

router
  .route('/:id/sections/:sectionId/lectures')
  .post(isLoggedIn, authorizeRoles('ADMIN'), validate(AddLectureDto), addLectureToSection);

router
  .route('/:id/sections/:sectionId/quizzes')
  .post(isLoggedIn, authorizeRoles('ADMIN'), validate(AddQuizDto), addQuizToSection);

router
  .route('/:id/sections/:sectionId/assignments')
  .post(
    isLoggedIn,
    authorizeRoles('ADMIN'),
    upload.single('assignmentFile'),
    validate(AddAssignmentDto),
    addAssignmentToSection
  );

router
  .route('/:id/submissions')
  .get(isLoggedIn, authorizeRoles('ADMIN'), getCourseSubmissions);

export default router;

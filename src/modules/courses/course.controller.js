import asyncHandler from '../../core/middlewares/asyncHandler.middleware.js';
import AppError from '../../core/utils/AppError.js';
import { sendSuccess } from '../../core/utils/apiResponse.js';
import courseService from './course.service.js';
import cloudinary from 'cloudinary';

export const getCloudinarySignature = asyncHandler(async (req, res) => {
  const timestamp = Math.round(new Date().getTime() / 1000);
  const signature = cloudinary.v2.utils.api_sign_request(
    {
      timestamp,
      folder: 'lms_lectures',
    },
    process.env.CLOUDINARY_API_SECRET
  );

  return sendSuccess(
    res,
    {
      signature,
      timestamp,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
    },
    200
  );
});

export const getAllCourses = asyncHandler(async (_req, res) => {
  const courses = await courseService.getAllCourses();
  return sendSuccess(res, { courses }, 200, 'All courses');
});

export const createCourse = asyncHandler(async (req, res, next) => {
  const { title, description, category, createdBy } = req.body;
  if (!title || !description || !category || !createdBy) {
    return next(new AppError('All fields are required', 400));
  }

  const course = await courseService.createCourse({ title, description, category, createdBy }, req.file);
  return sendSuccess(res, { course }, 201, 'Course created successfully');
});

export const getLecturesByCourseId = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const lectures = await courseService.getLecturesByCourseId(id);
  return sendSuccess(res, { lectures }, 200, 'Course lectures fetched successfully');
});

export const addLectureToCourseById = asyncHandler(async (req, res, next) => {
  const { title, description } = req.body;
  const { id } = req.params;

  if (!title || !description) return next(new AppError('Title and Description are required', 400));

  const course = await courseService.addLectureToCourseById(id, title, description, req.file);
  return sendSuccess(res, { course }, 200, 'Course lecture added successfully');
});

export const removeLectureFromCourse = asyncHandler(async (req, res, next) => {
  const { courseId, lectureId } = req.query;
  if (!courseId) return next(new AppError('Course ID is required', 400));
  if (!lectureId) return next(new AppError('Lecture ID is required', 400));

  await courseService.removeLectureFromCourse(courseId, lectureId);
  return sendSuccess(res, null, 200, 'Course lecture removed successfully');
});

export const updateCourseById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const course = await courseService.updateCourseById(id, req.body);
  return sendSuccess(res, { course }, 200, 'Course updated successfully');
});

export const deleteCourseById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await courseService.deleteCourseById(id);
  return sendSuccess(res, null, 200, 'Course deleted successfully');
});

export const addSection = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { title } = req.body;
  if (!title) return next(new AppError('Section title is required', 400));

  const course = await courseService.addSection(id, title);
  return sendSuccess(res, { course }, 200, 'Section added');
});

export const addLectureToSection = asyncHandler(async (req, res, next) => {
  const { id, sectionId } = req.params;
  const { title, description, public_id, secure_url, cloudinaryPublicId, cloudinarySecureUrl } = req.body;

  if (!title || !description) {
    return next(new AppError('Title and description are required', 400));
  }
  const pid = public_id || cloudinaryPublicId;
  const url = secure_url || cloudinarySecureUrl;
  if (!pid || !url) {
    return next(new AppError('Video upload data is required', 400));
  }

  const course = await courseService.addLectureToSection(id, sectionId, title, description, {
    public_id: pid,
    secure_url: url,
  });
  return sendSuccess(res, { course }, 200, 'Lecture added to section');
});

export const addQuizToSection = asyncHandler(async (req, res, next) => {
  const { id, sectionId } = req.params;
  const { title, questions, dueDate } = req.body;

  if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
    return next(new AppError('Quiz title and at least 1 question are required', 400));
  }

  const course = await courseService.addQuizToSection(id, sectionId, { title, questions, dueDate });
  return sendSuccess(res, { course }, 200, 'Quiz added');
});

export const addAssignmentToSection = asyncHandler(async (req, res, next) => {
  const { id, sectionId } = req.params;
  const { title, description, dueDate } = req.body;

  if (!title) return next(new AppError('Assignment title is required', 400));

  const course = await courseService.addAssignmentToSection(id, sectionId, title, description, dueDate, req.file);
  return sendSuccess(res, { course }, 200, 'Assignment added');
});

export const getCourseSubmissions = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const submissions = await courseService.getCourseSubmissions(id);
  return sendSuccess(res, { submissions }, 200, 'Submissions fetched');
});

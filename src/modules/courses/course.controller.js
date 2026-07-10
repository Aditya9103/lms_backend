import asyncHandler from '../../core/middlewares/asyncHandler.middleware.js';
import AppError from '../../core/utils/AppError.js';
import courseService from './course.service.js';
import cloudinary from 'cloudinary';

export const getCloudinarySignature = asyncHandler(async (req, res, next) => {
  try {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const signature = cloudinary.v2.utils.api_sign_request(
      {
        timestamp,
        folder: 'lms_lectures',
      },
      process.env.CLOUDINARY_API_SECRET
    );

    res.status(200).json({
      success: true,
      signature,
      timestamp,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY
    });
  } catch (error) {
    return next(error);
  }
});

export const getAllCourses = asyncHandler(async (_req, res, next) => {
  try {
    const courses = await courseService.getAllCourses();
    res.status(200).json({ success: true, message: 'All courses', courses });
  } catch (error) {
    return next(error);
  }
});

export const createCourse = asyncHandler(async (req, res, next) => {
  const { title, description, category, createdBy } = req.body;
  if (!title || !description || !category || !createdBy) {
    return next(new AppError('All fields are required', 400));
  }

  try {
    const course = await courseService.createCourse({ title, description, category, createdBy }, req.file);
    res.status(201).json({ success: true, message: 'Course created successfully', course });
  } catch (error) {
    return next(error);
  }
});

export const getLecturesByCourseId = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  try {
    const lectures = await courseService.getLecturesByCourseId(id);
    res.status(200).json({ success: true, message: 'Course lectures fetched successfully', lectures });
  } catch (error) {
    return next(error);
  }
});

export const addLectureToCourseById = asyncHandler(async (req, res, next) => {
  const { title, description } = req.body;
  const { id } = req.params;

  if (!title || !description) return next(new AppError('Title and Description are required', 400));

  try {
    const course = await courseService.addLectureToCourseById(id, title, description, req.file);
    res.status(200).json({ success: true, message: 'Course lecture added successfully', course });
  } catch (error) {
    return next(error);
  }
});

export const removeLectureFromCourse = asyncHandler(async (req, res, next) => {
  const { courseId, lectureId } = req.query;
  if (!courseId) return next(new AppError('Course ID is required', 400));
  if (!lectureId) return next(new AppError('Lecture ID is required', 400));

  try {
    await courseService.removeLectureFromCourse(courseId, lectureId);
    res.status(200).json({ success: true, message: 'Course lecture removed successfully' });
  } catch (error) {
    return next(error);
  }
});

export const updateCourseById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  try {
    await courseService.updateCourseById(id, req.body);
    res.status(200).json({ success: true, message: 'Course updated successfully' });
  } catch (error) {
    return next(error);
  }
});

export const deleteCourseById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  try {
    await courseService.deleteCourseById(id);
    res.status(200).json({ success: true, message: 'Course deleted successfully' });
  } catch (error) {
    return next(error);
  }
});

export const addSection = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    if (!title) return next(new AppError('Section title is required', 400));
    
    const course = await courseService.addSection(id, title);
    res.status(200).json({ success: true, message: 'Section added', course });
  } catch (error) {
    return next(error);
  }
});

export const addLectureToSection = asyncHandler(async (req, res, next) => {
  try {
    const { id, sectionId } = req.params;
    const { title, description, public_id, secure_url } = req.body;

    if (!title || !description) {
      return next(new AppError('Title and description are required', 400));
    }
    if (!public_id || !secure_url) {
      return next(new AppError('Video upload data is required', 400));
    }

    const course = await courseService.addLectureToSection(id, sectionId, title, description, { public_id, secure_url });
    res.status(200).json({ success: true, message: 'Lecture added to section', course });
  } catch (error) {
    return next(error);
  }
});

export const addQuizToSection = asyncHandler(async (req, res, next) => {
  try {
    const { id, sectionId } = req.params;
    const { title, questions, dueDate } = req.body;
    
    if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
      return next(new AppError('Quiz title and at least 1 question are required', 400));
    }

    const course = await courseService.addQuizToSection(id, sectionId, { title, questions, dueDate });
    res.status(200).json({ success: true, message: 'Quiz added', course });
  } catch (error) {
    return next(error);
  }
});

export const addAssignmentToSection = asyncHandler(async (req, res, next) => {
  try {
    const { id, sectionId } = req.params;
    const { title, description, dueDate } = req.body;

    if (!title) return next(new AppError('Assignment title is required', 400));

    const course = await courseService.addAssignmentToSection(id, sectionId, title, description, dueDate, req.file);
    res.status(200).json({ success: true, message: 'Assignment added', course });
  } catch (error) {
    return next(error);
  }
});

export const getCourseSubmissions = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const submissions = await courseService.getCourseSubmissions(id);
    res.status(200).json({ success: true, message: 'Submissions fetched', submissions });
  } catch (error) {
    return next(error);
  }
});

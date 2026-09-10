import fs from 'fs/promises';
import path from 'path';
import cloudinary from 'cloudinary';
import courseRepository from './course.repository.js';
import User from '../users/user.model.js';
import AppError from '../../core/utils/AppError.js';
import { cacheAside, cacheInvalidate, cacheInvalidateKey } from '../../core/cache/cacheAside.js';  // Phase 8

const CATALOG_KEY  = 'courses:catalog';
const CATALOG_TTL  = 300; // 5 minutes — mirrors RTK Query keepUnusedDataFor
const detailKey    = (id) => `courses:detail:${id}`;

class CourseService {
  // Phase 8: cache-aside — catalog TTL 5 min
  async getAllCourses() {
    return await cacheAside(
      CATALOG_KEY,
      () => courseRepository.findAll(),
      { ttl: CATALOG_TTL }
    );
  }

  async createCourse(courseData, file) {
    if (!courseData.title || typeof courseData.title !== 'string') {
      throw new AppError('Course title is required', 400);
    }
    const trimmedTitle = courseData.title.trim();

    // Guard against duplicate course creation (e.g. double tap or rapid submissions)
    const escapedTitle = trimmedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existing = await courseRepository.findOne({
      title: { $regex: new RegExp(`^${escapedTitle}$`, 'i') },
      softDeleted: { $ne: true },
    });
    if (existing) {
      throw new AppError('A course with this title already exists. Please choose a unique title.', 409);
    }

    const course = await courseRepository.create({
      ...courseData,
      title: trimmedTitle,
    });
    if (!course) throw new AppError('Course could not be created, please try again', 400);

    if (file) {
      try {
        const result = await cloudinary.v2.uploader.upload(file.path, {
          folder: 'lms',
        });
        if (result) {
          course.thumbnail.public_id = result.public_id;
          course.thumbnail.secure_url = result.secure_url;
        }
      } catch (error) {
        throw new AppError(error.message || 'File not uploaded, please try again', 400);
      } finally {
        try {
          if (file.filename) await fs.rm(`uploads/${file.filename}`, { force: true });
        } catch (_) {
          try { await fs.unlink(file.path); } catch (_) {}
        }
      }
    }
    await courseRepository.save(course);
    // Phase 8: new course invalidates the catalog cache
    await cacheInvalidateKey(CATALOG_KEY);
    return course;
  }

  async getLecturesByCourseId(courseId) {
    const course = await courseRepository.findById(courseId);
    if (!course) throw new AppError('Invalid course id or course not found.', 404);

    let allLectures = course.lectures ? course.lectures.map(l => ({...l.toObject(), sectionTitle: 'General'})) : [];
    
    if (course.sections && course.sections.length > 0) {
      course.sections.forEach(section => {
        if (section.lectures) {
          const sectionLecs = section.lectures.map(l => ({...l.toObject(), sectionTitle: section.title}));
          allLectures = [...allLectures, ...sectionLecs];
        }
      });
    }

    return allLectures;
  }

  async addLectureToCourseById(courseId, title, description, file) {
    const course = await courseRepository.findById(courseId);
    if (!course) throw new AppError('Invalid course id or course not found.', 400);

    let lectureData = {};

    if (file) {
      try {
        const result = await cloudinary.v2.uploader.upload(file.path, {
          folder: 'lms',
          chunk_size: 50000000,
          resource_type: 'video',
        });
        if (result) {
          lectureData.public_id = result.public_id;
          lectureData.secure_url = result.secure_url;
        }
      } catch (error) {
        throw new AppError(error.message || 'File not uploaded, please try again', 400);
      } finally {
        try {
          if (file.filename) await fs.rm(`uploads/${file.filename}`, { force: true });
        } catch (_) {
          try { await fs.unlink(file.path); } catch (_) {}
        }
      }
    }

    course.lectures.push({ title, description, lecture: lectureData });
    course.numberOfLectures = course.lectures.length;
    await courseRepository.save(course);
    return course;
  }

  async removeLectureFromCourse(courseId, lectureId) {
    const course = await courseRepository.findById(courseId);
    if (!course) throw new AppError('Invalid ID or Course does not exist.', 404);

    const lectureIndex = course.lectures.findIndex(
      (lecture) => lecture._id.toString() === lectureId.toString()
    );

    if (lectureIndex === -1) throw new AppError('Lecture does not exist.', 404);

    if (course.lectures[lectureIndex]?.lecture?.public_id) {
      try {
        await cloudinary.v2.uploader.destroy(
          course.lectures[lectureIndex].lecture.public_id,
          { resource_type: 'video' }
        );
      } catch (_) {}
    }

    course.lectures.splice(lectureIndex, 1);
    course.numberOfLectures = course.lectures.length;
    await courseRepository.save(course);
  }

  async updateCourseById(courseId, updateData) {
    const course = await courseRepository.updateById(courseId, updateData);
    if (!course) throw new AppError('Invalid course id or course not found.', 400);
    // Phase 8: invalidate both catalog and detail caches
    await Promise.all([
      cacheInvalidateKey(CATALOG_KEY),
      cacheInvalidateKey(detailKey(courseId)),
    ]);
    return course;
  }

  async deleteCourseById(courseId) {
    const course = await courseRepository.deleteById(courseId);
    if (!course) throw new AppError('Course with given id does not exist.', 404);
    // Phase 8: deleted course invalidates both caches
    await Promise.all([
      cacheInvalidateKey(CATALOG_KEY),
      cacheInvalidateKey(detailKey(courseId)),
    ]);
  }

  async addSection(courseId, title) {
    const course = await courseRepository.findById(courseId);
    if (!course) throw new AppError('Course not found.', 404);
    
    course.sections.push({ title, lectures: [], quizzes: [], assignments: [] });
    await courseRepository.save(course);
    return course;
  }

  async addLectureToSection(courseId, sectionId, title, description, videoData) {
    const course = await courseRepository.findById(courseId);
    if (!course) throw new AppError('Course does not exist', 404);

    const section = course.sections.id(sectionId);
    if (!section) throw new AppError('Section not found.', 404);

    let lectureData = {
      public_id: videoData.public_id,
      secure_url: videoData.secure_url
    };

    section.lectures.push({ title, description, lecture: lectureData });
    course.numberOfLectures = (course.numberOfLectures || 0) + 1;

    await courseRepository.save(course);
    return course;
  }

  async addQuizToSection(courseId, sectionId, quizData) {
    const course = await courseRepository.findById(courseId);
    if (!course) throw new AppError('Course not found.', 404);

    const section = course.sections.id(sectionId);
    if (!section) throw new AppError('Section not found.', 404);

    section.quizzes.push(quizData);
    await courseRepository.save(course);
    return course;
  }

  async addAssignmentToSection(courseId, sectionId, title, description, dueDate, file) {
    const course = await courseRepository.findById(courseId);
    if (!course) throw new AppError('Course not found.', 404);

    const section = course.sections.id(sectionId);
    if (!section) throw new AppError('Section not found.', 404);

    let fileData = null;
    if (file) {
      try {
        const result = await cloudinary.v2.uploader.upload(file.path, { 
          folder: 'lms_assignments',
          resource_type: 'auto'
        });
        if (result) {
          fileData = { public_id: result.public_id, secure_url: result.secure_url };
        }
      } catch (error) {
        console.error("Cloudinary upload error:", error);
        throw new AppError(error.message || 'File upload failed', 500);
      } finally {
        try {
          if (file.filename) await fs.rm(`uploads/${file.filename}`, { force: true });
        } catch (_) {
          try { await fs.unlink(file.path); } catch (_) {}
        }
      }
    }

    section.assignments.push({ title, description, dueDate, file: fileData });
    await courseRepository.save(course);
    return course;
  }

  async getCourseSubmissions(courseId) {
    const course = await courseRepository.findById(courseId);
    if (!course) throw new AppError('Course not found.', 404);

    const usersWithProgress = await User.find({
      'progress.courseId': courseId
    }).select('fullName email avatar progress');

    const submissions = usersWithProgress.map(user => {
      const courseProgress = user.progress.find(p => p.courseId.toString() === courseId);
      return {
        userId: user._id,
        fullName: user.fullName,
        email: user.email,
        avatar: user.avatar,
        completedQuizzes: courseProgress.completedQuizzes || [],
        completedAssignments: courseProgress.completedAssignments || []
      };
    });

    return submissions;
  }
}

export default new CourseService();

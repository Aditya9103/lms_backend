import fs from 'fs/promises';
import path from 'path';
import cloudinary from 'cloudinary';
import courseRepository from './course.repository.js';
import AppError from '../../core/utils/AppError.js';

class CourseService {
  async getAllCourses() {
    return await courseRepository.findAll();
  }

  async createCourse(courseData, file) {
    const course = await courseRepository.create(courseData);
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
        await fs.rm(`uploads/${file.filename}`);
      } catch (error) {
        for (const f of await fs.readdir('uploads/')) {
          await fs.unlink(path.join('uploads/', f));
        }
        throw new AppError(JSON.stringify(error) || 'File not uploaded, please try again', 400);
      }
    }
    await courseRepository.save(course);
    return course;
  }

  async getLecturesByCourseId(courseId) {
    const course = await courseRepository.findById(courseId);
    if (!course) throw new AppError('Invalid course id or course not found.', 404);
    return course.lectures;
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
        await fs.rm(`uploads/${file.filename}`);
      } catch (error) {
        for (const f of await fs.readdir('uploads/')) {
          await fs.unlink(path.join('uploads/', f));
        }
        throw new AppError(JSON.stringify(error) || 'File not uploaded, please try again', 400);
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

    await cloudinary.v2.uploader.destroy(
      course.lectures[lectureIndex].lecture.public_id,
      { resource_type: 'video' }
    );

    course.lectures.splice(lectureIndex, 1);
    course.numberOfLectures = course.lectures.length;
    await courseRepository.save(course);
  }

  async updateCourseById(courseId, updateData) {
    const course = await courseRepository.updateById(courseId, updateData);
    if (!course) throw new AppError('Invalid course id or course not found.', 400);
    return course;
  }

  async deleteCourseById(courseId) {
    const course = await courseRepository.deleteById(courseId);
    if (!course) throw new AppError('Course with given id does not exist.', 404);
  }

  async addSection(courseId, title) {
    const course = await courseRepository.findById(courseId);
    if (!course) throw new AppError('Course not found.', 404);
    
    course.sections.push({ title, lectures: [], quizzes: [], assignments: [] });
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
          resource_type: 'raw'
        });
        if (result) {
          fileData = { public_id: result.public_id, secure_url: result.secure_url };
        }
        await fs.rm(`uploads/${file.filename}`);
      } catch (error) {
        console.error("Cloudinary upload error:", error);
        for (const f of await fs.readdir('uploads/')) {
          await fs.unlink(path.join('uploads/', f));
        }
        throw new AppError('File upload failed', 500);
      }
    }

    section.assignments.push({ title, description, dueDate, file: fileData });
    await courseRepository.save(course);
    return course;
  }
}

export default new CourseService();

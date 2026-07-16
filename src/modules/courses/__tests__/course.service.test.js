/**
 * course.service.test.js — Unit tests for CourseService
 *
 * Tests core course lifecycle: creation, lecture/section management, deletion.
 * Cloudinary is mocked — no real uploads during tests.
 */

jest.mock('../../../core/utils/cloudinary.js', () => ({
  uploadToCloudinary: jest.fn().mockResolvedValue({
    public_id: 'test/lecture_video',
    secure_url: 'https://res.cloudinary.com/test/video/upload/lecture.mp4',
  }),
  deleteFromCloudinary: jest.fn().mockResolvedValue({ result: 'ok' }),
}));

import courseService from '../course.service.js';
import Course from '../course.model.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
const makeCourse = (overrides = {}) => ({
  title: 'Test Course',
  description: 'A test course description',
  category: 'Technology',
  createdBy: 'Test Instructor',
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CourseService.getAllCourses', () => {
  it('returns empty array when no courses exist', async () => {
    const courses = await courseService.getAllCourses();
    expect(Array.isArray(courses)).toBe(true);
    expect(courses).toHaveLength(0);
  });

  it('returns all courses after creation', async () => {
    await Course.create([makeCourse(), makeCourse({ title: 'Course 2' })]);
    const courses = await courseService.getAllCourses();
    expect(courses.length).toBeGreaterThanOrEqual(2);
  });
});

describe('CourseService.createCourse', () => {
  it('creates a course with required fields', async () => {
    const data = makeCourse();
    const course = await courseService.createCourse(data, null);

    expect(course).toHaveProperty('_id');
    expect(course.title).toBe(data.title);
    expect(course.category).toBe(data.category);
  });

  it('uploads thumbnail when file is provided', async () => {
    const { uploadToCloudinary } = require('../../../core/utils/cloudinary.js');
    const mockFile = { path: '/tmp/test.jpg' };

    await courseService.createCourse(makeCourse(), mockFile);
    expect(uploadToCloudinary).toHaveBeenCalled();
  });
});

describe('CourseService.addSection', () => {
  it('adds a section to an existing course', async () => {
    const course = await Course.create(makeCourse());
    const updated = await courseService.addSection(course._id, 'Section 1');

    expect(updated.sections).toHaveLength(1);
    expect(updated.sections[0].title).toBe('Section 1');
  });

  it('throws for unknown course ID', async () => {
    const fakeId = new (require('mongoose').Types.ObjectId)();
    await expect(
      courseService.addSection(fakeId, 'Section 1')
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('CourseService.deleteCourseById', () => {
  it('removes the course from the DB', async () => {
    const course = await Course.create(makeCourse());
    await courseService.deleteCourseById(course._id);

    const found = await Course.findById(course._id);
    expect(found).toBeNull();
  });

  it('throws for unknown course ID', async () => {
    const fakeId = new (require('mongoose').Types.ObjectId)();
    await expect(
      courseService.deleteCourseById(fakeId)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('CourseService.getLecturesByCourseId', () => {
  it('returns the course with its lectures', async () => {
    const course = await Course.create({
      ...makeCourse(),
      lectures: [{ title: 'Lecture 1', public_id: 'pub1', secure_url: 'url1' }],
    });

    const result = await courseService.getLecturesByCourseId(course._id);
    expect(result.lectures).toHaveLength(1);
    expect(result.lectures[0].title).toBe('Lecture 1');
  });
});

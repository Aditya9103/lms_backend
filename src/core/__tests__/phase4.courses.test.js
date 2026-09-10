/**
 * phase4.courses.test.js — Exhaustive Phase 4 Course Lifecycle & Video Content Test Suite
 *
 * Scope:
 *  - 4.1 Course Catalog (GET /api/v1/courses — search, category, standard envelope)
 *  - 4.2 Course Creation & Validation (POST /api/v1/courses — role protection, Zod validation)
 *  - 4.3 Course Content Access & Subscription Guard (GET /api/v1/courses/:id — 403 for unsubscribed, 200 for subscribed/admin)
 *  - 4.4 Course Mutation & Lifecycle (PUT /api/v1/courses/:id, DELETE /api/v1/courses/:id)
 *  - 4.5 Curriculum Builder: Sections, Lectures, Quizzes, Assignments
 *  - 4.6 Course Submissions & Admin Media Signatures
 */
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../app.js';
import User from '../../modules/users/user.model.js';
import Course from '../../modules/courses/course.model.js';

describe('=== Phase 4: Course Lifecycle, Video Transcoding & DRM ===', () => {
  const testPassword = 'Password123!';

  const createUser = async (overrides = {}) => {
    const email = `course_test_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
    const user = await User.create({
      fullName: 'Course Tester',
      email,
      password: testPassword,
      isVerified: true,
      role: 'USER',
      ...overrides,
    });
    const token = await user.generateJWTToken();
    return { user, email, token };
  };

  const createCourse = async (overrides = {}) => {
    return await Course.create({
      title: 'Fullstack Web Development Masterclass',
      description: 'Comprehensive curriculum covering Node.js, React, and DevOps from scratch.',
      category: 'Development',
      createdBy: 'Instructor Pro',
      thumbnail: {
        public_id: 'sample_thumb',
        secure_url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      },
      ...overrides,
    });
  };

  // ─── 4.1 Course Catalog ───────────────────────────────────────────────────────
  describe('4.1 Course Catalog (GET /api/v1/courses)', () => {
    it('returns courses list wrapped in standard envelope { success: true, data: { courses } }', async () => {
      await createCourse({ title: 'Course Alpha Bootcamp 2026' });
      await createCourse({ title: 'Course Beta Python Specialization' });

      const res = await request(app).get('/api/v1/courses');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('courses');
      expect(Array.isArray(res.body.data.courses)).toBe(true);
      expect(res.body.data.courses.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── 4.2 Course Creation & RBAC ──────────────────────────────────────────────
  describe('4.2 Course Creation (POST /api/v1/courses)', () => {
    it('blocks regular USER role with 403 Forbidden', async () => {
      const { token } = await createUser({ role: 'USER' });

      const res = await request(app)
        .post('/api/v1/courses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Unauthorized Course Attempt',
          description: 'This request should be blocked by role authorization.',
          category: 'Design',
          createdBy: 'Rogue Student',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('rejects short title or short description with 400 validation error', async () => {
      const { token } = await createUser({ role: 'ADMIN' });

      const res = await request(app)
        .post('/api/v1/courses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Short', // min 8
          description: 'Too short', // min 20
          category: 'Design',
          createdBy: 'Admin',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('allows ADMIN to create course and returns 201 with course entity', async () => {
      const { token } = await createUser({ role: 'ADMIN' });

      const res = await request(app)
        .post('/api/v1/courses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Architecting Distributed Systems',
          description: 'Deep dive into event-driven architectures, microservices, and consensus protocols.',
          category: 'Architecture',
          createdBy: 'Senior Architect',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.course).toBeDefined();
      expect(res.body.data.course.title).toBe('Architecting Distributed Systems');
    });
  });

  // ─── 4.3 Content Access & Subscription Guards ────────────────────────────────
  describe('4.3 Content Access & Subscription Guards (GET /api/v1/courses/:id)', () => {
    it('blocks unsubscribed student from accessing course lectures with 403', async () => {
      const { token } = await createUser({ role: 'USER', subscription: { status: 'inactive' } });
      const course = await createCourse();

      const res = await request(app)
        .get(`/api/v1/courses/${course._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/subscribe/i);
    });

    it('allows subscribed student to view course lectures', async () => {
      const { token } = await createUser({ role: 'USER', subscription: { status: 'active' } });
      const course = await createCourse();

      const res = await request(app)
        .get(`/api/v1/courses/${course._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.lectures).toBeDefined();
    });

    it('allows ADMIN to view course lectures regardless of subscription', async () => {
      const { token } = await createUser({ role: 'ADMIN' });
      const course = await createCourse();

      const res = await request(app)
        .get(`/api/v1/courses/${course._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.lectures).toBeDefined();
    });
  });

  // ─── 4.4 Course Update & Deletion ─────────────────────────────────────────────
  describe('4.4 Course Mutation (PUT & DELETE /api/v1/courses/:id)', () => {
    it('allows ADMIN to update course details', async () => {
      const { token } = await createUser({ role: 'ADMIN' });
      const course = await createCourse();

      const res = await request(app)
        .put(`/api/v1/courses/${course._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Updated Masterclass Title 2026',
          description: 'Updated comprehensive description with enough characters for validation.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbCourse = await Course.findById(course._id);
      expect(dbCourse.title).toBe('Updated Masterclass Title 2026');
    });

    it('allows ADMIN to delete course', async () => {
      const { token } = await createUser({ role: 'ADMIN' });
      const course = await createCourse();

      const res = await request(app)
        .delete(`/api/v1/courses/${course._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbCourse = await Course.findById(course._id);
      expect(dbCourse).toBeNull();
    });
  });

  // ─── 4.5 Curriculum Builder: Sections, Lectures & Quizzes ────────────────────
  describe('4.5 Curriculum Builder (Sections, Lectures, Quizzes, Assignments)', () => {
    it('allows ADMIN to add a section to course', async () => {
      const { token } = await createUser({ role: 'ADMIN' });
      const course = await createCourse();

      const res = await request(app)
        .post(`/api/v1/courses/${course._id}/sections`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Module 1: Foundations' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.course.sections).toHaveLength(1);
      expect(res.body.data.course.sections[0].title).toBe('Module 1: Foundations');
    });

    it('allows ADMIN to add a lecture to a section', async () => {
      const { token } = await createUser({ role: 'ADMIN' });
      const course = await createCourse();

      // Add section first
      const secRes = await request(app)
        .post(`/api/v1/courses/${course._id}/sections`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Module 2: Advanced Topics' });

      const sectionId = secRes.body.data.course.sections[0]._id;

      // Add lecture
      const lecRes = await request(app)
        .post(`/api/v1/courses/${course._id}/sections/${sectionId}/lectures`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Understanding Event Loops',
          description: 'Detailed walkthrough of libuv and microtask queues.',
          public_id: 'video_sample_123',
          secure_url: 'https://res.cloudinary.com/demo/video/upload/sample.mp4',
        });

      expect(lecRes.status).toBe(200);
      expect(lecRes.body.success).toBe(true);
      const updatedCourse = await Course.findById(course._id);
      expect(updatedCourse.numberOfLectures).toBe(1);
    });

    it('allows ADMIN to add a quiz to a section', async () => {
      const { token } = await createUser({ role: 'ADMIN' });
      const course = await createCourse();

      const secRes = await request(app)
        .post(`/api/v1/courses/${course._id}/sections`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Module 3: Testing & Quizzes' });

      const sectionId = secRes.body.data.course.sections[0]._id;

      const quizRes = await request(app)
        .post(`/api/v1/courses/${course._id}/sections/${sectionId}/quizzes`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Module 3 Assessment',
          questions: [
            {
              question: 'Which method starts the Node.js event loop?',
              options: ['node main.js', 'npm start', 'None, it starts automatically'],
              answer: 2,
            },
          ],
        });

      expect(quizRes.status).toBe(200);
      expect(quizRes.body.success).toBe(true);
      const dbCourse = await Course.findById(course._id);
      expect(dbCourse.sections[0].quizzes).toHaveLength(1);
    });
  });

  // ─── 4.6 Submissions & Media Signatures ──────────────────────────────────────
  describe('4.6 Submissions & Media Signatures', () => {
    it('allows ADMIN to fetch course submissions', async () => {
      const { token } = await createUser({ role: 'ADMIN' });
      const course = await createCourse();

      const res = await request(app)
        .get(`/api/v1/courses/${course._id}/submissions`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('submissions');
    });

    it('generates Cloudinary upload signature for ADMIN and rejects regular USER', async () => {
      const { token: studentToken } = await createUser({ role: 'USER' });
      const { token: adminToken } = await createUser({ role: 'ADMIN' });

      const unauthRes = await request(app)
        .get('/api/v1/courses/cloudinary-signature')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(unauthRes.status).toBe(403);

      const authRes = await request(app)
        .get('/api/v1/courses/cloudinary-signature')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(authRes.status).toBe(200);
      expect(authRes.body.success).toBe(true);
      expect(authRes.body.data).toHaveProperty('signature');
      expect(authRes.body.data).toHaveProperty('timestamp');
    });
  });
});

/**
 * phase10.finalSubsystemsAudit.test.js — Final Subsystems & Forensic Edge Case Test Suite
 *
 * Scope:
 *  - 10.1 Blog Full Lifecycle & SEO Slugs (POST, GET by ID & Slug, DELETE, RBAC)
 *  - 10.2 Learner Dashboard Data Aggregation (Streak, Deadlines, Next Lessons, Mastery)
 *  - 10.3 Course Publishing & Soft-Delete Lifecycle (Ownership validation, 0 lectures guard, status transitions)
 *  - 10.4 Notifications HTTP Lifecycle (List, Mark individual read, Mark all read)
 *  - 10.5 User Interactions (Toggle bookmarks, Add/List/Delete notes)
 *  - 10.6 Miscellaneous & Admin Metrics (Contact Us enqueuing, Admin user stats)
 *  - 10.7 Admin Media Signatures (Cloudinary signature security guard)
 */

import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../app.js';
import User from '../../modules/users/user.model.js';
import Course from '../../modules/courses/course.model.js';
import Notification from '../../modules/notifications/notification.model.js';

describe('=== Phase 10: Final Subsystems Forensic Audit & Edge Cases ===', () => {
  const testPassword = 'Password123!';

  const createUser = async (overrides = {}) => {
    const email = `audit_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
    const user = await User.create({
      fullName: 'Audit Tester',
      email,
      password: testPassword,
      isVerified: true,
      role: 'USER',
      ...overrides,
    });
    const token = await user.generateJWTToken();
    return { user, email, token };
  };

  const createAdmin = async (overrides = {}) => {
    return await createUser({
      fullName: 'Admin Auditor',
      role: 'ADMIN',
      ...overrides,
    });
  };

  // ─── 10.1 Blog Full Lifecycle & SEO Slugs ────────────────────────────────────
  describe('10.1 Blog Full Lifecycle & SEO Slugs', () => {
    it('rejects unauthenticated blog creation with 401', async () => {
      const res = await request(app)
        .post('/api/v1/blogs')
        .send({ title: 'Unauthorized Post', content: 'Some content', excerpt: 'Excerpt' });

      expect(res.status).toBe(401);
    });

    it('rejects blog creation from non-admin user with 403', async () => {
      const { token } = await createUser();

      const res = await request(app)
        .post('/api/v1/blogs')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Student Post', content: 'Some content', excerpt: 'Excerpt' });

      expect(res.status).toBe(403);
    });

    it('rejects blog creation with missing required fields with 400', async () => {
      const { token } = await createAdmin();

      const res = await request(app)
        .post('/api/v1/blogs')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Only Title' });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/all fields are required/i);
    });

    it('creates blog, auto-generates slug, and supports lookup by slug and Mongo ID', async () => {
      const { token } = await createAdmin();

      // Create blog
      const createRes = await request(app)
        .post('/api/v1/blogs')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Mastering Modern Full Stack Architecture 2026!',
          content: 'Deep dive into microservices, WebSockets, and zero-downtime deployments.',
          excerpt: 'A comprehensive guide for modern engineers.',
          category: 'Architecture',
          author: 'Chief Architect',
          tags: ['architecture', 'nodejs', 'react'],
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.success).toBe(true);
      expect(createRes.body.blog).toBeDefined();
      expect(createRes.body.blog.slug).toBe('mastering-modern-full-stack-architecture-2026');

      const blogId = createRes.body.blog._id;
      const blogSlug = createRes.body.blog.slug;

      // GET all blogs
      const listRes = await request(app).get('/api/v1/blogs');
      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body.blogs)).toBe(true);
      expect(listRes.body.blogs.some((b) => b.slug === blogSlug)).toBe(true);

      // GET by slug
      const slugRes = await request(app).get(`/api/v1/blogs/${blogSlug}`);
      expect(slugRes.status).toBe(200);
      expect(slugRes.body.blog.title).toBe('Mastering Modern Full Stack Architecture 2026!');

      // GET by ID
      const idRes = await request(app).get(`/api/v1/blogs/${blogId}`);
      expect(idRes.status).toBe(200);
      expect(idRes.body.blog.title).toBe('Mastering Modern Full Stack Architecture 2026!');

      // GET by non-existent slug returns 404
      const notFoundRes = await request(app).get('/api/v1/blogs/non-existent-blog-slug-999');
      expect(notFoundRes.status).toBe(404);

      // DELETE non-admin -> 403
      const { token: userToken } = await createUser();
      const userDeleteRes = await request(app)
        .delete(`/api/v1/blogs/${blogId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(userDeleteRes.status).toBe(403);

      // DELETE admin -> 200
      const adminDeleteRes = await request(app)
        .delete(`/api/v1/blogs/${blogId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(adminDeleteRes.status).toBe(200);

      // Repeated DELETE -> 404
      const repeatDeleteRes = await request(app)
        .delete(`/api/v1/blogs/${blogId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(repeatDeleteRes.status).toBe(404);
    });
  });

  // ─── 10.2 Learner Dashboard Data Aggregation ─────────────────────────────────
  describe('10.2 Learner Dashboard Data Aggregation', () => {
    it('rejects unauthenticated learner dashboard request with 401', async () => {
      const res = await request(app).get('/api/v1/dashboard/learner');
      expect(res.status).toBe(401);
    });

    it('returns default structured metrics for learner with no progress history', async () => {
      const { token } = await createUser();

      const res = await request(app)
        .get('/api/v1/dashboard/learner')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('continueLearning', null);
      expect(res.body.data).toHaveProperty('upcomingDeadlines');
      expect(Array.isArray(res.body.data.upcomingDeadlines)).toBe(true);
      expect(res.body.data).toHaveProperty('overallProgress', 0);
      expect(res.body.data).toHaveProperty('streak');
      expect(res.body.data.streak).toHaveProperty('count');
    });

    it('aggregates upcoming deadlines, continueLearning, and sectionMastery for active student', async () => {
      const { user, token } = await createUser();

      // Create course with quizzes and assignments due in the future
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const course = await Course.create({
        title: 'Backend Systems Engineering',
        description: 'Advanced backend patterns with Node & Docker',
        category: 'Development',
        createdBy: 'Senior Architect',
        numberOfLectures: 2,
        sections: [
          {
            title: 'Section 1: Distributed Storage',
            lectures: [
              {
                title: 'L1: Sharding & Replication',
                description: 'Overview',
                lecture: { public_id: 'l1', secure_url: 'https://cdn.example.com/l1.mp4' },
                duration: 600,
              },
              {
                title: 'L2: Consensus with Raft',
                description: 'Overview',
                lecture: { public_id: 'l2', secure_url: 'https://cdn.example.com/l2.mp4' },
                duration: 900,
              },
            ],
            quizzes: [
              {
                title: 'Quiz 1: CAP Theorem & Consistency',
                dueDate: futureDate,
                questions: [
                  { question: 'What does C stand for?', options: ['Consistency', 'Clock'], answer: 0 },
                ],
              },
            ],
            assignments: [
              {
                title: 'Assignment 1: Build a Raft Replica',
                dueDate: futureDate,
                description: 'Implement leader election',
              },
            ],
          },
        ],
      });

      // Update user with progress and recently watched
      const lecture1Id = course.sections[0].lectures[0]._id;
      user.recentlyWatched = [
        {
          courseId: course._id,
          lectureId: lecture1Id.toString(),
          timestamp: 120,
          watchedAt: new Date(),
        },
      ];
      user.progress = [
        {
          courseId: course._id,
          completedLectures: [lecture1Id],
          lectures: [
            {
              lectureId: lecture1Id,
              watchedPercent: 100,
              completed: true,
            },
          ],
          overallPercent: 50,
        },
      ];
      await user.save();

      const res = await request(app)
        .get('/api/v1/dashboard/learner')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.upcomingDeadlines.length).toBeGreaterThanOrEqual(2);
      expect(res.body.data.continueLearning).toBeDefined();
      const contCourseId = res.body.data.continueLearning.courseId?._id || res.body.data.continueLearning.courseId;
      expect(contCourseId.toString()).toBe(course._id.toString());
      expect(res.body.data.sectionMastery).toBeDefined();
      expect(Array.isArray(res.body.data.sectionMastery)).toBe(true);
    });
  });

  // ─── 10.3 Course Publishing & Soft-Delete Lifecycle ─────────────────────────
  describe('10.3 Course Publishing & Soft-Delete Lifecycle', () => {
    it('enforces owner-only permission, validates lecture requirement, and transitions draft -> published -> draft -> archived', async () => {
      const { user: instructor, token: instructorToken } = await createAdmin({
        fullName: 'Lead Instructor',
        role: 'ADMIN',
      });

      const { token: otherAdminToken } = await createAdmin({
        fullName: 'Unrelated Admin',
        role: 'ADMIN',
      });

      // Create draft course with 0 lectures
      const course = await Course.create({
        title: 'Cloud Native Microservices 2026',
        description: 'Kubernetes, Envoy, and Service Mesh architecture.',
        category: 'DevOps',
        createdBy: 'Lead Instructor',
        instructorId: instructor._id,
        status: 'draft',
        lectures: [],
        sections: [],
      });

      // 1. Unrelated admin tries to publish -> 403
      const forbiddenPublishRes = await request(app)
        .post(`/api/v1/courses/${course._id}/publish`)
        .set('Authorization', `Bearer ${otherAdminToken}`);
      expect(forbiddenPublishRes.status).toBe(403);
      expect(forbiddenPublishRes.body.error.message).toMatch(/only the course instructor can publish/i);

      // 2. Instructor attempts to publish with 0 lectures -> 400
      const emptyLecturePublishRes = await request(app)
        .post(`/api/v1/courses/${course._id}/publish`)
        .set('Authorization', `Bearer ${instructorToken}`);
      expect(emptyLecturePublishRes.status).toBe(400);
      expect(emptyLecturePublishRes.body.error.message).toMatch(/cannot publish a course with no lectures/i);

      // 3. Add lecture to course
      course.lectures.push({
        title: 'Intro to Service Mesh',
        description: 'Envoy and Istio',
        lecture: { public_id: 'v1', secure_url: 'https://cdn.example.com/v1.mp4' },
      });
      await course.save();

      // 4. Instructor publishes course -> 200
      const publishSuccessRes = await request(app)
        .post(`/api/v1/courses/${course._id}/publish`)
        .set('Authorization', `Bearer ${instructorToken}`);
      expect(publishSuccessRes.status).toBe(200);
      expect(publishSuccessRes.body.data.status).toBe('published');

      // 5. Publishing already published course -> 400
      const duplicatePublishRes = await request(app)
        .post(`/api/v1/courses/${course._id}/publish`)
        .set('Authorization', `Bearer ${instructorToken}`);
      expect(duplicatePublishRes.status).toBe(400);
      expect(duplicatePublishRes.body.error.message).toMatch(/already published/i);

      // 6. Unpublish course back to draft -> 200
      const unpublishRes = await request(app)
        .post(`/api/v1/courses/${course._id}/unpublish`)
        .set('Authorization', `Bearer ${instructorToken}`);
      expect(unpublishRes.status).toBe(200);
      expect(unpublishRes.body.data.status).toBe('draft');

      // 7. Soft-delete course -> 200 (archived)
      const softDeleteRes = await request(app)
        .delete(`/api/v1/courses/${course._id}/soft`)
        .set('Authorization', `Bearer ${instructorToken}`);
      expect(softDeleteRes.status).toBe(200);

      const reloadedCourse = await Course.findById(course._id);
      expect(reloadedCourse.status).toBe('archived');
      expect(reloadedCourse.softDeleted).toBe(true);
    });
  });

  // ─── 10.4 Notifications HTTP Lifecycle ──────────────────────────────────────
  describe('10.4 Notifications HTTP Lifecycle', () => {
    it('lists user notifications, marks single as read, and marks all as read', async () => {
      const { user, token } = await createUser();

      // Seed 2 notifications for this user
      const notif1 = await Notification.create({
        type: 'SYSTEM',
        message: 'Welcome to Enterprise Learning Platform!',
        targetUserId: user._id,
      });

      await Notification.create({
        type: 'COURSE_UPDATE',
        message: 'New lecture added to your enrolled course.',
        targetUserId: user._id,
      });

      // 1. GET notifications
      const getRes = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${token}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.notifications.length).toBe(2);
      expect(getRes.body.data.unreadCount).toBe(2);

      // 2. Mark single notification as read
      const markSingleRes = await request(app)
        .patch(`/api/v1/notifications/${notif1._id}/read`)
        .set('Authorization', `Bearer ${token}`);

      expect(markSingleRes.status).toBe(200);
      expect(markSingleRes.body.data.read).toBe(true);

      // 3. Verify unread count is now 1
      const countCheckRes = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${token}`);
      expect(countCheckRes.body.data.unreadCount).toBe(1);

      // 4. Mark all read
      const markAllRes = await request(app)
        .patch('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${token}`);

      expect(markAllRes.status).toBe(200);

      // 5. Verify unread count is now 0
      const finalCountRes = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${token}`);
      expect(finalCountRes.body.data.unreadCount).toBe(0);
    });
  });

  // ─── 10.5 User Interactions (Bookmarks & Notes) ─────────────────────────────
  describe('10.5 User Interactions (Bookmarks & Notes)', () => {
    it('toggles bookmarks, lists bookmarks by course, adds notes, and deletes notes', async () => {
      const { token } = await createUser();
      const courseId = new mongoose.Types.ObjectId().toString();
      const lectureId = 'lec_architecture_101';

      // 1. Add Bookmark
      const addBookmarkRes = await request(app)
        .post('/api/v1/interaction/bookmark')
        .set('Authorization', `Bearer ${token}`)
        .send({
          courseId,
          lectureId,
          timestamp: 45.5,
          label: 'Critical Database Transaction Explanations',
        });

      expect(addBookmarkRes.status).toBe(200);
      expect(addBookmarkRes.body.message).toBe('Bookmark added');
      expect(addBookmarkRes.body.data.bookmarks.length).toBe(1);

      // 2. Get Bookmarks for Course
      const getBookmarksRes = await request(app)
        .get(`/api/v1/interaction/bookmark/${courseId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(getBookmarksRes.status).toBe(200);
      expect(getBookmarksRes.body.data.bookmarks.length).toBe(1);

      // 3. Toggle same Bookmark -> removes it
      const removeBookmarkRes = await request(app)
        .post('/api/v1/interaction/bookmark')
        .set('Authorization', `Bearer ${token}`)
        .send({
          courseId,
          lectureId,
          timestamp: 45.5,
        });

      expect(removeBookmarkRes.status).toBe(200);
      expect(removeBookmarkRes.body.message).toBe('Bookmark removed');
      expect(removeBookmarkRes.body.data.bookmarks.length).toBe(0);

      // 4. Add Note
      const addNoteRes = await request(app)
        .post('/api/v1/interaction/note')
        .set('Authorization', `Bearer ${token}`)
        .send({
          courseId,
          lectureId,
          lectureTitle: 'L1: ACID vs BASE',
          timestamp: 110,
          text: 'Remember to revise two-phase commit protocols.',
        });

      expect(addNoteRes.status).toBe(200);
      expect(addNoteRes.body.data.notes.length).toBe(1);
      const noteId = addNoteRes.body.data.notes[0]._id;

      // 5. Get Notes for Course
      const getNotesRes = await request(app)
        .get(`/api/v1/interaction/note/${courseId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(getNotesRes.status).toBe(200);
      expect(getNotesRes.body.data.notes.length).toBe(1);

      // 6. Delete Note
      const deleteNoteRes = await request(app)
        .delete(`/api/v1/interaction/note/${noteId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(deleteNoteRes.status).toBe(200);
      expect(deleteNoteRes.body.message).toBe('Note deleted');
    });
  });

  // ─── 10.6 Miscellaneous & Admin Metrics ─────────────────────────────────────
  describe('10.6 Miscellaneous & Admin Metrics', () => {
    it('validates contact form inputs and successfully enqueues contact email', async () => {
      // Missing fields -> 400
      const badContactRes = await request(app)
        .post('/api/v1/contact')
        .send({ name: 'Incomplete' });

      expect(badContactRes.status).toBe(400);

      // Valid contact submission -> 200
      const goodContactRes = await request(app)
        .post('/api/v1/contact')
        .send({
          name: 'Jane Enterprise',
          email: 'jane@enterprise.org',
          message: 'Inquiring about bulk organization subscriptions.',
        });

      expect(goodContactRes.status).toBe(200);
      expect(goodContactRes.body.message).toMatch(/submitted successfully/i);
    });

    it('guards /admin/stats/users with ADMIN authorization and returns active user counts', async () => {
      const { token: userToken } = await createUser();
      const { token: adminToken } = await createAdmin();

      // Student -> 403
      const studentRes = await request(app)
        .get('/api/v1/admin/stats/users')
        .set('Authorization', `Bearer ${userToken}`);
      expect(studentRes.status).toBe(403);

      // Admin -> 200
      const adminRes = await request(app)
        .get('/api/v1/admin/stats/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data).toHaveProperty('allUsersCount');
      expect(adminRes.body.data).toHaveProperty('subscribedUsersCount');
    });
  });

  // ─── 10.7 Admin Media Signatures ────────────────────────────────────────────
  describe('10.7 Admin Media Signatures', () => {
    it('restricts Cloudinary signature generation to authenticated administrators', async () => {
      const { token: userToken } = await createUser();
      const { token: adminToken } = await createAdmin();

      // Unauthenticated -> 401
      const unauthRes = await request(app).get('/api/v1/courses/cloudinary-signature');
      expect(unauthRes.status).toBe(401);

      // Non-admin -> 403
      const userRes = await request(app)
        .get('/api/v1/courses/cloudinary-signature')
        .set('Authorization', `Bearer ${userToken}`);
      expect(userRes.status).toBe(403);

      // Admin -> 200
      const adminRes = await request(app)
        .get('/api/v1/courses/cloudinary-signature')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data).toHaveProperty('signature');
      expect(adminRes.body.data).toHaveProperty('timestamp');
    });
  });

  // ─── 10.8 Admin OTP Signup & Secret Validation ──────────────────────────────
  describe('10.8 Admin OTP Signup & Secret Validation', () => {
    it('rejects admin signup with invalid or missing adminSecret with 403 / 400', async () => {
      const email = `admin_reject_${Date.now()}@example.com`;

      // Missing adminSecret -> 400 validation error
      const missingSecretRes = await request(app)
        .post('/api/v1/user/admin/otp-signup')
        .send({
          fullName: 'Fraud Admin',
          email,
          password: 'Password123!',
        });
      expect(missingSecretRes.status).toBe(400);

      // Wrong adminSecret -> 403 Forbidden
      const wrongSecretRes = await request(app)
        .post('/api/v1/user/admin/otp-signup')
        .send({
          fullName: 'Fraud Admin',
          email,
          password: 'Password123!',
          adminSecret: 'wrong_secret_code',
        });
      expect(wrongSecretRes.status).toBe(403);
      expect(wrongSecretRes.body.error.message).toBe('Invalid Admin Secret');
    });

    it('accepts admin signup with valid adminSecret and initiates OTP verification', async () => {
      const email = `admin_accept_${Date.now()}@example.com`;

      const res = await request(app)
        .post('/api/v1/user/admin/otp-signup')
        .send({
          fullName: 'Valid Admin',
          email,
          password: 'Password123!',
          adminSecret: 'learnify_admin_2026',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const user = await User.findOne({ email }).select('+otp');
      expect(user).toBeDefined();
      expect(user.role).toBe('ADMIN');
      expect(user.otp).toBeDefined();
    });
  });
});

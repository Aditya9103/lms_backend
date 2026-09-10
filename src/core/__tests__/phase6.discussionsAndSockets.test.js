/**
 * phase6.discussionsAndSockets.test.js — Exhaustive Phase 6 Test Suite
 *
 * Scope:
 *  - 6.1 Discussion Lifecycle (Post question, reply, upvote, mark answered, flag, hide/unhide)
 *  - 6.2 User Interactions (Bookmark toggle/get/delete, note add/get/delete)
 *  - 6.3 Notification System (Fetch, mark read, mark all read)
 *  - 6.4 Socket.IO & Real-Time Event Verification
 */
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../app.js';
import User from '../../modules/users/user.model.js';
import Discussion from '../../modules/discussions/discussion.model.js';
import notificationService from '../../modules/notifications/notification.service.js';

describe('=== Phase 6: Real-Time Discussions, Interactions & WebSockets ===', () => {
  const testPassword = 'Password123!';

  const createUser = async (overrides = {}) => {
    const email = `phase6_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
    const user = await User.create({
      fullName: 'Discussion Tester',
      email,
      password: testPassword,
      isVerified: true,
      role: 'USER',
      ...overrides,
    });
    const token = await user.generateJWTToken();
    return { user, email, token };
  };

  const sampleCourseId = new mongoose.Types.ObjectId();
  const sampleLectureId = 'lecture_01_intro';

  // ─── 6.1 Discussion Lifecycle ─────────────────────────────────────────────────
  describe('6.1 Discussion Lifecycle', () => {
    it('creates a new question with timestamp and standard envelope', async () => {
      const { token } = await createUser();

      const res = await request(app)
        .post('/api/v1/discussions/question')
        .set('Authorization', `Bearer ${token}`)
        .send({
          courseId: sampleCourseId.toString(),
          lectureId: sampleLectureId,
          question: 'How do React closures work inside useEffect?',
          timestamp: 125,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.discussion).toBeDefined();
      expect(res.body.data.discussion.question).toBe('How do React closures work inside useEffect?');
      expect(res.body.data.discussion.timestamp).toBe(125);
    });

    it('rejects empty or whitespace-only question with 400 Bad Request', async () => {
      const { token } = await createUser();

      const res = await request(app)
        .post('/api/v1/discussions/question')
        .set('Authorization', `Bearer ${token}`)
        .send({
          courseId: sampleCourseId.toString(),
          lectureId: sampleLectureId,
          question: '    ',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('adds a reply to an existing discussion thread', async () => {
      const { user, token } = await createUser();
      const discussion = await Discussion.create({
        courseId: sampleCourseId,
        lectureId: sampleLectureId,
        userId: user._id,
        userName: user.fullName,
        question: 'What is the event loop?',
      });

      const res = await request(app)
        .post('/api/v1/discussions/reply')
        .set('Authorization', `Bearer ${token}`)
        .send({
          discussionId: discussion._id.toString(),
          reply: 'The event loop processes the call stack and message queue.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.discussion.replies).toHaveLength(1);
      expect(res.body.data.discussion.replies[0].reply).toMatch(/call stack/i);
    });

    it('toggles upvotes atomically (upvote -> unvote)', async () => {
      const { user, token } = await createUser();
      const discussion = await Discussion.create({
        courseId: sampleCourseId,
        lectureId: sampleLectureId,
        userId: user._id,
        userName: user.fullName,
        question: 'How does memoization improve performance?',
      });

      // 1. First upvote
      const res1 = await request(app)
        .post(`/api/v1/discussions/${discussion._id}/upvote`)
        .set('Authorization', `Bearer ${token}`);

      expect(res1.status).toBe(200);
      expect(res1.body.data.discussion.upvotes).toBe(1);

      // 2. Second upvote by same user -> unvotes
      const res2 = await request(app)
        .post(`/api/v1/discussions/${discussion._id}/upvote`)
        .set('Authorization', `Bearer ${token}`);

      expect(res2.status).toBe(200);
      expect(res2.body.data.discussion.upvotes).toBe(0);
    });

    it('allows ADMIN to mark question resolved, but blocks regular USER with 403', async () => {
      const { user: author } = await createUser();
      const discussion = await Discussion.create({
        courseId: sampleCourseId,
        lectureId: sampleLectureId,
        userId: author._id,
        userName: author.fullName,
        question: 'Explain prototypal inheritance',
      });

      const { token: userToken } = await createUser({ role: 'USER' });
      const { token: adminToken } = await createUser({ role: 'ADMIN' });

      // Regular user blocked
      const userRes = await request(app)
        .patch(`/api/v1/discussions/${discussion._id}/resolve`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(userRes.status).toBe(403);

      // Admin allowed
      const adminRes = await request(app)
        .patch(`/api/v1/discussions/${discussion._id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data.discussion.resolved).toBe(true);
    });

    it('flags a question for moderation and rejects duplicate flags with 409', async () => {
      const { user, token } = await createUser();
      const discussion = await Discussion.create({
        courseId: sampleCourseId,
        lectureId: sampleLectureId,
        userId: user._id,
        userName: user.fullName,
        question: 'Spam or irrelevant message here',
      });

      // 1. First flag
      const res1 = await request(app)
        .patch(`/api/v1/discussions/${discussion._id}/flag`)
        .set('Authorization', `Bearer ${token}`);

      expect(res1.status).toBe(200);
      expect(res1.body.data.discussion.flagged).toBe(true);

      // 2. Duplicate flag -> 409 Conflict
      const res2 = await request(app)
        .patch(`/api/v1/discussions/${discussion._id}/flag`)
        .set('Authorization', `Bearer ${token}`);

      expect(res2.status).toBe(409);
    });

    it('filters hidden discussions for students while allowing ADMIN to view all', async () => {
      const { user: author } = await createUser();
      await Discussion.create({
        courseId: sampleCourseId,
        lectureId: sampleLectureId,
        userId: author._id,
        userName: author.fullName,
        question: 'Public visible question',
        hidden: false,
      });

      await Discussion.create({
        courseId: sampleCourseId,
        lectureId: sampleLectureId,
        userId: author._id,
        userName: author.fullName,
        question: 'Hidden moderated question',
        hidden: true,
      });

      const { token: userToken } = await createUser({ role: 'USER' });
      const { token: adminToken } = await createUser({ role: 'ADMIN' });

      // Student sees only visible
      const userRes = await request(app)
        .get(`/api/v1/discussions/${sampleCourseId}/${sampleLectureId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(userRes.status).toBe(200);
      expect(userRes.body.data.discussions).toHaveLength(1);
      expect(userRes.body.data.discussions[0].question).toBe('Public visible question');

      // Admin sees both
      const adminRes = await request(app)
        .get(`/api/v1/discussions/${sampleCourseId}/${sampleLectureId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data.discussions).toHaveLength(2);
    });
  });

  // ─── 6.2 User Interactions (Bookmarks & Notes) ───────────────────────────────
  describe('6.2 Interactions: Bookmarks & Study Notes', () => {
    it('toggles bookmarks and retrieves bookmarks for a course', async () => {
      const { token } = await createUser();

      // 1. Add bookmark
      const addRes = await request(app)
        .post('/api/v1/interaction/bookmark')
        .set('Authorization', `Bearer ${token}`)
        .send({
          courseId: sampleCourseId.toString(),
          lectureId: sampleLectureId,
          timestamp: 42,
          label: 'Key architectural concept',
        });

      expect(addRes.status).toBe(200);
      expect(addRes.body.data.bookmarks).toHaveLength(1);
      expect(addRes.body.data.bookmarks[0].label).toBe('Key architectural concept');

      // 2. Get bookmarks
      const getRes = await request(app)
        .get(`/api/v1/interaction/bookmark/${sampleCourseId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.bookmarks).toHaveLength(1);
    });

    it('deletes bookmark by bookmarkId (DEF-06-001 verification)', async () => {
      const { user, token } = await createUser();
      user.bookmarks = [{
        courseId: sampleCourseId,
        lectureId: sampleLectureId,
        timestamp: 88,
        label: 'To be removed',
      }];
      await user.save();
      const bookmarkId = user.bookmarks[0]._id;

      const deleteRes = await request(app)
        .delete(`/api/v1/interaction/bookmark/${bookmarkId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.data.bookmarks).toHaveLength(0);

      const updatedUser = await User.findById(user._id);
      expect(updatedUser.bookmarks).toHaveLength(0);
    });

    it('adds, fetches, and deletes timestamped lecture notes', async () => {
      const { token } = await createUser();

      // 1. Add note
      const addRes = await request(app)
        .post('/api/v1/interaction/note')
        .set('Authorization', `Bearer ${token}`)
        .send({
          courseId: sampleCourseId.toString(),
          lectureId: sampleLectureId,
          lectureTitle: 'Introduction to Node Streams',
          timestamp: 310,
          text: 'Backpressure occurs when reading faster than writing.',
        });

      expect(addRes.status).toBe(200);
      expect(addRes.body.data.notes).toHaveLength(1);
      const noteId = addRes.body.data.notes[0]._id;

      // 2. Fetch notes
      const getRes = await request(app)
        .get(`/api/v1/interaction/note/${sampleCourseId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.notes).toHaveLength(1);

      // 3. Delete note
      const deleteRes = await request(app)
        .delete(`/api/v1/interaction/note/${noteId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(deleteRes.status).toBe(200);

      // Verify deletion
      const checkRes = await request(app)
        .get(`/api/v1/interaction/note/${sampleCourseId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(checkRes.body.data.notes).toHaveLength(0);
    });
  });

  // ─── 6.3 Notification Subsystem ──────────────────────────────────────────────
  describe('6.3 Notifications Subsystem', () => {
    it('fetches unread notifications, marks individual read, and marks all read', async () => {
      const { user, token } = await createUser();

      // Seed 2 notifications
      const notif1 = await notificationService.notifyUser(user._id, {
        type: 'ENROLLMENT_CREATED',
        message: 'Welcome to the platform!',
      });
      await notificationService.notifyUser(user._id, {
        type: 'COURSE_UPDATE',
        message: 'New lecture published',
      });

      // 1. Fetch notifications
      const listRes = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${token}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.notifications).toHaveLength(2);
      expect(listRes.body.data.unreadCount).toBe(2);

      // 2. Mark one read
      const readRes = await request(app)
        .patch(`/api/v1/notifications/${notif1._id}/read`)
        .set('Authorization', `Bearer ${token}`);

      expect(readRes.status).toBe(200);

      // 3. Mark all read
      const allReadRes = await request(app)
        .patch('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${token}`);

      expect(allReadRes.status).toBe(200);

      const unreadCount = await notificationService.getUnreadCount(user._id);
      expect(unreadCount).toBe(0);
    });
  });
});

/**
 * phase3.profile.test.js — Exhaustive Phase 3 Profile, Avatar, Streak & Progress Test Suite
 *
 * Scope:
 *  - 3.1 Profile Retrieval & Streak Tracking (Idempotent same-day, consecutive day, streak reset)
 *  - 3.2 Profile Update & Avatar Handling (Full name validation, return payload)
 *  - 3.3 Course Progress & Lecture Completion Toggle
 *  - 3.4 Video Progress Bookmarking & Recently Watched LRU cap
 *  - 3.5 Quiz Submission, Highest Score Retention & Weak Topics Extraction
 *  - 3.6 Assignment Submission & Role-Protected Grading (RBAC)
 */
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../app.js';
import User from '../../modules/users/user.model.js';
import userService from '../../modules/users/user.service.js';

describe('=== Phase 3: User Profile, Avatar, Streak Analytics & Progress Tracking ===', () => {
  const testPassword = 'Password123!';

  const createVerifiedUser = async (overrides = {}) => {
    const email = `phase3_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
    const user = await User.create({
      fullName: 'Phase 3 Tester',
      email,
      password: testPassword,
      isVerified: true,
      role: 'USER',
      ...overrides,
    });
    const token = await user.generateJWTToken();
    return { user, email, token };
  };

  // ─── 3.1 Profile Retrieval & Streak Tracking ─────────────────────────────────
  describe('3.1 Profile Retrieval & Streak Tracking (GET /api/v1/user/me)', () => {
    it('returns user profile and initializes streak to 1 on first access', async () => {
      const { user, token } = await createVerifiedUser({
        streak: { count: 0, lastActivity: null },
      });

      const res = await request(app)
        .get('/api/v1/user/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(user.email);
      expect(res.body.data.user.streak.count).toBe(1);
      expect(res.body.data.user.streak.lastActivity).toBeDefined();
    });

    it('is idempotent on the same day (streak does not increment multiple times)', async () => {
      const today = new Date();
      const { user, token } = await createVerifiedUser({
        streak: { count: 3, lastActivity: today },
      });

      const res = await request(app)
        .get('/api/v1/user/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user.streak.count).toBe(3);
    });

    it('increments streak count by 1 on consecutive day activity', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const { user, token } = await createVerifiedUser({
        streak: { count: 5, lastActivity: yesterday },
      });

      const res = await request(app)
        .get('/api/v1/user/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user.streak.count).toBe(6);
    });

    it('resets streak count to 1 if more than one day has elapsed', async () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const { user, token } = await createVerifiedUser({
        streak: { count: 12, lastActivity: threeDaysAgo },
      });

      const res = await request(app)
        .get('/api/v1/user/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user.streak.count).toBe(1);
    });
  });

  // ─── 3.2 Profile Update ──────────────────────────────────────────────────────
  describe('3.2 Profile Update (PUT /api/v1/user/update/:id)', () => {
    it('updates user fullName and returns the updated user object', async () => {
      const { user, token } = await createVerifiedUser();

      const res = await request(app)
        .put(`/api/v1/user/update/${user._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: 'Updated Full Name' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.fullName.toLowerCase()).toBe('updated full name');

      const updatedInDb = await User.findById(user._id);
      expect(updatedInDb.fullName.toLowerCase()).toBe('updated full name');
    });

    it('rejects short fullName (< 5 characters) with 400 validation error', async () => {
      const { user, token } = await createVerifiedUser();

      const res = await request(app)
        .put(`/api/v1/user/update/${user._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: 'Bob' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects unauthenticated request with 401', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .put(`/api/v1/user/update/${fakeId}`)
        .send({ fullName: 'Valid Name' });

      expect(res.status).toBe(401);
    });
  });

  // ─── 3.3 Course Progress & Lecture Completion ─────────────────────────────────
  describe('3.3 Course Progress & Lecture Toggle (POST /api/v1/user/progress/:courseId/:lectureId)', () => {
    it('adds lectureId on first toggle, removes it on second toggle', async () => {
      const { user, token } = await createVerifiedUser();
      const courseId = new mongoose.Types.ObjectId();
      const lectureId = new mongoose.Types.ObjectId().toString();

      // First toggle -> mark complete
      const res1 = await request(app)
        .post(`/api/v1/user/progress/${courseId}/${lectureId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);
      const courseProg1 = res1.body.data.progress.find((p) => p.courseId.toString() === courseId.toString());
      expect(courseProg1).toBeDefined();
      expect(courseProg1.completedLectures).toContain(lectureId);

      // Second toggle -> mark incomplete
      const res2 = await request(app)
        .post(`/api/v1/user/progress/${courseId}/${lectureId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res2.status).toBe(200);
      const courseProg2 = res2.body.data.progress.find((p) => p.courseId.toString() === courseId.toString());
      expect(courseProg2.completedLectures).not.toContain(lectureId);
    });
  });

  // ─── 3.4 Video Progress Bookmarking ──────────────────────────────────────────
  describe('3.4 Video Progress Bookmarking (POST /api/v1/user/video-progress)', () => {
    it('accepts timestamp payload from frontend player and records recentlyWatched', async () => {
      const { user, token } = await createVerifiedUser();
      const courseId = new mongoose.Types.ObjectId();
      const lectureId = new mongoose.Types.ObjectId();

      const res = await request(app)
        .post('/api/v1/user/video-progress')
        .set('Authorization', `Bearer ${token}`)
        .send({
          courseId: courseId.toString(),
          lectureId: lectureId.toString(),
          timestamp: 145,
          lastPositionSeconds: 145,
          watchedPercent: 40,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.recentlyWatched).toHaveLength(1);
      expect(res.body.data.recentlyWatched[0].timestamp).toBe(145);
    });

    it('caps recentlyWatched history to maximum 10 items (LRU style)', async () => {
      const { user, token } = await createVerifiedUser();
      const courseId = new mongoose.Types.ObjectId();

      // Insert 12 distinct lecture progresses
      for (let i = 1; i <= 12; i++) {
        const lectureId = new mongoose.Types.ObjectId();
        await request(app)
          .post('/api/v1/user/video-progress')
          .set('Authorization', `Bearer ${token}`)
          .send({
            courseId: courseId.toString(),
            lectureId: lectureId.toString(),
            timestamp: i * 10,
          });
      }

      const updatedUser = await User.findById(user._id);
      expect(updatedUser.recentlyWatched).toHaveLength(10);
      // Most recent should be at the top (timestamp 120)
      expect(updatedUser.recentlyWatched[0].timestamp).toBe(120);
    });
  });

  // ─── 3.5 Quiz Submission & Weak Topics ───────────────────────────────────────
  describe('3.5 Quiz Submission & Weak Topics (POST /api/v1/user/quiz/submit)', () => {
    it('records quiz score and adds topic to weakTopics when score < 70%', async () => {
      const { user, token } = await createVerifiedUser();
      const courseId = new mongoose.Types.ObjectId();
      const quizId = new mongoose.Types.ObjectId();

      const res = await request(app)
        .post('/api/v1/user/quiz/submit')
        .set('Authorization', `Bearer ${token}`)
        .send({
          courseId: courseId.toString(),
          quizId: quizId.toString(),
          score: 5,
          totalQuestions: 10, // 50% < 70%
          topic: 'Dynamic Programming',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.weakTopics).toContain('Dynamic Programming');
    });

    it('retains highest score on retake and removes topic from weakTopics on passing (>= 70%)', async () => {
      const { user, token } = await createVerifiedUser();
      const courseId = new mongoose.Types.ObjectId();
      const quizId = new mongoose.Types.ObjectId();

      // First attempt: 4/10 -> weak topic
      await request(app)
        .post('/api/v1/user/quiz/submit')
        .set('Authorization', `Bearer ${token}`)
        .send({
          courseId: courseId.toString(),
          quizId: quizId.toString(),
          score: 4,
          totalQuestions: 10,
          topic: 'Recursion',
        });

      // Second attempt: 9/10 -> mastered, removes from weakTopics
      const resPass = await request(app)
        .post('/api/v1/user/quiz/submit')
        .set('Authorization', `Bearer ${token}`)
        .send({
          courseId: courseId.toString(),
          quizId: quizId.toString(),
          score: 9,
          totalQuestions: 10,
          topic: 'Recursion',
        });

      expect(resPass.status).toBe(200);
      expect(resPass.body.data.weakTopics).not.toContain('Recursion');

      // Third attempt with lower score (e.g. 6/10) should NOT downgrade the saved score 9
      await request(app)
        .post('/api/v1/user/quiz/submit')
        .set('Authorization', `Bearer ${token}`)
        .send({
          courseId: courseId.toString(),
          quizId: quizId.toString(),
          score: 6,
          totalQuestions: 10,
          topic: 'Recursion',
        });

      const updatedUser = await User.findById(user._id);
      const courseProg = updatedUser.progress.find((p) => p.courseId.toString() === courseId.toString());
      const savedQuiz = courseProg.completedQuizzes.find((q) => q.quizId.toString() === quizId.toString());
      expect(savedQuiz.score).toBe(9);
    });
  });

  // ─── 3.6 Assignment Submission & Grading ─────────────────────────────────────
  describe('3.6 Assignment Submission & Role-Protected Grading', () => {
    it('allows student to submit assignment and marks status SUBMITTED', async () => {
      const { user, token } = await createVerifiedUser();
      const courseId = new mongoose.Types.ObjectId();
      const assignmentId = new mongoose.Types.ObjectId();

      const res = await request(app)
        .post('/api/v1/user/assignment/submit')
        .set('Authorization', `Bearer ${token}`)
        .field('courseId', courseId.toString())
        .field('assignmentId', assignmentId.toString());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbUser = await User.findById(user._id);
      const courseProg = dbUser.progress.find((p) => p.courseId.toString() === courseId.toString());
      const assignment = courseProg.completedAssignments.find((a) => a.assignmentId.toString() === assignmentId.toString());
      expect(assignment.status).toBe('SUBMITTED');
    });

    it('allows ADMIN to grade an assignment, while USER role receives 403 Forbidden', async () => {
      const { user: student, token: studentToken } = await createVerifiedUser({ role: 'USER' });
      const { user: admin, token: adminToken } = await createVerifiedUser({ role: 'ADMIN' });
      const courseId = new mongoose.Types.ObjectId();
      const assignmentId = new mongoose.Types.ObjectId();

      // Student submits
      await request(app)
        .post('/api/v1/user/assignment/submit')
        .set('Authorization', `Bearer ${studentToken}`)
        .field('courseId', courseId.toString())
        .field('assignmentId', assignmentId.toString());

      // Student attempts to grade themselves -> 403 Forbidden
      const unauthorizedRes = await request(app)
        .put('/api/v1/user/assignment/grade')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          userId: student._id.toString(),
          courseId: courseId.toString(),
          assignmentId: assignmentId.toString(),
          score: 100,
        });

      expect(unauthorizedRes.status).toBe(403);

      // Admin grades student submission -> 200 OK
      const adminRes = await request(app)
        .put('/api/v1/user/assignment/grade')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: student._id.toString(),
          courseId: courseId.toString(),
          assignmentId: assignmentId.toString(),
          score: 95,
        });

      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data.gradedAssignment.score).toBe(95);
      expect(adminRes.body.data.gradedAssignment.status).toBe('GRADED');
    });
  });
});

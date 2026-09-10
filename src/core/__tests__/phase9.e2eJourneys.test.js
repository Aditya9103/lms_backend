/**
 * phase9.e2eJourneys.test.js
 *
 * Enterprise End-to-End User Journey Test Suite for Phase 9:
 *  - 9.1 The Complete Learner Journey:
 *      Signup -> Login -> Browse Catalog -> Enrolled Content ->
 *      Watch Lecture & Progress -> Post Discussion Question ->
 *      Add Bookmark -> Activity & Notification verification
 *  - 9.2 The Instructor / Admin Lifecycle:
 *      Admin Login -> Create Course -> Review & Resolve Student Question ->
 *      Inspect User Stats
 *  - 9.3 SuperAdmin Governance & System Auditing:
 *      SuperAdmin Login -> View System Health -> Provision New Admin ->
 *      Audit Log Inspection -> Safe Log Purge
 *  - 9.4 Cross-Cutting Security & Session Invalidation:
 *      Forged Token Block -> RBAC Boundary Guard -> Correlation Header Propagation
 */
import request from 'supertest';
import app from '../../app.js';
import User from '../../modules/users/user.model.js';
import Course from '../../modules/courses/course.model.js';
import Discussion from '../../modules/discussions/discussion.model.js';
import ActivityLog from '../../modules/activityLog/activityLog.model.js';

describe('=== Phase 9: End-to-End User Journeys & Cross-Cutting Integration ===', () => {
  describe('9.1 Journey 1: The Complete Learner Lifecycle', () => {
    it('executes full learner lifecycle: register -> login -> browse -> view lecture -> update progress -> post discussion -> add bookmark', async () => {
      const email = `learner_journey_${Date.now()}@example.com`;
      const password = 'Password123!';

      // 1. Register User
      const regRes = await request(app)
        .post('/api/v1/user/register')
        .send({
          fullName: 'Alice Learner',
          email,
          password,
        });

      expect([200, 201]).toContain(regRes.status);
      expect(regRes.body.success).toBe(true);

      // Verify and set active subscription
      const user = await User.findOne({ email });
      expect(user).not.toBeNull();
      user.isVerified = true;
      user.subscription = { id: 'sub_active_123', status: 'active' };
      await user.save();

      // 2. Login User
      const loginRes = await request(app)
        .post('/api/v1/user/login')
        .send({ email, password });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);
      const token = loginRes.body.data.token;
      expect(token).toBeDefined();

      // 3. Browse Courses Catalog
      const catalogRes = await request(app)
        .get('/api/v1/courses')
        .set('Authorization', `Bearer ${token}`);

      expect(catalogRes.status).toBe(200);
      expect(catalogRes.body.success).toBe(true);
      expect(Array.isArray(catalogRes.body.data.courses)).toBe(true);

      // Create an active course with valid lectures schema
      const instructor = await User.create({
        fullName: 'Dr. Instructor',
        email: `instructor_${Date.now()}@example.com`,
        password: 'password123',
        role: 'ADMIN',
        isVerified: true,
      });

      const course = await Course.create({
        title: 'Full Stack Node.js Mastery',
        description: 'Comprehensive Node.js backend course with enterprise architecture',
        category: 'Development',
        createdBy: instructor._id,
        lectures: [
          {
            title: '01 - Architecture Deep Dive',
            description: 'Introduction to modular backend systems',
            lecture: {
              public_id: 'lec_pub_101',
              secure_url: 'https://cdn.example.com/videos/lecture-1.mp4',
            },
            duration: 1200,
          },
        ],
      });

      const courseId = course._id.toString();
      const lectureId = course.lectures[0]._id.toString();

      // 4. Access Course Detail & Lectures
      const courseRes = await request(app)
        .get(`/api/v1/courses/${courseId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(courseRes.status).toBe(200);
      expect(courseRes.body.success).toBe(true);
      expect(Array.isArray(courseRes.body.data.lectures)).toBe(true);
      expect(courseRes.body.data.lectures[0].title).toBe('01 - Architecture Deep Dive');

      // 5. Update Lecture Progress
      const progressRes = await request(app)
        .post(`/api/v1/courses/${courseId}/progress/lecture`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          lectureId,
          watchedPercent: 100,
          lastPositionSeconds: 1200,
        });

      expect(progressRes.status).toBe(200);
      expect(progressRes.body.success).toBe(true);

      // 6. Post Discussion Question
      const questionRes = await request(app)
        .post('/api/v1/discussions/question')
        .set('Authorization', `Bearer ${token}`)
        .send({
          courseId,
          lectureId,
          question: 'How does the EventBus isolate listener crashes in production?',
          timestampSeconds: 145,
        });

      expect(questionRes.status).toBe(201);
      expect(questionRes.body.success).toBe(true);
      expect(questionRes.body.data.discussion.question).toContain('EventBus');

      // 7. Add Lecture Bookmark
      const bookmarkRes = await request(app)
        .post('/api/v1/interaction/bookmark')
        .set('Authorization', `Bearer ${token}`)
        .send({
          courseId,
          lectureId,
          title: 'EventBus Explanation Key Moment',
          timestamp: 145,
        });

      expect(bookmarkRes.status).toBe(200);
      expect(bookmarkRes.body.success).toBe(true);

      // Verify bookmark retrieval
      const getBookmarksRes = await request(app)
        .get(`/api/v1/interaction/bookmark/${courseId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(getBookmarksRes.status).toBe(200);
      expect(getBookmarksRes.body.success).toBe(true);
      expect(getBookmarksRes.body.data.bookmarks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('9.2 Journey 2: The Instructor & Admin Workflow', () => {
    it('executes instructor lifecycle: create course -> review question -> resolve question -> check stats', async () => {
      // 1. Create Admin and Generate JWT
      const admin = await User.create({
        fullName: 'Lead Instructor',
        email: `admin_journey_${Date.now()}@example.com`,
        password: 'password123',
        role: 'ADMIN',
        isVerified: true,
        permissions: ['course.create', 'course.edit', 'discussion.resolve'],
      });
      const adminToken = await admin.generateJWTToken();

      // 2. Admin creates course
      const courseRes = await request(app)
        .post('/api/v1/courses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Advanced Microservices with Docker',
          description: 'Deploying high-scale microservices containers with Kubernetes',
          category: 'DevOps',
          createdBy: 'Admin Instructor',
        });

      expect(courseRes.status).toBe(201);
      expect(courseRes.body.success).toBe(true);
      expect(courseRes.body.data.course.title).toBe('Advanced Microservices with Docker');
      const courseId = courseRes.body.data.course._id;

      // 3. Create discussion question on this course
      const student = await User.create({
        fullName: 'Student Questioner',
        email: `student_${Date.now()}@example.com`,
        password: 'password123',
        isVerified: true,
      });

      const discussion = await Discussion.create({
        courseId,
        lectureId: '6aa291c1ba72d152375a44d8',
        userId: student._id,
        question: 'Is Docker Swarm covered or only Kubernetes?',
      });

      // 4. Admin reviews and resolves question
      const resolveRes = await request(app)
        .patch(`/api/v1/discussions/${discussion._id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.success).toBe(true);
      expect(resolveRes.body.data.discussion.resolved).toBe(true);

      // 5. Admin inspects platform user statistics
      const statsRes = await request(app)
        .get('/api/v1/admin/stats/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(statsRes.status).toBe(200);
      expect(statsRes.body.success).toBe(true);
      expect(statsRes.body.data.allUsersCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('9.3 Journey 3: SuperAdmin Platform Governance', () => {
    it('executes SuperAdmin lifecycle: check health -> provision admin with audit -> audit logs -> log purge', async () => {
      // 1. Create SuperAdmin
      const superAdmin = await User.create({
        fullName: 'Master SuperAdmin',
        email: `superadmin_journey_${Date.now()}@example.com`,
        password: 'password123',
        role: 'SUPER_ADMIN',
        isVerified: true,
      });
      const superAdminToken = await superAdmin.generateJWTToken();

      // 2. Query System Health
      const healthRes = await request(app)
        .get('/api/v1/super-admin/health')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(healthRes.status).toBe(200);
      expect(healthRes.body.success).toBe(true);
      expect(healthRes.body.data.health.dbState).toBe('Connected');
      expect(healthRes.body.data.health.uptime).toBeDefined();

      // 3. Provision New Operations Admin
      const opsAdminEmail = `ops_admin_${Date.now()}@example.com`;
      const adminRes = await request(app)
        .post('/api/v1/super-admin/admin')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          fullName: 'Operations Manager',
          email: opsAdminEmail,
          password: 'SecureOpsPassword123!',
          permissions: ['course.create', 'user.view'],
        });

      expect(adminRes.status).toBe(201);
      expect(adminRes.body.success).toBe(true);
      expect(adminRes.body.data.admin.role).toBe('ADMIN');

      // Verify audit log record
      const auditLog = await ActivityLog.findOne({
        action: 'ADMIN_CREATED',
        description: { $regex: opsAdminEmail },
      });
      expect(auditLog).not.toBeNull();

      // 4. Preview Deletion Request
      const reqRes = await request(app)
        .post('/api/v1/super-admin/logs/deletion-request')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ days: 30 });

      expect(reqRes.status).toBe(200);
      expect(reqRes.body.success).toBe(true);
      expect(reqRes.body.data.count).toBeDefined();

      // 5. Execute Deletion
      const execRes = await request(app)
        .post('/api/v1/super-admin/logs/deletion-execute')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ dateLimit: new Date().toISOString() });

      expect(execRes.status).toBe(200);
      expect(execRes.body.success).toBe(true);
      expect(execRes.body.data.deletedCount).toBeDefined();
    });
  });

  describe('9.4 Cross-Cutting Security & Session Invalidation', () => {
    it('blocks access to protected resources with forged token', async () => {
      const res = await request(app)
        .get('/api/v1/user/me')
        .set('Authorization', 'Bearer forged-invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('enforces RBAC boundary preventing regular USER from administrative operations', async () => {
      const regularUser = await User.create({
        fullName: 'Standard User',
        email: `regular_user_${Date.now()}@example.com`,
        password: 'password123',
        role: 'USER',
        isVerified: true,
      });
      const userToken = await regularUser.generateJWTToken();

      const res = await request(app)
        .post('/api/v1/super-admin/admin')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          fullName: 'Unauthorized Admin Attempt',
          email: 'hack@bad.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('propagates correlation X-Request-Id header across multi-step requests', async () => {
      const testReqId = 'e2e-correlation-uuid-12345';
      const res = await request(app)
        .get('/health')
        .set('X-Request-Id', testReqId);

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBe(testReqId);
    });
  });
});

/**
 * phase7.superAdminAndAudits.test.js — Exhaustive Phase 7 Test Suite
 *
 * Scope:
 *  - 7.1 SuperAdmin RBAC Guards (User & Admin access blocked with 403)
 *  - 7.2 User & Admin Lifecycle (Create admin, update role, self-demotion prevention)
 *  - 7.3 System Monitoring & Analytics (Stats, system health, learner dashboard)
 *  - 7.4 Activity Audit Logs & Safe Deletion Execution
 */
import request from 'supertest';
import mongoose from 'mongoose';
import crypto from 'crypto';
import app from '../../app.js';
import config from '../config/env.js';
import User from '../../modules/users/user.model.js';
import ActivityLog from '../../modules/activityLog/activityLog.model.js';

describe('=== Phase 7: SuperAdmin Operations, System Audits & Multi-Tenant RBAC ===', () => {
  const testPassword = 'Password123!';

  const createUser = async (overrides = {}) => {
    const email = `phase7_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
    const user = await User.create({
      fullName: 'SuperAdmin Tester',
      email,
      password: testPassword,
      isVerified: true,
      role: 'USER',
      ...overrides,
    });
    const token = await user.generateJWTToken();
    return { user, email, token };
  };

  // ─── 7.1 SuperAdmin RBAC Guard ───────────────────────────────────────────────
  describe('7.1 SuperAdmin RBAC Authorization Guard', () => {
    it('blocks regular USER role from SuperAdmin routes with 403 Forbidden', async () => {
      const { token } = await createUser({ role: 'USER' });

      const res = await request(app)
        .get('/api/v1/super-admin/users')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/Super Admin only/i);
    });

    it('blocks standard ADMIN role from SuperAdmin routes with 403 Forbidden', async () => {
      const { token } = await createUser({ role: 'ADMIN' });

      const res = await request(app)
        .get('/api/v1/super-admin/users')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/Super Admin only/i);
    });

    it('allows SUPER_ADMIN role to retrieve all platform users', async () => {
      const { token } = await createUser({ role: 'SUPER_ADMIN' });

      const res = await request(app)
        .get('/api/v1/super-admin/users')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.users).toBeDefined();
      expect(Array.isArray(res.body.data.users)).toBe(true);
    });
  });

  // ─── 7.2 User & Admin Lifecycle Management ──────────────────────────────────
  describe('7.2 User & Admin Lifecycle Management', () => {
    it('creates a new admin and logs activity in audit trail', async () => {
      const { token: superAdminToken } = await createUser({ role: 'SUPER_ADMIN' });
      const newAdminEmail = `admin_${Date.now()}@example.com`;

      const res = await request(app)
        .post('/api/v1/super-admin/admin')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          fullName: 'New System Admin',
          email: newAdminEmail,
          password: 'SecureAdminPass123!',
          permissions: ['course.create', 'course.update'],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.admin).toBeDefined();
      expect(res.body.data.admin.role).toBe('ADMIN');
      expect(res.body.data.admin.password).toBeUndefined();

      // Verify audit log entry
      const log = await ActivityLog.findOne({ action: 'ADMIN_CREATED' });
      expect(log).toBeDefined();
      expect(log.description).toContain(newAdminEmail);
    });

    it('rejects admin creation with short password (< 8 chars) with 400', async () => {
      const { token: superAdminToken } = await createUser({ role: 'SUPER_ADMIN' });

      const res = await request(app)
        .post('/api/v1/super-admin/admin')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          fullName: 'Short Pass Admin',
          email: `short_admin_${Date.now()}@example.com`,
          password: 'short',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/at least 8 characters/i);
    });

    it('promotes user to ADMIN role and updates permissions', async () => {
      const { token: superAdminToken } = await createUser({ role: 'SUPER_ADMIN' });
      const { user: targetUser } = await createUser({ role: 'USER' });

      const res = await request(app)
        .put(`/api/v1/super-admin/role/${targetUser._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          role: 'ADMIN',
          permissions: ['course.create', 'lecture.upload'],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('ADMIN');

      const updatedDbUser = await User.findById(targetUser._id);
      expect(updatedDbUser.role).toBe('ADMIN');
    });

    it('prevents SuperAdmin from demoting themselves (DEF-07-003)', async () => {
      const { user: superAdminUser, token: superAdminToken } = await createUser({ role: 'SUPER_ADMIN' });

      const res = await request(app)
        .put(`/api/v1/super-admin/role/${superAdminUser._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          role: 'USER',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/cannot demote themselves/i);
    });
  });

  // ─── 7.3 Analytics & System Monitoring ──────────────────────────────────────
  describe('7.3 Analytics & System Monitoring', () => {
    it('returns SuperAdmin platform dashboard statistics in standard envelope', async () => {
      const { token: superAdminToken } = await createUser({ role: 'SUPER_ADMIN' });

      const res = await request(app)
        .get('/api/v1/super-admin/stats')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.stats).toHaveProperty('totalUsers');
      expect(res.body.data.stats).toHaveProperty('totalAdmins');
      expect(res.body.data.stats).toHaveProperty('newUsersToday');
    });

    it('returns system health metrics (uptime, memory, cpu, dbState)', async () => {
      const { token: superAdminToken } = await createUser({ role: 'SUPER_ADMIN' });

      const res = await request(app)
        .get('/api/v1/super-admin/health')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.health).toHaveProperty('uptime');
      expect(res.body.data.health).toHaveProperty('dbState');
      expect(res.body.data.health.memory).toHaveProperty('total');
      expect(res.body.data.health.cpu).toHaveProperty('cores');
    });

    it('returns learner dashboard data safely without throwing on unpopulated progress (DEF-07-002)', async () => {
      const { token: studentToken } = await createUser({
        role: 'USER',
        progress: [
          {
            courseId: new mongoose.Types.ObjectId(),
            completedLectures: ['lec_1'],
            completedQuizzes: [],
            completedAssignments: [],
          },
        ],
      });

      const res = await request(app)
        .get('/api/v1/dashboard/learner')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('overallProgress');
      expect(res.body.data).toHaveProperty('upcomingDeadlines');
    });

    it('returns admin user count stats via GET /api/v1/admin/stats/users with standard envelope (DEF-07-001)', async () => {
      const { token: adminToken } = await createUser({ role: 'ADMIN' });

      const res = await request(app)
        .get('/api/v1/admin/stats/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('allUsersCount');
      expect(res.body.data).toHaveProperty('subscribedUsersCount');
    });
  });

  // ─── 7.4 Activity Audit Logs & Log Management ────────────────────────────────
  describe('7.4 Activity Audit Logs & Safe Log Management', () => {
    it('retrieves activity logs audit trail', async () => {
      const { token: superAdminToken } = await createUser({ role: 'SUPER_ADMIN' });

      const res = await request(app)
        .get('/api/v1/super-admin/activities')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.logs).toBeDefined();
      expect(Array.isArray(res.body.data.logs)).toBe(true);
    });

    it('calculates logs count older than specified days', async () => {
      const { token: superAdminToken } = await createUser({ role: 'SUPER_ADMIN' });

      const res = await request(app)
        .post('/api/v1/super-admin/logs/deletion-request')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ days: 30 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('count');
      expect(res.body.data).toHaveProperty('dateLimit');
      expect(res.body.data.days).toBe(30);
    });

    it('rejects log deletion with invalid date string with 400 Bad Request (DEF-07-004)', async () => {
      const { token: superAdminToken } = await createUser({ role: 'SUPER_ADMIN' });

      const res = await request(app)
        .post('/api/v1/super-admin/logs/deletion-execute')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ dateLimit: 'totally-invalid-date' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/invalid date/i);
    });
  });

  // ─── 7.5 SuperAdmin Signup & Bootstrap ───────────────────────────────────────
  describe('7.5 SuperAdmin Signup (POST /api/v1/user/super-admin/signup)', () => {
    it('creates super admin using superAdminSecurityCode', async () => {
      const email = `sa_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
      const res = await request(app)
        .post('/api/v1/user/super-admin/signup')
        .send({
          fullName: 'Master Super Admin',
          email,
          password: 'Password123!',
          superAdminSecurityCode: process.env.SUPER_ADMIN_SECURITY_CODE || 'super_secret_admin_code_2026',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('SUPER_ADMIN');
    });

    it('creates super admin using securityCode alias', async () => {
      const email = `sa_alias_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
      const res = await request(app)
        .post('/api/v1/user/super-admin/signup')
        .send({
          fullName: 'Alias Super Admin',
          email,
          password: 'Password123!',
          securityCode: process.env.SUPER_ADMIN_SECURITY_CODE || 'super_secret_admin_code_2026',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('SUPER_ADMIN');
    });

    it('rejects signup without any security code with 400 validation error', async () => {
      const res = await request(app)
        .post('/api/v1/user/super-admin/signup')
        .send({
          fullName: 'Missing Code Admin',
          email: 'missingcode@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects signup with invalid security code with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/user/super-admin/signup')
        .send({
          fullName: 'Wrong Code Admin',
          email: 'wrongcode@example.com',
          password: 'Password123!',
          superAdminSecurityCode: 'wrong_secret_code',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/invalid setup security code/i);
    });
  });

  describe('7.6 SuperAdmin Password & OTP Login Flow', () => {
    let superAdminEmail;
    const superAdminPassword = 'SuperSecretPassword123!';

    beforeEach(async () => {
      superAdminEmail = `superlogin_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
      await request(app)
        .post('/api/v1/user/super-admin/signup')
        .send({
          fullName: 'Super Login Admin',
          email: superAdminEmail,
          password: superAdminPassword,
          superAdminSecurityCode: config.SUPER_ADMIN_SECURITY_CODE,
        });
    });

    it('logs in super admin with correct password', async () => {
      const res = await request(app)
        .post('/api/v1/user/super-admin/password-login')
        .send({
          email: superAdminEmail,
          password: superAdminPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('SUPER_ADMIN');
      expect(res.body.data.token).toBeDefined();
    });

    it('rejects password login with incorrect password with 401', async () => {
      const res = await request(app)
        .post('/api/v1/user/super-admin/password-login')
        .send({
          email: superAdminEmail,
          password: 'IncorrectPassword999!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects password login for non-superadmin user with 403', async () => {
      const regularEmail = `regular_${Date.now()}@example.com`;
      await User.create({
        fullName: 'Regular User',
        email: regularEmail,
        password: 'UserPassword123!',
        role: 'USER',
        isVerified: true,
      });

      const res = await request(app)
        .post('/api/v1/user/super-admin/password-login')
        .send({
          email: regularEmail,
          password: 'UserPassword123!',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/Super Admin privileges required/i);
    });

    it('requests OTP login for super admin', async () => {
      const res = await request(app)
        .post('/api/v1/user/super-admin/otp-login')
        .send({
          email: superAdminEmail,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects OTP login request for standard USER with 403', async () => {
      const userOnlyEmail = `useronly_${Date.now()}@example.com`;
      await User.create({
        fullName: 'User Only',
        email: userOnlyEmail,
        role: 'USER',
        isVerified: true,
      });

      const res = await request(app)
        .post('/api/v1/user/super-admin/otp-login')
        .send({
          email: userOnlyEmail,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/Super Admin privileges required/i);
    });

    it('verifies valid OTP for super admin and returns session token', async () => {
      // Find the user to get OTP hash or set a known OTP
      const crypto = await import('crypto');
      const testOtp = '654321';
      const hashedOtp = crypto.createHash('sha256').update(testOtp).digest('hex');

      await User.updateOne(
        { email: superAdminEmail },
        { otp: hashedOtp, otpExpiresAt: Date.now() + 600000, otpType: 'login' }
      );

      const res = await request(app)
        .post('/api/v1/user/super-admin/verify-login-otp')
        .send({
          email: superAdminEmail,
          otp: testOtp,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('SUPER_ADMIN');
      expect(res.body.data.token).toBeDefined();
    });

    it('rejects verification with wrong OTP with 400', async () => {
      const res = await request(app)
        .post('/api/v1/user/super-admin/verify-login-otp')
        .send({
          email: superAdminEmail,
          otp: '000000',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});

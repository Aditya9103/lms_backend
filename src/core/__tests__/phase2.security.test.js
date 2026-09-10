/**
 * phase2.security.test.js — Exhaustive Phase 2 Security, Authentication & RBAC Test Suite
 *
 * Designed for full test isolation (works with per-test DB collection purge).
 *
 * Scope:
 *  - 2.1 User Registration (Validation, Duplicate Prevention, Cookie issuance)
 *  - 2.2 User Login & Account Lockout (Credential checks, 5-attempt threshold lockout)
 *  - 2.3 User Logout & Cookie Clearance (Token revocation)
 *  - 2.4 Refresh Token Rotation & Token Reuse / Theft Detection
 *  - 2.5 Password Reset Lifecycle (Forgot, Reset with Token, Validation)
 *  - 2.6 Authenticated Password Change & Profile (Bearer JWT extraction, old password verification)
 *  - 2.7 RBAC & Permission Route Guards (isLoggedIn, authorizeRoles, authorizeSuperAdmin, authorize)
 */
import request from 'supertest';
import app from '../../app.js';
import User from '../../modules/users/user.model.js';
import {
  isLoggedIn,
  authorizeRoles,
  authorizeSuperAdmin,
  authorize,
} from '../middlewares/auth.middleware.js';

describe('=== Phase 2: Security, Authentication Hardening & RBAC ===', () => {
  const testPassword = 'Password123!';

  const createVerifiedUser = async (overrides = {}) => {
    const email = `user_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
    const user = await User.create({
      fullName: 'Test User',
      email,
      password: testPassword,
      isVerified: true,
      role: 'USER',
      ...overrides,
    });
    return { user, email };
  };

  // ─── 2.1 User Registration ──────────────────────────────────────────────────
  describe('2.1 User Registration (POST /api/v1/user/register)', () => {
    it('successfully registers a new user, returns accessToken and sets httpOnly refreshToken cookie', async () => {
      const email = `reg_${Date.now()}@example.com`;
      const res = await request(app)
        .post('/api/v1/user/register')
        .send({
          fullName: 'Phase2 Registrant',
          email,
          password: testPassword,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('user');
      expect(res.body.data.user.email).toBe(email);
      expect(res.body.data.user).not.toHaveProperty('password');

      // Check httpOnly cookie
      const cookies = res.headers['set-cookie'] || [];
      const refreshCookie = cookies.find((c) => c.startsWith('refreshToken='));
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('HttpOnly');
    });

    it('rejects duplicate email registration with 409 Conflict', async () => {
      const { email } = await createVerifiedUser();

      const res = await request(app)
        .post('/api/v1/user/register')
        .send({
          fullName: 'Duplicate User',
          email,
          password: testPassword,
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/already exists/i);
    });

    it('rejects invalid email or short password with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/v1/user/register')
        .send({
          fullName: 'A',
          email: 'invalid-email-address',
          password: 'short',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ─── 2.2 User Login & Account Lockout ───────────────────────────────────────
  describe('2.2 User Login & Account Lockout (POST /api/v1/user/login)', () => {
    it('authenticates valid credentials, sets refreshToken cookie, and returns accessToken', async () => {
      const { email } = await createVerifiedUser();

      const res = await request(app)
        .post('/api/v1/user/login')
        .send({ email, password: testPassword });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();

      const cookies = res.headers['set-cookie'] || [];
      const refreshCookie = cookies.find((c) => c.startsWith('refreshToken='));
      expect(refreshCookie).toBeDefined();
    });

    it('returns 401 for incorrect password and tracks failed attempts in DB', async () => {
      const { email } = await createVerifiedUser();

      const res = await request(app)
        .post('/api/v1/user/login')
        .send({ email, password: 'WrongPassword999!' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);

      const dbUser = await User.findOne({ email });
      expect(dbUser.failedLoginAttempts).toBe(1);
    });

    it('returns 401 for non-existent email', async () => {
      const res = await request(app)
        .post('/api/v1/user/login')
        .send({
          email: 'unknown_ghost_user_999@example.com',
          password: testPassword,
        });

      expect(res.status).toBe(401);
    });

    it('locks account after 5 consecutive failed attempts and returns 423', async () => {
      const { email } = await createVerifiedUser();

      // Attempt 1 to 4
      for (let i = 0; i < 4; i++) {
        await request(app)
          .post('/api/v1/user/login')
          .send({ email, password: 'BadPassword' });
      }

      // Attempt 5 — triggers lockout threshold
      const res5 = await request(app)
        .post('/api/v1/user/login')
        .send({ email, password: 'BadPassword' });

      expect(res5.status).toBe(401);

      // Attempt 6 — account is now locked, even correct password must be rejected
      const res6 = await request(app)
        .post('/api/v1/user/login')
        .send({ email, password: testPassword });

      expect(res6.status).toBe(423);
      expect(res6.body.error.message).toMatch(/temporarily locked/i);
    });
  });

  // ─── 2.3 User Logout ────────────────────────────────────────────────────────
  describe('2.3 User Logout (POST /api/v1/user/logout)', () => {
    it('revokes the refresh token and clears the httpOnly cookie', async () => {
      const { email } = await createVerifiedUser();

      const loginRes = await request(app)
        .post('/api/v1/user/login')
        .send({ email, password: testPassword });

      const cookies = loginRes.headers['set-cookie'] || [];
      const sessionCookie = cookies.find((c) => c.startsWith('refreshToken=')).split(';')[0];

      const logoutRes = await request(app)
        .post('/api/v1/user/logout')
        .set('Cookie', [sessionCookie]);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      const logoutCookies = logoutRes.headers['set-cookie'] || [];
      const clearedCookie = logoutCookies.find((c) => c.startsWith('refreshToken='));
      expect(clearedCookie).toMatch(/refreshToken=;/);
    });
  });

  // ─── 2.4 Refresh Token Rotation & Reuse Detection ───────────────────────────
  describe('2.4 Refresh Token Rotation & Token Theft Detection', () => {
    it('returns 401 when no refresh token cookie is provided', async () => {
      const res = await request(app).post('/api/v1/user/refresh');
      expect(res.status).toBe(401);
      expect(res.body.error.message).toMatch(/no refresh token/i);
    });

    it('rotates refresh token and issues new accessToken on valid cookie', async () => {
      const { email } = await createVerifiedUser();

      const loginRes = await request(app)
        .post('/api/v1/user/login')
        .send({ email, password: testPassword });

      const oldCookie = (loginRes.headers['set-cookie'] || [])
        .find((c) => c.startsWith('refreshToken='))
        .split(';')[0];

      const refreshRes = await request(app)
        .post('/api/v1/user/refresh')
        .set('Cookie', [oldCookie]);

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.data.accessToken).toBeDefined();

      const newCookie = (refreshRes.headers['set-cookie'] || [])
        .find((c) => c.startsWith('refreshToken='))
        .split(';')[0];

      expect(newCookie).not.toBe(oldCookie);

      // Replaying OLD rotated token must trigger REUSE DETECTION
      const replayRes = await request(app)
        .post('/api/v1/user/refresh')
        .set('Cookie', [oldCookie]);

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.error.message).toMatch(/security alert/i);

      // Verify that after reuse detection, ALL tokens for the user are revoked
      const afterTheftRes = await request(app)
        .post('/api/v1/user/refresh')
        .set('Cookie', [newCookie]);

      expect(afterTheftRes.status).toBe(401);
    });
  });

  // ─── 2.5 Password Reset Lifecycle ───────────────────────────────────────────
  describe('2.5 Password Reset Lifecycle', () => {
    it('generates a password reset token for valid email (POST /api/v1/user/reset)', async () => {
      const { email } = await createVerifiedUser();

      const res = await request(app)
        .post('/api/v1/user/reset')
        .send({ email });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbUser = await User.findOne({ email });
      expect(dbUser.forgotPasswordToken).toBeDefined();
      expect(dbUser.forgotPasswordExpiry).toBeDefined();
    });

    it('resets password when a valid token is submitted', async () => {
      const { user, email } = await createVerifiedUser();
      const resetToken = await user.generatePasswordResetToken();
      await user.save();

      const newPassword = 'NewPassword123!';
      const res = await request(app)
        .post(`/api/v1/user/reset/${resetToken}`)
        .send({ password: newPassword, confirmPassword: newPassword });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify user can now log in with the new password
      const loginRes = await request(app)
        .post('/api/v1/user/login')
        .send({ email, password: newPassword });

      expect(loginRes.status).toBe(200);
    });

    it('rejects an invalid or expired reset token with 400', async () => {
      const res = await request(app)
        .post('/api/v1/user/reset/completely_bogus_token_12345')
        .send({ password: 'AnotherPassword123!' });

      expect(res.status).toBe(400);
    });
  });

  // ─── 2.6 Authenticated Profile & Password Change ─────────────────────────────
  describe('2.6 Authenticated User Operations', () => {
    it('GET /api/v1/user/me returns current user details with valid Bearer token', async () => {
      const { user, email } = await createVerifiedUser();
      const token = await user.generateJWTToken();

      const res = await request(app)
        .get('/api/v1/user/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe(email);
    });

    it('GET /api/v1/user/me rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/user/me');
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/user/change-password validates old password and updates to new password', async () => {
      const { user, email } = await createVerifiedUser();
      const token = await user.generateJWTToken();

      const res = await request(app)
        .post('/api/v1/user/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          oldPassword: testPassword,
          newPassword: 'BrandNewPassword123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify login with changed password
      const loginCheck = await request(app)
        .post('/api/v1/user/login')
        .send({ email, password: 'BrandNewPassword123!' });

      expect(loginCheck.status).toBe(200);
    });
  });

  // ─── 2.7 Role-Based & Permission-Based Access Control Guards ─────────────────
  describe('2.7 RBAC & Route Guard Enforcement', () => {
    it('isLoggedIn rejects request when token is expired or malformed', async () => {
      const req = { headers: { authorization: 'Bearer invalid.malformed.jwt' } };
      const res = {};
      const next = jest.fn();

      await isLoggedIn(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('authorizeRoles permits allowed roles and rejects forbidden roles with 403', async () => {
      const guard = authorizeRoles('ADMIN', 'SUPER_ADMIN');

      // Regular user (role: 'USER')
      const reqUser = { user: { id: '123', role: 'USER' } };
      const nextUser = jest.fn();
      await guard(reqUser, {}, nextUser);
      expect(nextUser).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));

      // Admin user (role: 'ADMIN')
      const reqAdmin = { user: { id: '456', role: 'ADMIN' } };
      const nextAdmin = jest.fn();
      await guard(reqAdmin, {}, nextAdmin);
      expect(nextAdmin).toHaveBeenCalledWith(); // success with no args
    });

    it('authorizeSuperAdmin allows only SUPER_ADMIN and blocks ADMIN with 403', async () => {
      // Admin user
      const reqAdmin = { user: { id: '456', role: 'ADMIN' } };
      const nextAdmin = jest.fn();
      await authorizeSuperAdmin(reqAdmin, {}, nextAdmin);
      expect(nextAdmin).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));

      // Super admin user
      const reqSuper = { user: { id: '789', role: 'SUPER_ADMIN' } };
      const nextSuper = jest.fn();
      await authorizeSuperAdmin(reqSuper, {}, nextSuper);
      expect(nextSuper).toHaveBeenCalledWith();
    });

    it('authorize permission guard allows SUPER_ADMIN bypass and enforces granular permissions', async () => {
      const permissionGuard = authorize('course:create');

      // SuperAdmin bypass
      const reqSuper = { user: { id: '789', role: 'SUPER_ADMIN' } };
      const nextSuper = jest.fn();
      await permissionGuard(reqSuper, {}, nextSuper);
      expect(nextSuper).toHaveBeenCalledWith();

      // Regular user without permission
      const { user } = await createVerifiedUser({ permissions: [] });
      const reqUser = { user: { id: user._id.toString(), role: 'USER' } };
      const nextUser = jest.fn();
      await permissionGuard(reqUser, {}, nextUser);
      expect(nextUser).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });
  });
});

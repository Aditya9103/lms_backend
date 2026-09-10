/**
 * phase9.advancedCoverageAndEdgeCases.test.js
 *
 * Comprehensive Enterprise Test Suite for Phase 9 Edge Cases & Full Subsystem Coverage:
 *  - Contact Us Form & Validation
 *  - Password Management (Forgot Password, Reset Token, Password Change)
 *  - User Profile Updates
 *  - Course Structure (Sections, Lectures, Course Deletion)
 *  - Permission Service RBAC Logic & Grants
 *  - Payment Key & Subscription Cancellation Edge Cases
 */
import request from 'supertest';
import app from '../../app.js';
import User from '../../modules/users/user.model.js';
import Course from '../../modules/courses/course.model.js';
import permissionService from '../../modules/permissions/permission.service.js';
import { Permissions } from '../../modules/permissions/permissions.constants.js';

describe('=== Phase 9: Advanced Subsystem Coverage & Edge Cases ===', () => {
  describe('9.5 Contact Us Endpoint & Input Validation', () => {
    it('rejects contact submission with missing required fields with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/v1/contact')
        .send({ name: 'Alice' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('required');
    });

    it('successfully processes valid contact request and returns standardized envelope', async () => {
      const res = await request(app)
        .post('/api/v1/contact')
        .send({
          name: 'Alice Student',
          email: 'alice@example.com',
          message: 'Inquiring about enterprise team licenses for our organization.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('9.6 Password Lifecycle: Forgot Password, Reset Token, Change Password', () => {
    it('returns HTTP 400 when requesting password reset for unregistered email', async () => {
      const res = await request(app)
        .post('/api/v1/user/reset')
        .send({ email: 'nonexistent_user_999@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Email not registered');
    });

    it('generates reset token for registered user and allows password reset with valid token', async () => {
      const email = `pwd_reset_${Date.now()}@example.com`;
      const originalPassword = 'OldPassword123!';
      const newPassword = 'NewPassword456!';

      const user = await User.create({
        fullName: 'Password Reset User',
        email,
        password: originalPassword,
        isVerified: true,
      });

      // 1. Generate reset token directly on the model
      const rawResetToken = await user.generatePasswordResetToken();
      await user.save();

      // 2. Attempt reset with invalid token
      const invalidResetRes = await request(app)
        .post('/api/v1/user/reset/completely-bogus-token-xyz')
        .send({ password: newPassword, confirmPassword: newPassword });

      expect(invalidResetRes.status).toBe(400);
      expect(invalidResetRes.body.success).toBe(false);

      // 3. Reset with valid token and matching confirmation
      const validResetRes = await request(app)
        .post(`/api/v1/user/reset/${rawResetToken}`)
        .send({ password: newPassword, confirmPassword: newPassword });

      expect(validResetRes.status).toBe(200);
      expect(validResetRes.body.success).toBe(true);

      // 4. Verify login with new password works
      const loginRes = await request(app)
        .post('/api/v1/user/login')
        .send({ email, password: newPassword });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);
    });

    it('enforces authentication and verifies old password during change-password flow', async () => {
      const email = `change_pwd_${Date.now()}@example.com`;
      const user = await User.create({
        fullName: 'Change Pwd User',
        email,
        password: 'CurrentPassword123!',
        isVerified: true,
      });
      const token = await user.generateJWTToken();

      // 1. Wrong old password
      const wrongRes = await request(app)
        .post('/api/v1/user/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          oldPassword: 'WrongPassword999!',
          newPassword: 'BrandNewPassword123!',
        });

      expect(wrongRes.status).toBe(400);
      expect(wrongRes.body.success).toBe(false);
      expect(wrongRes.body.error.message).toContain('Invalid old password');

      // 2. Correct old password
      const successRes = await request(app)
        .post('/api/v1/user/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          oldPassword: 'CurrentPassword123!',
          newPassword: 'BrandNewPassword123!',
        });

      expect(successRes.status).toBe(200);
      expect(successRes.body.success).toBe(true);
    });
  });

  describe('9.7 User Profile Updating', () => {
    it('updates user fullName via PUT /api/v1/user/update/:id', async () => {
      const user = await User.create({
        fullName: 'Original Name',
        email: `profile_upd_${Date.now()}@example.com`,
        password: 'Password123!',
        isVerified: true,
      });
      const token = await user.generateJWTToken();

      const res = await request(app)
        .put(`/api/v1/user/update/${user._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: 'Updated Full Name' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbUser = await User.findById(user._id);
      expect(dbUser.fullName).toBe('updated full name');
    });
  });

  describe('9.8 Course Lifecycle Subsystems: Sections & Deletion', () => {
    it('allows ADMIN to add sections, add lecture metadata, and delete course', async () => {
      const admin = await User.create({
        fullName: 'Admin Course Manager',
        email: `course_mgr_${Date.now()}@example.com`,
        password: 'Password123!',
        role: 'ADMIN',
        isVerified: true,
        permissions: ['course.create', 'course.edit', 'course.delete'],
      });
      const adminToken = await admin.generateJWTToken();

      // 1. Create Course
      const course = await Course.create({
        title: 'Cloud Native Architecture',
        description: 'Deep dive into Kubernetes and Cloud Native systems',
        category: 'DevOps',
        createdBy: admin._id,
      });
      const courseId = course._id.toString();

      // 2. Add Section
      const sectionRes = await request(app)
        .post(`/api/v1/courses/${courseId}/sections`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Module 1: Pods & Services' });

      expect(sectionRes.status).toBe(200);
      expect(sectionRes.body.success).toBe(true);

      const updatedCourse = await Course.findById(courseId);
      expect(updatedCourse.sections.length).toBe(1);
      const sectionId = updatedCourse.sections[0]._id.toString();

      // 3. Add Lecture to Section
      const lectureRes = await request(app)
        .post(`/api/v1/courses/${courseId}/sections/${sectionId}/lectures`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: '01 - Pod Networking Fundamentals',
          description: 'Understanding container network interfaces',
          public_id: 'lec_k8s_101',
          secure_url: 'https://cdn.example.com/k8s/lec-1.mp4',
        });

      expect(lectureRes.status).toBe(200);
      expect(lectureRes.body.success).toBe(true);

      // 4. Delete Course
      const delRes = await request(app)
        .delete(`/api/v1/courses/${courseId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      const deletedCourse = await Course.findById(courseId);
      expect(deletedCourse).toBeNull();
    });
  });

  describe('9.9 PermissionService Unit & Edge Case Hardening', () => {
    it('computes effective permissions merging role defaults and custom grants deduplicated', () => {
      const perms = permissionService.getEffectivePermissions('USER', ['course.create', 'user.view']);
      expect(perms).toContain('course.create');
      expect(perms).toContain('user.view');
      // Verify deduplication
      const duplicateTest = permissionService.getEffectivePermissions('ADMIN', ['course.create', 'course.create']);
      const count = duplicateTest.filter((p) => p === 'course.create').length;
      expect(count).toBe(1);
    });

    it('seeds role defaults idempotently without duplicating existing permissions', async () => {
      const user = await User.create({
        fullName: 'Admin Seeder',
        email: `admin_seeder_${Date.now()}@example.com`,
        password: 'Password123!',
        role: 'ADMIN',
        permissions: ['course.create'],
        isVerified: true,
      });

      await permissionService.seedDefaultPermissions(user._id.toString(), 'ADMIN');

      const updatedUser = await User.findById(user._id);
      expect(updatedUser.permissions.length).toBeGreaterThan(1);
      expect(updatedUser.permissions).toContain('course.create');

      // Second seed run should be idempotent
      const initialCount = updatedUser.permissions.length;
      await permissionService.seedDefaultPermissions(user._id.toString(), 'ADMIN');
      const recheckedUser = await User.findById(user._id);
      expect(recheckedUser.permissions.length).toBe(initialCount);
    });

    it('rejects granting unknown permission names with AppError 400', async () => {
      const user = await User.create({
        fullName: 'Grant Target',
        email: `grant_target_${Date.now()}@example.com`,
        password: 'Password123!',
        isVerified: true,
      });

      await expect(
        permissionService.grantPermission(user._id.toString(), 'non.existent.permission', 'super-admin-id')
      ).rejects.toThrow('Unknown permission');
    });

    it('grants and revokes valid permission for user', async () => {
      const user = await User.create({
        fullName: 'Grant Revoke User',
        email: `grant_revoke_${Date.now()}@example.com`,
        password: 'Password123!',
        isVerified: true,
        permissions: [],
      });
      const userId = user._id.toString();

      await permissionService.grantPermission(userId, Permissions.COURSE_CREATE, 'superadmin-1');
      let dbUser = await User.findById(userId);
      expect(dbUser.permissions).toContain(Permissions.COURSE_CREATE);

      await permissionService.revokePermission(userId, Permissions.COURSE_CREATE, 'superadmin-1');
      dbUser = await User.findById(userId);
      expect(dbUser.permissions).not.toContain(Permissions.COURSE_CREATE);
    });
  });

  describe('9.10 Payment Key & Cancellation Guard', () => {
    it('returns Razorpay public key via GET /api/v1/payments/razorpay-key', async () => {
      const user = await User.create({
        fullName: 'Payment Key Inquirer',
        email: `pay_key_${Date.now()}@example.com`,
        password: 'Password123!',
        isVerified: true,
      });
      const token = await user.generateJWTToken();

      const res = await request(app)
        .get('/api/v1/payments/razorpay-key')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.key).toBeDefined();
    });

    it('returns HTTP 403 when attempting to unsubscribe without an active subscription', async () => {
      const user = await User.create({
        fullName: 'Non Subscribed User',
        email: `non_sub_${Date.now()}@example.com`,
        password: 'Password123!',
        role: 'USER',
        isVerified: true,
        subscription: { status: 'inactive' },
      });
      const token = await user.generateJWTToken();

      const res = await request(app)
        .post('/api/v1/payments/unsubscribe')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Please subscribe');
    });
  });
});

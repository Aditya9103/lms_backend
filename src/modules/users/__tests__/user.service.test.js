/**
 * user.service.test.js — Unit tests for UserService
 *
 * Strategy: mock external dependencies (cloudinary, email transport, Google auth)
 * so tests run fast and deterministically. The in-memory MongoDB from globalSetup
 * provides a real DB layer — we test actual Mongoose operations.
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

jest.mock('cloudinary', () => ({
  v2: {
    uploader: {
      upload: jest.fn().mockResolvedValue({
        public_id: 'test_public_id',
        secure_url: 'https://res.cloudinary.com/test/image/upload/test.jpg',
      }),
      destroy: jest.fn().mockResolvedValue({ result: 'ok' }),
    },
  },
}));

jest.mock('../../../core/utils/sendEmail.js', () => jest.fn().mockResolvedValue(true));

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn().mockResolvedValue({
      getPayload: () => ({
        email: 'google@example.com',
        name: 'Google User',
        picture: 'https://example.com/photo.jpg',
      }),
    }),
  })),
}));

import userService from '../user.service.js';
import User from '../user.model.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
const makeUser = (overrides = {}) => ({
  fullName: 'Test User',
  email: `test_${Date.now()}@example.com`,
  password: 'Password123!',
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UserService.loginUser', () => {
  it('throws INVALID_CREDENTIALS for unknown email', async () => {
    await expect(
      userService.loginUser('nobody@example.com', 'password')
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws INVALID_CREDENTIALS for wrong password', async () => {
    const data = makeUser();
    await User.create({ ...data, isVerified: true });

    await expect(
      userService.loginUser(data.email, 'WrongPassword!')
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('returns token + user for valid credentials', async () => {
    const data = makeUser();
    await User.create({ ...data, isVerified: true, role: 'USER' });

    const result = await userService.loginUser(data.email, data.password);

    expect(result).toHaveProperty('token');
    expect(result).toHaveProperty('rawRefreshToken');
    expect(result.user.email).toBe(data.email);
  });

  it('increments failedLoginAttempts on wrong password', async () => {
    const data = makeUser();
    await User.create({ ...data, isVerified: true });

    try {
      await userService.loginUser(data.email, 'wrong');
    } catch {}

    const updated = await User.findOne({ email: data.email });
    expect(updated.failedLoginAttempts).toBeGreaterThan(0);
  });

  it('throws ACCOUNT_LOCKED when account is locked', async () => {
    const data = makeUser();
    const lockUntil = new Date(Date.now() + 15 * 60 * 1000);
    await User.create({
      ...data,
      isVerified: true,
      lockoutUntil: lockUntil,
      failedLoginAttempts: 5,
    });

    await expect(
      userService.loginUser(data.email, data.password)
    ).rejects.toMatchObject({ statusCode: 423 });
  });
});

describe('UserService.updateStreak', () => {
  it('increments streak when last activity was yesterday', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const user = await User.create({
      ...makeUser(),
      isVerified: true,
      streak: { count: 3, lastActivity: yesterday },
    });

    const result = await userService.updateStreak(user._id);
    expect(result.streak.count).toBe(4);
  });

  it('resets streak to 1 when last activity was 2+ days ago', async () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const user = await User.create({
      ...makeUser(),
      isVerified: true,
      streak: { count: 10, lastActivity: twoDaysAgo },
    });

    const result = await userService.updateStreak(user._id);
    expect(result.streak.count).toBe(1);
  });

  it('does not increment streak when called twice on the same day', async () => {
    const user = await User.create({
      ...makeUser(),
      isVerified: true,
      streak: { count: 5, lastActivity: new Date() },
    });

    const result = await userService.updateStreak(user._id);
    expect(result.streak.count).toBe(5);
  });
});

describe('UserService.changePassword', () => {
  it('throws if old password is incorrect', async () => {
    const data = makeUser();
    const user = await User.create({ ...data, isVerified: true });

    await expect(
      userService.changePassword(user._id, 'wrong_old_password', 'NewPass123!')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('updates password hash when old password is correct', async () => {
    const data = makeUser();
    const user = await User.create({ ...data, isVerified: true });

    await userService.changePassword(user._id, data.password, 'NewPass123!');

    const updated = await User.findById(user._id).select('+password');
    const newHashValid = await bcrypt.compare('NewPass123!', updated.password);
    expect(newHashValid).toBe(true);
  });
});

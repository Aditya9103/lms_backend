/**
 * auth.middleware.js — Authentication & Authorization middleware.
 *
 * Exports:
 *  isLoggedIn          — Verifies access token from Authorization: Bearer header
 *  authorize(perm)     — Permission-based access control (replaces authorizeRoles over time)
 *  authorizeRoles(...) — Role-based access (legacy, kept for backward compat during migration)
 *  authorizeSubscribers— Checks active subscription for course access
 *  authorizeSuperAdmin — Shortcut for SUPER_ADMIN-only routes
 *  refreshAccessToken  — Handler: rotates refresh token, issues new access token
 *
 * See RBAC_MIGRATION.md for the authorizeRoles → authorize() migration status.
 */
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import userRepository from '../../modules/users/user.repository.js';
import AppError from '../utils/AppError.js';
import asyncHandler from './asyncHandler.middleware.js';
import logger from '../logger/logger.js';
import config from '../config/env.js';
import { RolePermissions } from '../../modules/permissions/permissions.constants.js';
import permissionService from '../../modules/permissions/permission.service.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Sets the refresh token as an httpOnly Secure SameSite cookie.
 * Call after issuing a new refresh token.
 */
export const setRefreshTokenCookie = (res, rawRefreshToken) => {
  res.cookie('refreshToken', rawRefreshToken, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: (config.REFRESH_TOKEN_EXPIRY_DAYS || 30) * 24 * 60 * 60 * 1000,
    path: '/',
  });
};

/**
 * Clears the refresh token cookie on logout.
 */
export const clearRefreshTokenCookie = (res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
  });
};

/**
 * Shared lockout check — called at the START of every login path
 * (password, OTP verify, Google). An attacker cannot bypass lockout
 * by switching login methods.
 *
 * @throws {AppError} 423 if the account is currently locked out
 */
export const checkLockout = (user) => {
  if (user.lockoutUntil && user.lockoutUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockoutUntil - Date.now()) / 60000);
    throw new AppError(
      `Account temporarily locked due to too many failed attempts. Try again in ${minutesLeft} minute(s).`,
      423
    );
  }
};

/**
 * Records a failed login attempt. Locks the account if MAX_FAILED_ATTEMPTS reached.
 * Returns the updated user (not saved — caller must call userRepository.save(user)).
 */
export const recordFailedAttempt = (user) => {
  user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
  if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
    user.lockoutUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
    logger.warn(`[Auth] Account locked: ${user.email} after ${user.failedLoginAttempts} failed attempts`);
  }
  return user;
};

/**
 * Resets failed attempts and lockout on successful authentication.
 */
export const resetFailedAttempts = (user) => {
  user.failedLoginAttempts = 0;
  user.lockoutUntil = null;
  return user;
};

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Verifies the short-lived access token from the Authorization: Bearer header.
 * Sets req.user = { id, role } on success.
 */
export const isLoggedIn = asyncHandler(async (req, _res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return next(new AppError('Unauthorized — no access token provided', 401));
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    req.user = decoded; // { id, role, iat, exp }
    next();
  } catch (error) {
    return next(new AppError(error.message, 401));
  }
});

/**
 * Permission-based authorization middleware (replaces authorizeRoles over time).
 *
 * Usage:
 *   router.post('/courses', isLoggedIn, authorize('course:create'), createCourse);
 *
 * Resource-scoped usage (e.g. co-instructor ownership check):
 *   router.put('/courses/:id', isLoggedIn, authorize('course:edit', isCourseInstructor), update);
 *
 * @param {string} permission - e.g. 'course:create'
 * @param {Function} [resourceCheck] - Optional async fn(req, user) that returns boolean.
 *   If provided, access is granted when EITHER the global permission OR the resource check passes.
 */
export const authorize = (permission, resourceCheck = null) =>
  asyncHandler(async (req, _res, next) => {
    // SUPER_ADMIN bypasses all permission checks
    if (req.user.role === 'SUPER_ADMIN') return next();

    // Fetch user once to get custom grants, then resolve effective permissions
    const user = await userRepository.findById(req.user.id);
    if (!user) return next(new AppError('User not found', 404));

    // Single source of truth: permissionService.getEffectivePermissions()
    const userPermissions = permissionService.getEffectivePermissions(
      user.role,
      user.permissions || []
    );

    const hasPermission = userPermissions.includes(permission);

    // Optional resource-scoped check (e.g. is co-instructor on this course)
    let passedResourceCheck = false;
    if (resourceCheck && !hasPermission) {
      passedResourceCheck = await resourceCheck(req, user);
    }

    if (!hasPermission && !passedResourceCheck) {
      logger.warn(
        `[Auth] Forbidden: ${req.user.id} (${req.user.role}) missing '${permission}' on ${req.method} ${req.path}`
      );
      return next(new AppError(`Forbidden — you lack the '${permission}' permission`, 403));
    }

    next();
  });

/**
 * Legacy role-based check. Kept during migration to authorize().
 * RBAC_MIGRATION.md tracks which routes still use this.
 */
export const authorizeRoles = (...roles) =>
  asyncHandler(async (req, _res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to access this route', 403));
    }
    next();
  });

/**
 * Checks active subscription for course content access.
 * ADMIN and SUPER_ADMIN bypass subscription requirement.
 */
export const authorizeSubscribers = asyncHandler(async (req, _res, next) => {
  const user = await userRepository.findById(req.user.id);
  if (!user) return next(new AppError('User not found', 404));

  const isPrivileged = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  const hasActiveSubscription = user.subscription?.status === 'active';

  if (!isPrivileged && !hasActiveSubscription) {
    return next(new AppError('Please subscribe to access course content.', 403));
  }

  next();
});

export const authorizeSuperAdmin = asyncHandler(async (req, _res, next) => {
  if (req.user.role !== 'SUPER_ADMIN') {
    return next(new AppError('Access denied. Super Admin only.', 403));
  }
  next();
});

// ── Refresh Token Handler ─────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/refresh
 *
 * Validates the incoming refresh token from the httpOnly cookie.
 * Implements refresh token rotation with reuse detection:
 *  - If the token is valid → revoke old, issue new pair (access + refresh).
 *  - If the token was already used/revoked → REUSE DETECTED: revoke ALL tokens
 *    for this user (sign of token theft) and return 401.
 *
 * The frontend should call this when the API returns 401 TOKEN_EXPIRED
 * and then retry the original request.
 */
export const refreshAccessToken = asyncHandler(async (req, res, next) => {
  const rawRefreshToken = req.cookies?.refreshToken;

  if (!rawRefreshToken) {
    return next(new AppError('No refresh token provided', 401));
  }

  // Look up by token hash — only returns non-revoked, non-expired tokens
  const user = await userRepository.findByRefreshToken(rawRefreshToken);

  if (!user) {
    // Check if the token hash exists at all (even revoked) to detect reuse
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const possibleUser = await userRepository.findOne?.({
      'refreshTokens.tokenHash': tokenHash,
    });

    if (possibleUser) {
      // REUSE DETECTED: a previously-rotated token was replayed — likely theft
      logger.error(`[Auth] Refresh token REUSE DETECTED for user ${possibleUser._id}. Revoking all sessions.`);
      await userRepository.revokeAllRefreshTokens(possibleUser._id);
      clearRefreshTokenCookie(res);
      return next(new AppError('Security alert: invalid session. Please log in again.', 401));
    }

    clearRefreshTokenCookie(res);
    return next(new AppError('Invalid or expired refresh token', 401));
  }

  // Rotate: revoke old token, issue new pair
  await userRepository.revokeRefreshToken(user._id, rawRefreshToken);

  const newAccessToken = await user.generateJWTToken();
  const newRefreshToken = user.generateRefreshToken(
    req.headers['user-agent'] || 'unknown'
  );
  await userRepository.save(user);

  setRefreshTokenCookie(res, newRefreshToken);

  logger.info(`[Auth] Tokens rotated for user ${user._id}`);

  return res.status(200).json({
    success: true,
    data: {
      accessToken: newAccessToken,
      user: {
        id: user._id,
        role: user.role,
        fullName: user.fullName,
        email: user.email,
      },
    },
  });
});

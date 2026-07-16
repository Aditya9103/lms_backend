/**
 * permission.service.js — RBAC permission resolution service
 *
 * Responsibilities:
 *  1. getUserPermissions(userId) — resolves effective permissions for a user
 *     by merging role defaults with any custom per-user grants stored on the
 *     user document. This is the single source of truth for the authorize()
 *     middleware.
 *
 *  2. seedDefaultPermissions(userId, role) — on admin creation, seeds the
 *     user's `permissions` array with the default set for their role. This
 *     ensures newly created admins have consistent permissions without
 *     requiring a separate admin action.
 *
 *  3. grantPermission / revokePermission — granular overrides managed by
 *     SUPER_ADMIN. Allow one-off permission grants (e.g. a USER who needs
 *     BLOG_MODERATE for a specific community initiative).
 *
 * Note: SUPER_ADMIN bypasses all permission checks in the authorize()
 * middleware — these services are not called for SUPER_ADMIN users.
 */
import userRepository from '../users/user.repository.js';
import AppError from '../../core/utils/AppError.js';
import { RolePermissions, Permissions } from './permissions.constants.js';
import logger from '../../core/logger/logger.js';

class PermissionService {
  /**
   * Returns the full set of effective permissions for a user.
   *
   * Effective permissions = role defaults ∪ custom user grants
   *
   * The result is deduplicated. This is called by the authorize() middleware
   * for non-SUPER_ADMIN users.
   *
   * @param {string} userId
   * @param {string} role - from the JWT payload (avoids a DB hit when possible)
   * @param {string[]} [customGrants] - from the user doc (pass in if already loaded)
   * @returns {string[]} Sorted, deduplicated permission strings
   */
  getEffectivePermissions(role, customGrants = []) {
    const roleDefaults = RolePermissions[role] || [];
    return [...new Set([...roleDefaults, ...customGrants])].sort();
  }

  /**
   * Fetches the user from DB and computes their effective permissions.
   * Use this when you need to resolve permissions outside the request cycle
   * (e.g. in background jobs).
   *
   * @param {string} userId
   * @returns {Promise<string[]>}
   */
  async getUserPermissions(userId) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);
    return this.getEffectivePermissions(user.role, user.permissions || []);
  }

  /**
   * Seeds the user's `permissions` array with their role's default set.
   * Call this when creating a new admin account (in adminOtpSignup, etc.)
   * to ensure their permissions are explicitly stored for auditability.
   *
   * Idempotent: safe to call on an existing user — only adds missing defaults.
   *
   * @param {string} userId
   * @param {string} role - 'ADMIN' | 'USER' | 'SUPER_ADMIN'
   */
  async seedDefaultPermissions(userId, role) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    const defaults = RolePermissions[role] || [];
    const existing = new Set(user.permissions || []);
    const toAdd = defaults.filter((p) => !existing.has(p));

    if (toAdd.length === 0) {
      logger.debug(`[Permissions] No new defaults to seed for user ${userId} (role: ${role})`);
      return;
    }

    user.permissions = [...existing, ...toAdd];
    await userRepository.save(user);
    logger.info(`[Permissions] Seeded ${toAdd.length} default permissions for user ${userId} (role: ${role})`);
  }

  /**
   * Grants a specific custom permission to a user.
   * Caller must be SUPER_ADMIN (enforced at the route level).
   *
   * @param {string} targetUserId - user to grant permission to
   * @param {string} permission - must be a valid key from Permissions
   * @param {string} grantedBy - userId of the SUPER_ADMIN granting
   */
  async grantPermission(targetUserId, permission, grantedBy) {
    if (!Object.values(Permissions).includes(permission)) {
      throw new AppError(`Unknown permission: '${permission}'`, 400);
    }

    const user = await userRepository.findById(targetUserId);
    if (!user) throw new AppError('Target user not found', 404);

    if (!user.permissions.includes(permission)) {
      user.permissions.push(permission);
      await userRepository.save(user);
      logger.info(`[Permissions] Granted '${permission}' to user ${targetUserId} by ${grantedBy}`);
    }
  }

  /**
   * Revokes a specific custom permission from a user.
   * Caller must be SUPER_ADMIN (enforced at the route level).
   *
   * Note: This only removes custom grants. Role-default permissions are
   * NOT removed (they live in RolePermissions, not the user document).
   * To fully restrict a role-default permission, the user's role must change.
   *
   * @param {string} targetUserId
   * @param {string} permission
   * @param {string} revokedBy - userId of the SUPER_ADMIN revoking
   */
  async revokePermission(targetUserId, permission, revokedBy) {
    const user = await userRepository.findById(targetUserId);
    if (!user) throw new AppError('Target user not found', 404);

    const before = user.permissions.length;
    user.permissions = user.permissions.filter((p) => p !== permission);
    const removed = before - user.permissions.length;

    if (removed > 0) {
      await userRepository.save(user);
      logger.info(`[Permissions] Revoked '${permission}' from user ${targetUserId} by ${revokedBy}`);
    }
  }
}

export default new PermissionService();

/**
 * rbac.middleware.js — Role-Based & Permission-Based Access Control Middleware Bridge.
 *
 * Re-exports core authorization guards from auth.middleware.js for
 * modular imports across all route definitions.
 */
export {
  authorize,
  authorizeRoles,
  authorizeSuperAdmin,
  authorizeSubscribers,
} from './auth.middleware.js';

/**
 * Canonical permission registry.
 *
 * All permission strings are defined here as frozen constants.
 * Code that checks or grants permissions should import from this file
 * rather than using raw strings.
 *
 * Format: `<resource>:<action>`
 */
export const Permissions = Object.freeze({
  // Courses
  COURSE_CREATE: 'course:create',
  COURSE_EDIT: 'course:edit',
  COURSE_DELETE: 'course:delete',
  COURSE_PUBLISH: 'course:publish',
  COURSE_VIEW_ALL: 'course:view_all',
  COURSE_GRADE: 'course:grade',       // Phase 5 — grade assignment submissions
  COURSE_VIEW_DRAFT: 'course:view_draft', // Phase 5 — view unpublished courses

  // Users
  USER_BAN: 'user:ban',
  USER_VIEW: 'user:view',
  USER_MANAGE: 'user:manage',

  // Grades
  GRADE_ASSIGN: 'grade:assign',

  // Payments
  PAYMENT_REFUND: 'payment:refund',
  PAYMENT_VIEW: 'payment:view',

  // Admin management
  ADMIN_MANAGE: 'admin:manage',

  // Content moderation
  BLOG_MODERATE: 'blog:moderate',
  DISCUSSION_MODERATE: 'discussion:moderate',

  // Notifications
  NOTIFICATION_MANAGE: 'notification:manage',
});

/**
 * Default permission sets per role.
 * SUPER_ADMIN bypasses permission checks entirely (see authorize middleware).
 */
export const RolePermissions = Object.freeze({
  ADMIN: [
    Permissions.COURSE_CREATE,
    Permissions.COURSE_EDIT,
    Permissions.COURSE_DELETE,
    Permissions.COURSE_PUBLISH,
    Permissions.COURSE_VIEW_ALL,
    Permissions.COURSE_GRADE,
    Permissions.COURSE_VIEW_DRAFT,
    Permissions.GRADE_ASSIGN,
    Permissions.USER_VIEW,
    Permissions.BLOG_MODERATE,
    Permissions.DISCUSSION_MODERATE,
  ],
  USER: [],
  SUPER_ADMIN: Object.values(Permissions), // All permissions
});


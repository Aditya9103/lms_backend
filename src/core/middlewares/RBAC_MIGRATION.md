# RBAC Migration Status

> **Exit Criterion for Phase 2:** Zero routes reference `authorizeRoles` outside
> the documented exceptions in this table, with each exception having an explicit
> owner phase.

## Status: IN PROGRESS (Phase 2 closed with documented exceptions below)

`authorizeRoles` is the legacy role-based check. The new `authorize(permission)`
middleware is permission-based and supports resource-scoped checks.
See `permissions.constants.js` for the full permission registry.

---

## Open Exceptions — All `authorizeRoles` Calls (as of Phase 2)

| File | Route | Uses | Target Phase |
|---|---|---|---|
| `user.routes.js` | `PUT /assignment/grade` | `authorizeRoles('ADMIN', 'SUPER_ADMIN')` | Phase 3 cleanup |
| `course.routes.js` | All admin course routes (8 routes) | `authorizeRoles('ADMIN')` | Phase 3 cleanup |
| `blogs/blog.routes.js` | `POST /` and `DELETE /:id` | `authorizeRoles('ADMIN')` | Phase 3 cleanup |
| `payments/payment.routes.js` | `GET /` (all payments, admin) | `authorizeRoles('ADMIN')` | Phase 7 (payments phase) |
| `miscellaneous/miscellaneous.routes.js` | `GET /` (user stats) | `authorizeRoles('ADMIN')` | Phase 3 cleanup |

**Total open exceptions: ~12 route-level usages across 5 files.**

Modules NOT yet audited (no routes file found for these yet):
- Discussion routes (not yet implemented)
- Super admin dedicated routes (if any, beyond the user.routes.js entries)
- Dashboard routes (if any dedicated route file exists)

---

## Migration Target

```js
// Before:
router.post('/courses', isLoggedIn, authorizeRoles('ADMIN'), createCourse);

// After:
router.post('/courses', isLoggedIn, authorize(Permissions.COURSE_CREATE), createCourse);

// With optional resource-scoped check (e.g. course co-instructor):
const isCourseOwner = async (req, user) => {
  const course = await Course.findById(req.params.id).select('instructors');
  return course?.instructors?.some(id => id.toString() === user._id.toString());
};
router.put('/courses/:id', isLoggedIn, authorize(Permissions.COURSE_EDIT, isCourseOwner), update);
```

---

## Routes Already Using `authorize()` (new pattern)

*None yet — migration begins in Phase 3 as part of the test/CI pass.*

---

## Completed Migrations

*(none yet — this log will be updated as each file is migrated)*

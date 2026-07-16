/**
 * Database Index Creation Script
 *
 * Run as a ONE-TIME deploy-time step (NOT at application boot).
 * This script is idempotent — safe to re-run; MongoDB skips existing indexes.
 *
 * Usage:
 *   node scripts/create-indexes.js
 *
 * CD Pipeline: run this BEFORE deploying the new API container so indexes
 * exist before the new query patterns hit production.
 *
 * IMPORTANT: On large collections, index builds can be resource-intensive.
 * MongoDB 4.2+ builds indexes with minimal locking by default (equivalent
 * to the old `background: true` option). Monitor the build in Atlas or
 * via `db.currentOp()` during the first deploy to a populated production DB.
 *
 * ── HOW TO ADD NEW INDEXES ────────────────────────────────────────────────────
 * Each phase that introduces a new query pattern adds its indexes here.
 * Do NOT defer index creation to app boot code in server.js or app.js.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import '../src/core/config/env.js';
import mongoose from 'mongoose';
import config from '../src/core/config/env.js';

const createIndexes = async () => {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(config.MONGO_URI);
  console.log('Connected. Creating indexes...\n');

  const db = mongoose.connection.db;

  // ── Users collection ─────────────────────────────────────────────────────────
  const users = db.collection('users');
  await users.createIndex({ email: 1 }, { unique: true, name: 'idx_users_email_unique' });
  await users.createIndex({ 'progress.courseId': 1, _id: 1 }, { name: 'idx_users_progress_courseId' });
  await users.createIndex({ 'subscription.status': 1 }, { name: 'idx_users_subscription_status' });
  await users.createIndex({ role: 1 }, { name: 'idx_users_role' });
  console.log('✓ users indexes');

  // ── Courses collection ────────────────────────────────────────────────────────
  // Added in Phase 5 when deletedAt and status fields are added
  // (Appended here now per refinement 2.5 — index script lives in Phase 1, updated per phase)
  const courses = db.collection('courses');
  await courses.createIndex({ category: 1, status: 1 }, { name: 'idx_courses_category_status' });
  await courses.createIndex({ deletedAt: 1, status: 1 }, { sparse: true, name: 'idx_courses_deleted_status' });
  await courses.createIndex({ createdAt: -1 }, { name: 'idx_courses_createdAt' });
  console.log('✓ courses indexes');

  // ── Payments collection ───────────────────────────────────────────────────────
  const payments = db.collection('payments');
  await payments.createIndex({ razorpay_payment_id: 1 }, { unique: true, sparse: true, name: 'idx_payments_razorpay_id' });
  await payments.createIndex({ razorpay_subscription_id: 1 }, { name: 'idx_payments_subscription_id' });
  await payments.createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true, name: 'idx_payments_idempotency' });
  console.log('✓ payments indexes');

  // ── ActivityLog collection ────────────────────────────────────────────────────
  const activityLogs = db.collection('activitylogs');
  await activityLogs.createIndex({ userId: 1, createdAt: -1 }, { name: 'idx_activitylog_user_date' });
  await activityLogs.createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: 180 * 24 * 60 * 60, name: 'idx_activitylog_ttl' } // 180 days TTL
  );
  console.log('✓ activitylogs indexes');

  // ── AuditLog collection ───────────────────────────────────────────────────────
  const auditLogs = db.collection('auditlogs');
  await auditLogs.createIndex({ performedBy: 1, createdAt: -1 }, { name: 'idx_auditlog_actor_date' });
  await auditLogs.createIndex({ entity: 1, entityId: 1 }, { name: 'idx_auditlog_entity' });
  console.log('✓ auditlogs indexes');

  // ── Notifications collection (Phase 6 — added here preemptively) ──────────────
  const notifications = db.collection('notifications');
  await notifications.createIndex({ userId: 1, read: 1, createdAt: -1 }, { name: 'idx_notifications_user_unread' });
  await notifications.createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: 90 * 24 * 60 * 60, name: 'idx_notifications_ttl' } // 90 days TTL
  );
  console.log('✓ notifications indexes');

  // ── Blogs collection ──────────────────────────────────────────────────────────
  const blogs = db.collection('blogs');
  await blogs.createIndex({ slug: 1 }, { unique: true, sparse: true, name: 'idx_blogs_slug' });
  await blogs.createIndex({ status: 1, createdAt: -1 }, { name: 'idx_blogs_status_date' });
  console.log('✓ blogs indexes');

  console.log('\n✅  All indexes created successfully.');
  await mongoose.disconnect();
};

createIndexes().catch((err) => {
  console.error('❌  Index creation failed:', err.message);
  process.exit(1);
});

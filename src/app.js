/**
 * app.js — Express application setup.
 *
 * Middleware mounting order matters:
 *  1. requestId — must be FIRST (sets correlation ID for all subsequent logs)
 *  2. Security headers (helmet) — as early as possible
 *  3. CORS
 *  4. Body parsers
 *  5. Routes
 *  6. 404 handler
 *  7. Error middleware — must be LAST
 */
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import requestIdMiddleware from './core/middlewares/requestId.middleware.js';
import errorMiddleware from './core/middlewares/error.middleware.js';
import { helmetMiddleware, sanitizeMiddleware } from './core/security/security.middleware.js';
import { apiLimiter, refreshLimiter } from './core/middlewares/rateLimiter.middleware.js';
import { refreshAccessToken } from './core/middlewares/auth.middleware.js';
import logger from './core/logger/logger.js';
import config from './core/config/env.js';
import { metricsMiddleware, metricsRouter } from './core/middlewares/metrics.middleware.js';
import { initSentry } from './core/config/sentry.js';
import webhookHandler from './modules/payments/webhook.controller.js'; // Phase 7 — must be top-level
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './core/docs/swagger.js';

// Initialise Sentry as early as possible (no-op if SENTRY_DSN is absent)
initSentry();

const app = express();

// ─── 1. Correlation ID (must be first) ─────────────────────────────────────────────
app.use(requestIdMiddleware);

// ─── 1b. Prometheus HTTP metrics ──────────────────────────────────────────
app.use(metricsMiddleware);
app.use(metricsRouter);

// ─── 2. Security headers (Helmet) ─────────────────────────────────────────────
app.use(helmetMiddleware);

// ─── 3. CORS ──────────────────────────────────────────────────────────────────
const configuredOrigins = (config.FRONTEND_URL || '')
  .split(',')
  .map((url) => url.trim().replace(/\/$/, ''))
  .filter(Boolean);

const allowedOrigins = [
  ...configuredOrigins,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, curl)
      if (!origin) return callback(null, true);
      const normalized = origin.replace(/\/$/, '');
      if (allowedOrigins.includes(normalized)) return callback(null, true);
      logger.warn(`[CORS] Blocked request from: ${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);

// ─── 4. Body parsers ──────────────────────────────────────────────────────────
// Phase 7: Webhook route is registered BEFORE express.json() with express.raw()
// so Razorpay's HMAC signature verification receives the original Buffer.
// express.json() would parse and discard the raw body, breaking HMAC.
app.post(
  '/api/v1/payments/webhook',
  express.raw({ type: 'application/json' }),
  webhookHandler
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── 5. NoSQL injection sanitization ─────────────────────────────────────────
// Must run AFTER body parsers (needs req.body to exist)
app.use(sanitizeMiddleware);

// ─── 6. HTTP request logging (Morgan → Winston) ────────────────────────────────
app.use(
  morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
    skip: (req) => req.url === '/health' || req.url === '/ready',
  })
);

// ─── 7. Global rate limiting ──────────────────────────────────────────────────
// Applied to all /api/v1 routes. Auth-specific tighter limits are applied
// per-route in user.routes.js (authLimiter).
app.use('/api/v1', apiLimiter);

// ─── 8. Refresh token endpoint ────────────────────────────────────────────────
// Registered separately (not under /user router) to keep auth infrastructure
// at the top level and avoid circular import issues.
/**
 * @openapi
 * /api/v1/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Rotate refresh token and issue new access token
 *     description: Reads refreshToken from httpOnly cookie. Returns new accessToken in body and rotates the httpOnly cookie.
 */
app.post('/api/v1/auth/refresh', refreshLimiter, refreshAccessToken);

// ─── 9. Health & Readiness endpoints ─────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ─── 9.1 API Documentation (Swagger / OpenAPI) ───────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/docs', (_req, res) => res.redirect('/api-docs'));
app.get('/api-docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

app.get('/ready', async (_req, res) => {
  const checks = {};
  let allOk = true;

  // MongoDB check
  try {
    const mongoose = await import('mongoose');
    checks.mongo = mongoose.default.connection.readyState === 1 ? 'ok' : 'unavailable';
    if (checks.mongo !== 'ok') allOk = false;
  } catch {
    checks.mongo = 'error';
    allOk = false;
  }

  // Redis check
  try {
    const { redisClient } = await import('./core/cache/redis.js');
    await redisClient.ping();
    checks.redis = 'ok';
  } catch {
    checks.redis = 'unavailable';
    allOk = false;
  }

  // BullMQ check (if queues are configured)
  try {
    const { Queue } = await import('bullmq');
    const { redisClient } = await import('./core/cache/redis.js');
    // Ping via a minimal queue connection
    const pingQueue = new Queue('__health_ping__', {
      connection: redisClient,
      skipVersionCheck: true,
    });
    // Swallow internal BullMQ errors so they don't leak as unhandled events
    pingQueue.on('error', () => { });
    await pingQueue.getJobCounts();
    await pingQueue.close();
    checks.bullmq = 'ok';
  } catch {
    // BullMQ is not critical — degraded but still serviceable
    checks.bullmq = 'unavailable';
  }

  res.status(allOk ? 200 : 503).json({ status: allOk ? 'ready' : 'not ready', checks });
});

// ─── 6. API Routes ────────────────────────────────────────────────────────────
import userRoutes from './modules/users/user.routes.js';
import courseRoutes from './modules/courses/course.routes.js';
import paymentRoutes from './modules/payments/payment.routes.js';
import miscRoutes from './modules/miscellaneous/miscellaneous.routes.js';
import discussionRoutes from './modules/discussions/discussion.routes.js';
import blogRoutes from './modules/blogs/blog.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import interactionRoutes from './modules/interactions/interaction.routes.js';
import superAdminRoutes from './modules/superAdmin/superAdmin.routes.js';
import notificationRoutes from './modules/notifications/notification.routes.js';

app.use('/api/v1/user', userRoutes);
app.use('/api/v1/courses', courseRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/discussions', discussionRoutes);
app.use('/api/v1/blogs', blogRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/interaction', interactionRoutes);
app.use('/api/v1/super-admin', superAdminRoutes);
app.use('/api/v1/notifications', notificationRoutes); // Phase 6
app.use('/api/v1', miscRoutes);

// ─── 7. 404 ───────────────────────────────────────────────────────────────────
app.all('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
});

// ─── 8. Centralized error handler (must be last) ──────────────────────────────
app.use(errorMiddleware);

export default app;

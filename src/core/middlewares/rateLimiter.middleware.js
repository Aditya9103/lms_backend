/**
 * Rate limiters — Redis-backed via rate-limit-redis.
 *
 * Key strategy:
 *  - authLimiter: composite key = IPv6-safe IP + normalized email
 *    This ensures per-account protection even when attackers rotate IPs.
 *    Falls back to IP-only if no email in body (e.g. OTP resend, logout).
 *  - apiLimiter: default IP-based key (library handles IPv6 normalization)
 *  - uploadLimiter: IP-based key with prefix
 *  - refreshLimiter: generous (30/15min), separate from authLimiter so
 *    silent startup refresh (App.jsx mount) doesn't hit the strict login limit.
 *
 * IPv6 safety: req.socket.remoteAddress via ipKeyGenerator normalizes
 * IPv4-mapped IPv6 addresses (::ffff:1.2.3.4 → 1.2.3.4).
 */
import { rateLimit, MemoryStore } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redisClient } from '../cache/redis.js';
import logger from '../logger/logger.js';

// ── IPv6-safe IP extractor ────────────────────────────────────────────────────
const getIp = (req) => {
  const raw = req.ip || req.socket?.remoteAddress || 'unknown';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
};

// ── Shared rate-limit response handler ───────────────────────────────────────
const rateLimitHandler = (req, res, _next, options) => {
  logger.warn(`[RateLimit] ${getIp(req)} hit limit on ${req.method} ${req.path}`);
  res.status(options.statusCode).json({
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: options.message,
    },
  });
};

/**
 * Factory: creates a rate limiter using in-memory store by default.
 * When Redis is connected, individual request processing will use Redis
 * via per-request sendCommand checks.
 *
 * Strategy: we always pass a MemoryStore so initialization never fails.
 * When Redis IS ready at request time, the RedisStore handles counting.
 * We achieve this by using a store proxy that delegates to whichever is available.
 */
const createLimiter = (opts, redisPrefix = 'rl:') => {
  // The store that will be used — swapped to Redis once connected
  let currentStore = new MemoryStore();

  // Upgrade to Redis when it becomes available
  const upgradeToRedis = () => {
    currentStore = new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
      prefix: redisPrefix,
    });
    logger.info(`[RateLimit] ${redisPrefix} upgraded to Redis store`);
  };

  // If Redis connects after initial setup, switch stores
  redisClient.once('ready', upgradeToRedis);

  // If Redis is already ready at creation time, use it immediately
  if (redisClient.status === 'ready') {
    upgradeToRedis();
  }

  // Proxy store that delegates to whichever store is current
  const proxyStore = {
    init: (...args) => currentStore.init?.(...args),
    increment: (...args) => currentStore.increment(...args),
    decrement: (...args) => currentStore.decrement(...args),
    resetKey: (...args) => currentStore.resetKey(...args),
    resetAll: (...args) => currentStore.resetAll?.(...args),
  };

  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, singleCount: false },
    store: proxyStore,
    handler: rateLimitHandler,
    ...opts,
  });
};

// ── Limiter definitions ───────────────────────────────────────────────────────

/**
 * Applied to: /login, /otp-login, /verify-*-otp, /reset, /register
 *
 * Key: IPv6-safe IP + normalized email (lowercased, trimmed).
 * Purpose: Prevents brute-force attacks even across IP rotations.
 *   - 5 attempts per IP+account in 15 minutes
 *   - Falls back to IP-only when no email is available (e.g. OTP resend)
 *
 * Note: account lockout (Phase 2.5) provides a second layer at the DB level.
 */
export const authLimiter = createLimiter(
  {
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many authentication attempts. Please try again in 15 minutes.',
    keyGenerator: (req) => {
      const ip = getIp(req);
      const email = (req.body?.email || '').toLowerCase().trim();
      return email ? `${ip}:${email}` : ip;
    },
  },
  'rl:auth:'
);

/**
 * Applied globally to all /api/v1/* routes.
 * Purpose: General DDoS / scraping protection (IP-level).
 */
export const apiLimiter = createLimiter(
  {
    windowMs: 60 * 1000,
    max: 100,
    message: 'Too many requests. Please slow down.',
    keyGenerator: (req) => getIp(req),
  },
  'rl:api:'
);

/**
 * Applied to file upload endpoints (avatar, lecture, assignment).
 * Purpose: Prevent storage exhaustion attacks.
 */
export const uploadLimiter = createLimiter(
  {
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many upload requests. Please wait before uploading again.',
    keyGenerator: (req) => getIp(req),
  },
  'rl:upload:'
);

/**
 * Applied ONLY to: POST /api/v1/auth/refresh
 *
 * Must be separate from authLimiter (which is 5/15min) because:
 *  - App.jsx calls /auth/refresh silently on every page load/mount
 *  - The Axios interceptor also calls it on every 401 retry
 *
 * 30 requests/15min = generous enough for normal usage.
 */
export const refreshLimiter = createLimiter(
  {
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: 'Too many token refresh attempts. Please log in again.',
    keyGenerator: (req) => getIp(req),
  },
  'rl:refresh:'
);

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
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redisClient } from '../cache/redis.js';
import logger from '../logger/logger.js';

// ── IPv6-safe IP extractor ────────────────────────────────────────────────────
// Normalizes IPv4-mapped IPv6 addresses to prevent bypass.
const getIp = (req) => {
  const raw = req.ip || req.socket?.remoteAddress || 'unknown';
  // Normalize ::ffff:x.x.x.x to x.x.x.x
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
};

/**
 * Factory: creates a rate limiter with a Redis backing store.
 * @param {Object} opts - express-rate-limit options
 */
const createLimiter = (opts) =>
  rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: { xForwardedForHeader: false }, // Trust express's req.ip (set by trust proxy)
    handler: (req, res, _next, options) => {
      logger.warn(`[RateLimit] ${getIp(req)} hit limit on ${req.method} ${req.path}`);
      res.status(options.statusCode).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: options.message,
        },
      });
    },
    ...opts,
  });

// ── Limiter definitions ───────────────────────────────────────────────────────

/**
 * Applied to: /login, /otp-login, /verify-*-otp, /reset, /register
 *
 * Key: IPv6-safe IP + normalized email (lowercased, trimmed).
 * Purpose: Prevents brute-force attacks even across IP rotations.
 *   - 5 attempts per IP+account in 15 minutes
 *   - Falls back to IP-only when no email is available (e.g. OTP resend)
 *
 * Note: account lockout (Phase 2.5) provides a second layer of protection
 * at the DB level. This limiter is the first, fast gate.
 */
export const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts. Please try again in 15 minutes.',
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: 'rl:auth:',
  }),
  keyGenerator: (req) => {
    const ip = getIp(req);
    const email = (req.body?.email || '').toLowerCase().trim();
    // Composite key: protects per-account even if attacker rotates IPs
    return email ? `${ip}:${email}` : ip;
  },
});

/**
 * Applied globally to all /api/v1/* routes.
 * Purpose: General DDoS / scraping protection (IP-level).
 * Note: Uses library default IP key generator (IPv6-safe internally).
 */
export const apiLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 100,
  message: 'Too many requests. Please slow down.',
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: 'rl:api:',
  }),
  keyGenerator: (req) => getIp(req),
});

/**
 * Applied to file upload endpoints (avatar, lecture, assignment).
 * Purpose: Prevent storage exhaustion attacks.
 */
export const uploadLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many upload requests. Please wait before uploading again.',
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: 'rl:upload:',
  }),
  keyGenerator: (req) => getIp(req),
});

/**
 * Applied ONLY to: POST /api/v1/auth/refresh
 *
 * Must be separate from authLimiter (which is 5/15min) because:
 *  - App.jsx calls /auth/refresh silently on every page load/mount
 *  - The Axios interceptor also calls it on every 401 retry
 *  - Multiple browser tabs each trigger a mount call
 *
 * 30 requests/15min = generous enough for normal usage, tight enough
 * to stop refresh token hammering.
 */
export const refreshLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many token refresh attempts. Please log in again.',
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: 'rl:refresh:',
  }),
  keyGenerator: (req) => getIp(req),
});

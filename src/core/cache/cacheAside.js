/**
 * cacheAside.js — Phase 8 cache-aside pattern helper.
 *
 * Usage:
 *   const data = await cacheAside(
 *     'courses:catalog:page=1:limit=10',
 *     () => courseRepository.findPublished({ page: 1, limit: 10 }),
 *     { ttl: 300 }               // seconds; default 5 min
 *   );
 *
 * Graceful degradation: if Redis is unavailable, the loader function is
 * called directly and the result is returned without caching.
 *
 * Invalidation helpers:
 *   await cacheInvalidate('courses:catalog:*');   // pattern-based
 *   await cacheInvalidateKey('courses:detail:abc123');
 */

import { getAsync, setAsync, delAsync } from './redis.js';
import redisClient from './redis.js';
import logger from '../logger/logger.js';

const DEFAULT_TTL = 300; // 5 minutes

/**
 * Cache-aside (lazy-loading) helper.
 *
 * @param {string} key          — Redis cache key
 * @param {() => Promise<*>} loader — async function to fetch fresh data
 * @param {{ ttl?: number, parse?: boolean }} opts
 * @returns {Promise<*>}        — cached or freshly loaded value
 */
export const cacheAside = async (key, loader, { ttl = DEFAULT_TTL } = {}) => {
  // 1. Try cache
  try {
    const cached = await getAsync(key);
    if (cached !== null) {
      logger.debug(`[Cache] HIT: ${key}`);
      return JSON.parse(cached);
    }
  } catch {
    // Redis unavailable — fall through to loader
  }

  // 2. Cache miss — call loader
  logger.debug(`[Cache] MISS: ${key}`);
  const fresh = await loader();

  // 3. Populate cache (fire-and-forget, never block the request)
  if (fresh !== null && fresh !== undefined) {
    setAsync(key, fresh, ttl).catch((err) =>
      logger.warn(`[Cache] SET failed for ${key}`, { error: err.message })
    );
  }

  return fresh;
};

/**
 * Invalidate a single exact cache key.
 */
export const cacheInvalidateKey = async (key) => {
  try {
    await delAsync(key);
    logger.debug(`[Cache] INVALIDATED: ${key}`);
  } catch (err) {
    logger.warn(`[Cache] DEL failed for ${key}`, { error: err.message });
  }
};

/**
 * Invalidate all keys matching a glob pattern.
 * Scans with SCAN to avoid blocking Redis on large keyspaces.
 *
 * @param {string} pattern — e.g. 'courses:catalog:*'
 */
export const cacheInvalidate = async (pattern) => {
  try {
    const keys = [];
    let cursor = '0';
    do {
      const [nextCursor, found] = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      keys.push(...found);
    } while (cursor !== '0');

    if (keys.length === 0) return;
    await redisClient.del(...keys);
    logger.info(`[Cache] INVALIDATED ${keys.length} key(s) matching: ${pattern}`);
  } catch (err) {
    logger.warn(`[Cache] Pattern invalidation failed for ${pattern}`, { error: err.message });
  }
};

// ── TTL constants ──────────────────────────────────────────────────────────────
export const TTL = Object.freeze({
  COURSE_CATALOG:  5 * 60,     // 5 min  — public, high-traffic, changes rarely
  COURSE_DETAIL:   10 * 60,    // 10 min — enrolled users; invalidate on publish/update
  DASHBOARD_STATS: 2 * 60,     // 2 min  — admin stats; staleness acceptable
  USER_PROFILE:    15 * 60,    // 15 min — user data; invalidate on profile update
  NOTIFICATIONS:   1 * 60,     // 1 min  — short TTL; real-time socket is primary
});

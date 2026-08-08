/**
 * Redis client (ioredis).
 *
 * Single shared client exported for use by:
 *  - Rate limiter (Phase 2)
 *  - Socket.IO Redis adapter (Phase 6)
 *  - BullMQ queue/worker connections (Phase 6/7)
 *  - Cache-aside helper (Phase 8)
 *
 * Configured with automatic reconnect and exponential back-off.
 * Logs connection state changes so Redis outages are visible in
 * structured logs rather than silently degrading the app.
 */
import Redis from 'ioredis';
import logger from '../logger/logger.js';
import config from '../config/env.js';

const createRedisClient = () => {
  const isDev = config.NODE_ENV === 'development';
  const MAX_DEV_RETRIES = 10;

  const client = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
    retryStrategy(times) {
      // In development, stop retrying after MAX_DEV_RETRIES to avoid log spam
      if (isDev && times > MAX_DEV_RETRIES) {
        logger.warn(`[Redis] Giving up after ${MAX_DEV_RETRIES} attempts. Start Redis to enable caching and rate-limiting.`);
        return null; // null = stop retrying
      }
      const delay = Math.min(times * 200, 5000);
      logger.warn(`[Redis] Connection retry attempt ${times}, next in ${delay}ms`);
      return delay;
    },
    lazyConnect: true,
  });

  client.on('connect', () => logger.info('[Redis] Connected'));
  client.on('ready', () => logger.info('[Redis] Ready'));
  // 'error' fires on every failed attempt — retryStrategy already logs the attempt count.
  // Log at debug only so the terminal isn't flooded during normal dev without Redis.
  client.on('error', (err) => logger.debug('[Redis] Connection error', { error: err.message }));
  client.on('close', () => logger.debug('[Redis] Connection closed'));
  client.on('reconnecting', () => logger.debug('[Redis] Reconnecting...'));
  client.on('end', () => logger.warn('[Redis] Connection permanently closed (all retries exhausted)'));

  return client;
};

export const redisClient = createRedisClient();

/**
 * Convenience helpers — thin wrappers that add error logging.
 */
export const getAsync = async (key) => {
  try {
    return await redisClient.get(key);
  } catch (err) {
    logger.error('[Redis] GET failed', { key, error: err.message });
    return null;
  }
};

export const setAsync = async (key, value, ttlSeconds) => {
  try {
    if (ttlSeconds) {
      return await redisClient.setex(key, ttlSeconds, JSON.stringify(value));
    }
    return await redisClient.set(key, JSON.stringify(value));
  } catch (err) {
    logger.error('[Redis] SET failed', { key, error: err.message });
  }
};

export const delAsync = async (key) => {
  try {
    return await redisClient.del(key);
  } catch (err) {
    logger.error('[Redis] DEL failed', { key, error: err.message });
  }
};

export default redisClient;

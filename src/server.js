import './core/config/env.js';

import { createServer } from 'http';
import app from './app.js';
import connectToDB from './core/config/dbConn.js';
import { redisClient } from './core/cache/redis.js';
import logger from './core/logger/logger.js';
import config from './core/config/env.js';
import { v2 as cloudinary } from 'cloudinary';
import Razorpay from 'razorpay';
import { initSocket } from './core/socket/socket.js';
import { registerEventListeners } from './core/events/eventListeners.js';

// Cloudinary configuration
cloudinary.config({
  cloud_name: config.CLOUDINARY_CLOUD_NAME,
  api_key: config.CLOUDINARY_API_KEY,
  api_secret: config.CLOUDINARY_API_SECRET,
});

// Razorpay configuration
export const razorpay = new Razorpay({
  key_id: config.RAZORPAY_KEY_ID,
  key_secret: config.RAZORPAY_SECRET,
});

const PORT = config.PORT;

// Create HTTP server (required for Socket.IO)
const httpServer = createServer(app);

const start = async () => {
  try {
    // Connect to MongoDB (required — fail fast if unavailable)
    await connectToDB();

    // Connect Redis (optional — graceful degradation if unavailable)
    try {
      await redisClient.connect();
    } catch (redisErr) {
      logger.warn('Redis unavailable — starting without Redis (rate-limiting, caching, queues degraded)', {
        error: redisErr.message,
      });
    }

    // httpServer.listen() emits errors as async 'error' events — NOT thrown.
    // Must handle separately; try/catch above does NOT catch EADDRINUSE etc.
    httpServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use. Kill the existing process first (pkill -f "node src/server") then restart.`);
      } else {
        logger.error('HTTP server error', { error: err.message, code: err.code });
      }
      process.exit(1);
    });

    httpServer.listen(PORT, async () => {
      logger.info(`Server running on http://localhost:${PORT} [${config.NODE_ENV}]`);

      // ── Phase 6: Socket.IO + event listeners ────────────────────────────
      await initSocket(httpServer, redisClient);
      registerEventListeners();
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
};

// Guard: ioredis emits a terminal error when retryStrategy returns null.
// Without this, Node.js crashes with an uncaught exception.
process.on('uncaughtException', (err) => {
  // Swallow known ioredis terminal-state errors silently
  if (err.message?.includes('Connection is closed') ||
      err.message?.includes('Redis is disconnected') ||
      err.message?.includes('ERR Connection') ) {
    logger.warn('[Redis] Terminal connection error suppressed (Redis not available)', { error: err.message });
    return;
  }
  // Everything else is a real unexpected crash — log and exit
  logger.error('Uncaught exception — shutting down', { error: err.message, stack: err.stack });
  process.exit(1);
});

start();

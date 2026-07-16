/**
 * server.js — Application entry point.
 *
 * IMPORTANT: env.js MUST be the absolute first import so that
 * dotenv.config() runs before any other module reads process.env.
 * This fixes the ESM static-import hoisting bug where the old
 * dotenv config() call at runtime in app.js ran AFTER all imports
 * were already resolved.
 */
import './core/config/env.js';

import { createServer } from 'http';
import app from './app.js';
import connectToDB from './core/config/dbConn.js';
import { redisClient } from './core/cache/redis.js';
import logger from './core/logger/logger.js';
import config from './core/config/env.js';
import { v2 as cloudinary } from 'cloudinary';
import Razorpay from 'razorpay';

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

// Create HTTP server (required for Socket.IO in Phase 6)
const httpServer = createServer(app);

const start = async () => {
  try {
    // Connect to MongoDB
    await connectToDB();

    // Connect Redis (lazyConnect — explicit connect call required)
    await redisClient.connect();

    httpServer.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT} [${config.NODE_ENV}]`);
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
  }
};

start();

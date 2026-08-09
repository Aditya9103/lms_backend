/**
 * socket.js — Phase 6 Socket.IO server setup.
 *
 * Initialises a Socket.IO server, attaches the Redis adapter for
 * multi-process/multi-instance pub-sub, and wires JWT auth so every
 * connected socket is associated with a verified user.
 *
 * Room conventions:
 *   user:<userId>   — personal events (notifications, grade updates)
 *   role:<ROLE>     — role-broadcast events (admin notifications)
 *   course:<id>     — course-scoped events (Q&A, Phase 9)
 */

import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import logger from '../logger/logger.js';
import notificationService from '../../modules/notifications/notification.service.js';

let io = null;

/**
 * Initialise Socket.IO on an existing HTTP server.
 * Call once after Express server.listen().
 *
 * @param {import('http').Server} httpServer
 * @param {import('ioredis').Redis} redisClient  — existing ioredis instance
 * @returns {import('socket.io').Server}
 */
export const initSocket = async (httpServer, redisClient) => {
  io = new Server(httpServer, {
    cors: {
      origin: [
        config.FRONTEND_URL,
        config.FRONTEND_URL?.replace(/\/$/, ''),
        'http://localhost:5173',
        'http://localhost:5174',
      ].filter(Boolean),
      credentials: true,
    },
    // Prefer WebSocket; fall back to polling
    transports: ['websocket', 'polling'],
    pingTimeout: 60_000,
    pingInterval: 25_000,
  });

  // ── Redis adapter (enables pub-sub across multiple server processes) ────────
  if (redisClient?.status === 'ready') {
    try {
      // Create a duplicate connection for the pub/sub adapter
      const pubClient = redisClient.duplicate();
      const subClient = redisClient.duplicate();
      io.adapter(createAdapter(pubClient, subClient));
      logger.info('[Socket] Redis adapter attached');
    } catch (err) {
      logger.warn('[Socket] Redis adapter failed — falling back to in-memory', { error: err.message });
    }
  } else {
    logger.warn('[Socket] Redis unavailable — using in-memory adapter (single process only)');
  }

  // ── JWT authentication middleware ──────────────────────────────────────────
  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, config.JWT_SECRET);
      socket.user = decoded; // { id, role }
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  // ── Connection handler ─────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const { id: userId, role } = socket.user;
    logger.info(`[Socket] Connected: user:${userId} (${role}) — socket:${socket.id}`);

    // Join personal and role rooms
    socket.join(`user:${userId}`);
    socket.join(`role:${role}`);

    socket.on('join:course', (courseId) => {
      socket.join(`course:${courseId}`);
      logger.debug(`[Socket] user:${userId} joined course:${courseId}`);
    });

    socket.on('leave:course', (courseId) => {
      socket.leave(`course:${courseId}`);
    });

    socket.on('disconnect', (reason) => {
      logger.debug(`[Socket] Disconnected: user:${userId} — ${reason}`);
    });
  });

  // Inject io into notification service
  notificationService.setIo(io);

  logger.info('[Socket] Socket.IO server initialised');
  return io;
};

/** Returns the Socket.IO instance (after initSocket has been called). */
export const getIo = () => io;

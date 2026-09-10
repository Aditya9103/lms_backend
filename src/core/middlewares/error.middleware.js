import logger from '../logger/logger.js';
import AppError from '../utils/AppError.js';

/**
 * Centralized error handling middleware.
 *
 * Catches all errors passed via next(err) and returns a consistent
 * response envelope:
 *   { success: false, error: { code: <machine-readable>, message: <human-readable> } }
 *
 * All error codes are SCREAMING_SNAKE_CASE for easy client-side switching.
 */
const errorMiddleware = (err, req, res, _next) => {
  if (res.headersSent) {
    return _next(err);
  }

  // Default values
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Something went wrong';
  let code = err.code || 'INTERNAL_SERVER_ERROR';

  // ── Mongoose: schema validation error ────────────────────────────────────────
  if (err.name === 'ValidationError') {
    statusCode = 400;
    const messages = Object.values(err.errors || {}).map((e) => e.message);
    message = messages.join(', ') || 'Validation error';
    code = 'VALIDATION_ERROR';
  }

  // ── Mongoose: invalid ObjectId ──────────────────────────────────────────────
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for field '${err.path}'`;
    code = 'INVALID_ID';
  }

  // ── Mongoose: duplicate key ──────────────────────────────────────────────────
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {}).join(', ');
    message = `A record with this ${field} already exists`;
    code = 'DUPLICATE_FIELD';
  }

  // ── JWT errors ───────────────────────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token';
    code = 'INVALID_TOKEN';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Authentication token has expired';
    code = 'TOKEN_EXPIRED';
  }

  // ── Zod validation errors (if they somehow reach here) ──────────────────────
  if (err.name === 'ZodError') {
    statusCode = 400;
    message = 'Validation error';
    code = 'VALIDATION_ERROR';
  }

  // ── Multer errors ────────────────────────────────────────────────────────────
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = 'File size exceeds the allowed limit';
    code = 'FILE_TOO_LARGE';
  }

  // Log the error with correlation ID (automatically picked up from AsyncLocalStorage)
  const logLevel = statusCode >= 500 ? 'error' : 'warn';
  logger[logLevel](`[${req.method}] ${req.originalUrl} → ${statusCode} ${code}`, {
    message,
    correlationId: req.id,
    ...(statusCode >= 500 && { stack: err.stack }),
  });

  const body = {
    success: false,
    error: { code, message },
  };

  // Include stack trace in development only
  if (process.env.NODE_ENV === 'development' && statusCode >= 500) {
    body.error.stack = err.stack;
  }

  res.status(statusCode).json(body);
};

export default errorMiddleware;

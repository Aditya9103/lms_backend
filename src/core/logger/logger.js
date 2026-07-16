import { createLogger, format, transports } from 'winston';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * AsyncLocalStorage instance that carries the correlation/request ID
 * through the entire async call chain without threading it through
 * every function argument. Set once per request in requestId.middleware.js;
 * read here so every log line includes the ID automatically.
 */
export const requestContext = new AsyncLocalStorage();

const { combine, timestamp, printf, colorize, errors, json } = format;

/** Human-readable format for local development */
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, correlationId, stack, ...meta }) => {
    const id = correlationId || requestContext.getStore()?.correlationId || '-';
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    const stackStr = stack ? `\n${stack}` : '';
    return `[${timestamp}] [${id}] ${level}: ${message}${metaStr}${stackStr}`;
  })
);

/** Structured JSON format for production log aggregation */
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  format((info) => {
    info.correlationId = info.correlationId || requestContext.getStore()?.correlationId || '-';
    info.service = 'lms-backend';
    return info;
  })(),
  json()
);

const isDev = process.env.NODE_ENV !== 'production';

const logger = createLogger({
  level: isDev ? 'debug' : 'info',
  format: isDev ? devFormat : prodFormat,
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' }),
  ],
  // Prevent Winston from crashing the process on uncaught exceptions
  exceptionHandlers: [new transports.File({ filename: 'logs/exceptions.log' })],
  rejectionHandlers: [new transports.File({ filename: 'logs/rejections.log' })],
});

export default logger;

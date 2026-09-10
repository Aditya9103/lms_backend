import crypto from 'crypto';
import { requestContext } from '../logger/logger.js';

/**
 * Assigns a UUID correlation ID to every incoming request.
 * - Sets X-Request-Id response header (useful for support debugging)
 * - Runs the entire request lifecycle inside AsyncLocalStorage so the
 *   Winston logger can pick up the correlation ID without it being
 *   manually threaded through every function call.
 *
 * Must be mounted as the VERY FIRST middleware in app.js.
 */
const requestIdMiddleware = (req, res, next) => {
  const incoming = typeof req.headers['x-request-id'] === 'string'
    ? req.headers['x-request-id'].trim()
    : null;

  // Only accept clean alphanumeric/hyphen IDs (max 64 chars) to prevent header injection
  const correlationId = (incoming && /^[a-zA-Z0-9_-]{1,64}$/.test(incoming))
    ? incoming
    : crypto.randomUUID();

  req.id = correlationId;
  res.setHeader('X-Request-Id', correlationId);

  // Run subsequent middleware/handlers inside the async context so
  // logger.js can call requestContext.getStore()?.correlationId
  requestContext.run({ correlationId }, next);
};

export default requestIdMiddleware;

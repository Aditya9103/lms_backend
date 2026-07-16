/**
 * Security middleware: Helmet headers + NoSQL injection prevention + XSS sanitization.
 *
 * Mount early in app.js, before body parsers and routes.
 */
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';

/**
 * Helmet: sets security-relevant HTTP response headers.
 * - Content-Security-Policy prevents XSS via inline scripts
 * - HSTS forces HTTPS in prod
 * - X-Frame-Options blocks clickjacking
 * - X-Content-Type-Options prevents MIME sniffing
 */
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // Allow inline styles for API error pages
      imgSrc: ["'self'", 'data:', 'res.cloudinary.com'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // Relax for Cloudinary media loading
});

/**
 * Sanitizes req.body, req.query, and req.params against NoSQL injection.
 * Strips keys that start with '$' or contain '.' before they reach any service.
 */
export const sanitizeMiddleware = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    // This is a potential attack — log it
    console.warn(`[Security] NoSQL injection attempt detected in ${req.method} ${req.path}, field: ${key}`);
  },
});

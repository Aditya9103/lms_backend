/**
 * sentry.js — Sentry error monitoring (backend)
 *
 * Must be imported as the very first line of server.js (before any other imports)
 * so Sentry can instrument all modules from the start.
 *
 * Initialization is guarded: no-ops in test/development if SENTRY_DSN is absent,
 * so local development never needs a real DSN.
 *
 * PII scrubbing:
 *   - Authorization headers are stripped from every event (access token in header)
 *   - Cookie header is stripped (refresh token in httpOnly cookie)
 *   - Request body fields matching password|token|otp|refreshToken are redacted
 *
 * Environment variables:
 *   SENTRY_DSN         - Required in production (optional otherwise)
 *   SENTRY_ENVIRONMENT - Defaults to NODE_ENV
 *   SENTRY_TRACES_SAMPLE_RATE - 0.0–1.0, default 0.1 (10% of transactions)
 */
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { config as env } from './env.js';

const SENSITIVE_BODY_FIELDS = /password|token|otp|refreshToken|secret/i;

export function initSentry() {
  if (!env.SENTRY_DSN) {
    // No DSN — silently skip. Sentry SDK remains a no-op.
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV || 'production',
    integrations: [nodeProfilingIntegration()],

    // Performance monitoring
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    profilesSampleRate: env.SENTRY_PROFILES_SAMPLE_RATE,

    // ── PII Scrubbing ──────────────────────────────────────────────────────────
    // Never send auth material or PII to Sentry.
    beforeSend(event) {
      // 1. Strip Authorization header (contains the access token)
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['Authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['Cookie'];
      }

      // 2. Redact sensitive fields from request body
      if (event.request?.data && typeof event.request.data === 'object') {
        event.request.data = redactObject(event.request.data);
      }
      if (typeof event.request?.data === 'string') {
        try {
          const parsed = JSON.parse(event.request.data);
          event.request.data = JSON.stringify(redactObject(parsed));
        } catch {
          // Not JSON — leave as-is (don't send raw strings that might be tokens)
          event.request.data = '[Redacted non-JSON body]';
        }
      }

      // 3. Scrub Sentry breadcrumbs that may contain sensitive URLs or data
      if (event.breadcrumbs?.values) {
        event.breadcrumbs.values = event.breadcrumbs.values.map((crumb) => {
          if (crumb.data?.url && crumb.data.url.includes('/auth/')) {
            crumb.data = { url: '[auth endpoint]' };
          }
          return crumb;
        });
      }

      return event;
    },
  });
}

/**
 * Recursively redacts sensitive keys in an object.
 * @param {Record<string, unknown>} obj
 * @returns {Record<string, unknown>}
 */
function redactObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => {
      if (SENSITIVE_BODY_FIELDS.test(key)) return [key, '[Redacted]'];
      if (value && typeof value === 'object') return [key, redactObject(value)];
      return [key, value];
    })
  );
}

/** Captures an exception explicitly (use in catch blocks for non-HTTP errors). */
export const captureException = (err, context = {}) => {
  Sentry.withScope((scope) => {
    Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
    Sentry.captureException(err);
  });
};

/** Returns the Sentry request handler middleware (must be first middleware). */
export const sentryRequestHandler = () => Sentry.setupExpressErrorHandler;

export default Sentry;

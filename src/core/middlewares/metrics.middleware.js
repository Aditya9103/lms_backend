/**
 * metrics.middleware.js — Prometheus HTTP metrics
 *
 * Instruments all Express routes with three standard metrics:
 *
 *   http_request_duration_seconds   Histogram — latency by method/route/status
 *   http_requests_total             Counter   — request count by method/route/status
 *   http_active_requests            Gauge     — in-flight requests
 *
 * Route normalisation:
 *   Replaces path params (/users/abc123) with placeholders (/users/:id)
 *   so high-cardinality UUIDs don't explode the label set.
 *
 * Scrape endpoint:
 *   GET /metrics — protected by a secret header in production (X-Metrics-Token).
 *   Skip auth in development for convenience.
 *
 * Usage:
 *   // In app.js, after security middleware:
 *   import { metricsMiddleware, metricsRouter } from './core/middlewares/metrics.middleware.js';
 *   app.use(metricsMiddleware);
 *   app.use(metricsRouter);
 */
import { register, collectDefaultMetrics, Histogram, Counter, Gauge } from 'prom-client';
import { Router } from 'express';
import { config as env } from '../config/env.js';
import logger from '../logger/logger.js';

// ── Collect default Node.js metrics (event loop lag, memory, GC, etc.) ───────
collectDefaultMetrics({ register });

// ── Custom HTTP metrics ───────────────────────────────────────────────────────

const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpActiveRequests = new Gauge({
  name: 'http_active_requests',
  help: 'Number of currently in-flight HTTP requests',
  registers: [register],
});

// ── Route normalisation ───────────────────────────────────────────────────────
// Replace UUIDs and MongoDB ObjectIds with :id placeholders.
const PARAM_PATTERNS = [
  [/\/[0-9a-fA-F]{24}/g, '/:id'],           // MongoDB ObjectId
  [/\/[0-9a-f-]{36}/g, '/:id'],              // UUID v4
  [/\/\d+/g, '/:id'],                        // Numeric ID
];

function normaliseRoute(url = '') {
  // Strip query string
  let path = url.split('?')[0];
  for (const [pattern, replacement] of PARAM_PATTERNS) {
    path = path.replace(pattern, replacement);
  }
  return path;
}

// ── Request instrumentation middleware ────────────────────────────────────────

export function metricsMiddleware(req, res, next) {
  // Skip the /metrics endpoint itself to avoid self-instrumentation noise
  if (req.path === '/metrics') return next();

  const start = process.hrtime.bigint();
  httpActiveRequests.inc();

  res.on('finish', () => {
    httpActiveRequests.dec();
    const durationMs = Number(process.hrtime.bigint() - start) / 1e9;
    const route = normaliseRoute(req.originalUrl || req.url);
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };
    httpDuration.observe(labels, durationMs);
    httpRequestsTotal.inc(labels);
  });

  next();
}

// ── /metrics scrape endpoint ──────────────────────────────────────────────────

export const metricsRouter = Router();

metricsRouter.get('/metrics', async (req, res) => {
  // In production, require a secret token to prevent public exposure
  if (env.NODE_ENV === 'production') {
    const token = req.headers['x-metrics-token'];
    if (!token || token !== env.METRICS_SECRET) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  try {
    const metrics = await register.metrics();
    res.set('Content-Type', register.contentType);
    res.send(metrics);
  } catch (err) {
    logger.error({ err }, 'Failed to collect Prometheus metrics');
    res.status(500).end();
  }
});

/**
 * phase1.foundation.test.js — Exhaustive Phase 1 Foundation Verification Suite
 *
 * Tests:
 *  - 1.1 Request ID middleware & correlation tracking
 *  - 1.2 Zod validation middleware & error envelope
 *  - 1.3 EventBus pub/sub & error isolation
 *  - 1.4 Standard API response envelope & AppError
 *  - 1.5 Live HTTP health & readiness probes (via Supertest)
 */
import request from 'supertest';
import { z } from 'zod';
import app from '../../app.js';
import requestIdMiddleware from '../middlewares/requestId.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import eventBus from '../events/eventBus.js';
import { sendSuccess } from '../utils/apiResponse.js';
import AppError from '../utils/AppError.js';

describe('=== Phase 1: Foundation & Observability Baseline ===', () => {

  // ─── 1.1 Request ID Middleware ─────────────────────────────────────────────
  describe('1.1 Request ID Correlation Middleware', () => {
    it('generates a new UUIDv4 when no X-Request-Id header is provided', () => {
      const req = { headers: {} };
      const res = { setHeader: jest.fn() };
      const next = jest.fn();

      requestIdMiddleware(req, res, next);

      expect(req.id).toBeDefined();
      expect(typeof req.id).toBe('string');
      // UUID v4 format regex
      expect(req.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', req.id);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('preserves an existing incoming X-Request-Id header', () => {
      const customId = 'client-custom-tracking-id-12345';
      const req = { headers: { 'x-request-id': customId } };
      const res = { setHeader: jest.fn() };
      const next = jest.fn();

      requestIdMiddleware(req, res, next);

      expect(req.id).toBe(customId);
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', customId);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 1.2 Zod Input Validation Middleware ───────────────────────────────────
  describe('1.2 Zod Input Validation Middleware', () => {
    const TestSchema = z.object({
      email: z.string().email('Invalid email address format'),
      age: z.coerce.number().min(18, 'Must be at least 18 years old'),
    });

    it('passes valid request data through to next()', () => {
      const req = {
        body: { email: 'valid.user@example.com', age: '25' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      const middleware = validate(TestSchema, 'body');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.body.age).toBe(25); // coerced to number
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns HTTP 400 with VALIDATION_ERROR envelope on invalid data', () => {
      const req = {
        body: { email: 'invalid-email', age: '15' },
      };
      const res = {};
      res.status = jest.fn().mockReturnValue(res);
      res.json = jest.fn().mockReturnValue(res);
      const next = jest.fn();

      const middleware = validate(TestSchema, 'body');
      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          fields: {
            email: ['Invalid email address format'],
            age: ['Must be at least 18 years old'],
          },
        },
      });
    });
  });

  // ─── 1.3 EventBus Pub/Sub & Error Isolation ────────────────────────────────
  describe('1.3 EventBus Messaging & Error Isolation', () => {
    const TEST_EVENT = 'test:phase1_event';

    afterEach(() => {
      eventBus.removeAllListeners(TEST_EVENT);
    });

    it('emits events and dispatches payloads to registered listeners', (done) => {
      const payload = { testId: 'phase1_123', timestamp: Date.now() };

      eventBus.on(TEST_EVENT, (received) => {
        expect(received).toEqual(payload);
        done();
      });

      eventBus.emit(TEST_EVENT, payload);
    });

    it('isolates listener errors so one failing listener does not crash other listeners or emitter', async () => {
      const secondListenerMock = jest.fn();

      // Listener 1 throws an intentional error
      eventBus.on(TEST_EVENT, async () => {
        throw new Error('Simulated listener explosion');
      });

      // Listener 2 must still receive the event
      eventBus.on(TEST_EVENT, secondListenerMock);

      expect(() => {
        eventBus.emit(TEST_EVENT, { key: 'value' });
      }).not.toThrow();

      // Wait brief tick for async safeListener
      await new Promise((r) => setTimeout(r, 50));
      expect(secondListenerMock).toHaveBeenCalledWith({ key: 'value' });
    });
  });

  // ─── 1.4 Response Envelope & Operational Errors ───────────────────────────
  describe('1.4 Standard API Response Envelope & AppError', () => {
    it('formats success responses according to standard envelope shape', () => {
      const res = {};
      res.status = jest.fn().mockReturnValue(res);
      res.json = jest.fn().mockReturnValue(res);

      sendSuccess(res, { role: 'STUDENT', active: true }, 200, { page: 1 });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { role: 'STUDENT', active: true },
        meta: { page: 1 },
      });
    });

    it('creates operational AppError instances with status codes and flag', () => {
      const err = new AppError('Course prerequisite not met', 403);
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Course prerequisite not met');
      expect(err.statusCode).toBe(403);
      expect(err.isOperational).toBe(true);
      expect(err.stack).toBeDefined();
    });
  });

  // ─── 1.5 Live HTTP Probes & Contract Tests ─────────────────────────────────
  describe('1.5 Live HTTP Probes & Documentation Endpoints (Supertest)', () => {
    it('GET /health returns HTTP 200 with uptime and status: ok', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('uptime');
      expect(typeof res.body.uptime).toBe('number');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it('GET /ready returns subsystem readiness checks', async () => {
      const res = await request(app).get('/ready');

      // 200 if all live, or 503 if Redis/BullMQ is degraded (both are valid structured contracts)
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('checks');
      expect(res.body.checks).toHaveProperty('mongo');
    });

    it('GET /api-docs.json returns valid OpenAPI 3.0 specification', async () => {
      const res = await request(app).get('/api-docs.json');

      expect(res.status).toBe(200);
      expect(res.body.openapi).toMatch(/^3\./);
      expect(res.body.info).toHaveProperty('title', 'LMS Enterprise API');
      expect(res.body.info).toHaveProperty('version', '1.0.0');
    });

    it('Returns standardized 404 envelope on non-existent routes', async () => {
      const res = await request(app).get('/api/v1/non-existent-route-12345');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
    });
  });
});

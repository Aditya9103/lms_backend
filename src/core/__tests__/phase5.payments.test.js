/**
 * phase5.payments.test.js — Exhaustive Phase 5 Payment Gateway, Webhooks & Idempotency Test Suite
 *
 * Scope:
 *  - 5.1 Razorpay Public Key Retrieval (GET /api/v1/payments/razorpay-key)
 *  - 5.2 Subscription Purchase & Validation Guards (POST /api/v1/payments/subscribe)
 *  - 5.3 Client Verification, HMAC Signature & Idempotency Key (POST /api/v1/payments/verify)
 *  - 5.4 Subscription Cancellation & Refund Rules (POST /api/v1/payments/unsubscribe)
 *  - 5.5 Razorpay Webhook Processing (POST /api/v1/payments/webhook — HMAC, length safety, idempotency)
 *  - 5.6 Admin Payment Records & RBAC Guards (GET /api/v1/payments)
 */
import request from 'supertest';
import crypto from 'crypto';
import app from '../../app.js';
import User from '../../modules/users/user.model.js';
import Payment from '../../modules/payments/Payment.model.js';
import config from '../../core/config/env.js';

describe('=== Phase 5: Payment Gateway, Webhook Idempotency & Invoicing ===', () => {
  const testPassword = 'Password123!';
  const mockSecret = config.RAZORPAY_SECRET || 'test_razorpay_secret_12345';
  const mockWebhookSecret = config.RAZORPAY_WEBHOOK_SECRET || 'test_webhook_secret_67890';

  beforeAll(() => {
    process.env.RAZORPAY_SECRET = mockSecret;
    process.env.RAZORPAY_WEBHOOK_SECRET = mockWebhookSecret;
  });

  const createUser = async (overrides = {}) => {
    const email = `payment_test_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
    const user = await User.create({
      fullName: 'Payment Tester',
      email,
      password: testPassword,
      isVerified: true,
      role: 'USER',
      ...overrides,
    });
    const token = await user.generateJWTToken();
    return { user, email, token };
  };

  // ─── 5.1 Public Key Retrieval ────────────────────────────────────────────────
  describe('5.1 Razorpay Public Key (GET /api/v1/payments/razorpay-key)', () => {
    it('returns public Razorpay key in standard envelope to authenticated users', async () => {
      const { token } = await createUser();

      const res = await request(app)
        .get('/api/v1/payments/razorpay-key')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('key');
    });

    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/payments/razorpay-key');
      expect(res.status).toBe(401);
    });
  });

  // ─── 5.2 Subscription Purchase Guards ────────────────────────────────────────
  describe('5.2 Subscription Purchase (POST /api/v1/payments/subscribe)', () => {
    it('blocks ADMIN role with 400 error', async () => {
      const { token } = await createUser({ role: 'ADMIN' });

      const res = await request(app)
        .post('/api/v1/payments/subscribe')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/admin cannot purchase/i);
    });

    it('blocks users who already have an active subscription with 400', async () => {
      const { token } = await createUser({
        subscription: { id: 'sub_already_active_123', status: 'active' },
      });

      const res = await request(app)
        .post('/api/v1/payments/subscribe')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/already have an active subscription/i);
    });
  });

  // ─── 5.3 Client Verification & HMAC Signature ────────────────────────────────
  describe('5.3 Client Verification & HMAC (POST /api/v1/payments/verify)', () => {
    it('rejects invalid HMAC signature with 400 Bad Request', async () => {
      const { token } = await createUser({
        subscription: { id: 'sub_valid_123', status: 'created' },
      });

      const res = await request(app)
        .post('/api/v1/payments/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({
          razorpay_payment_id: 'pay_12345',
          razorpay_subscription_id: 'sub_valid_123',
          razorpay_signature: 'completely_bogus_signature_abc',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/payment not verified/i);
    });

    it('verifies valid HMAC signature and activates user subscription', async () => {
      const subscriptionId = 'sub_test_valid_999';
      const paymentId = 'pay_test_valid_888';
      const { user, token } = await createUser({
        subscription: { id: subscriptionId, status: 'created' },
      });

      // Compute correct HMAC SHA256 signature
      const validSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_SECRET || mockSecret)
        .update(`${paymentId}|${subscriptionId}`)
        .digest('hex');

      const res = await request(app)
        .post('/api/v1/payments/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({
          razorpay_payment_id: paymentId,
          razorpay_subscription_id: subscriptionId,
          razorpay_signature: validSignature,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbUser = await User.findById(user._id);
      expect(dbUser.subscription.status).toBe('active');

      const paymentRecord = await Payment.findOne({ razorpay_payment_id: paymentId });
      expect(paymentRecord).toBeDefined();
      expect(paymentRecord.razorpay_subscription_id).toBe(subscriptionId);
    });

    it('handles idempotent retries using Idempotency-Key without duplicating records', async () => {
      const subscriptionId = 'sub_idempotent_111';
      const paymentId = 'pay_idempotent_222';
      const idempotencyKey = `idem_${Date.now()}`;
      const { user, token } = await createUser({
        subscription: { id: subscriptionId, status: 'created' },
      });

      const validSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_SECRET || mockSecret)
        .update(`${paymentId}|${subscriptionId}`)
        .digest('hex');

      // First verify call
      const res1 = await request(app)
        .post('/api/v1/payments/verify')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          razorpay_payment_id: paymentId,
          razorpay_subscription_id: subscriptionId,
          razorpay_signature: validSignature,
        });

      expect(res1.status).toBe(200);

      // Duplicate verify call with same key
      const res2 = await request(app)
        .post('/api/v1/payments/verify')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          razorpay_payment_id: paymentId,
          razorpay_subscription_id: subscriptionId,
          razorpay_signature: validSignature,
        });

      expect(res2.status).toBe(200);

      // Verify only one payment document was created
      const count = await Payment.countDocuments({ idempotencyKey });
      expect(count).toBe(1);
    });
  });

  // ─── 5.4 Subscription Cancellation ───────────────────────────────────────────
  describe('5.4 Subscription Cancellation (POST /api/v1/payments/unsubscribe)', () => {
    it('blocks user without an active subscription with 403 (subscriber guard)', async () => {
      const { token } = await createUser({
        subscription: { id: null, status: 'inactive' },
      });

      const res = await request(app)
        .post('/api/v1/payments/unsubscribe')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  // ─── 5.5 Razorpay Webhook Processing ─────────────────────────────────────────
  describe('5.5 Razorpay Webhooks (POST /api/v1/payments/webhook)', () => {
    it('handles short/malformed signature safely without throwing RangeError crash', async () => {
      const payload = Buffer.from(JSON.stringify({ event: 'payment.captured' }));

      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', 'short_invalid_sig')
        .send(payload);

      // Razorpay webhook endpoint always ACKs 200 immediately to prevent retries
      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });

    it('activates subscription on payment.captured webhook with valid HMAC', async () => {
      const subscriptionId = `sub_wh_${Date.now()}`;
      const paymentId = `pay_wh_${Date.now()}`;
      const { user } = await createUser({
        subscription: { id: subscriptionId, status: 'created' },
      });

      const eventPayload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              subscription_id: subscriptionId,
            },
          },
          subscription: {
            entity: {
              id: subscriptionId,
            },
          },
        },
      };

      const rawBody = JSON.stringify(eventPayload);
      const validSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || mockWebhookSecret)
        .update(rawBody)
        .digest('hex');

      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', validSignature)
        .send(rawBody);

      expect(res.status).toBe(200);

      const dbUser = await User.findById(user._id);
      expect(dbUser.subscription.status).toBe('active');

      const paymentRecord = await Payment.findOne({ razorpay_payment_id: paymentId });
      expect(paymentRecord).toBeDefined();
      expect(paymentRecord.webhookVerified).toBe(true);
    });

    it('cancels subscription on subscription.cancelled webhook with valid HMAC', async () => {
      const subscriptionId = `sub_cancel_${Date.now()}`;
      const { user } = await createUser({
        subscription: { id: subscriptionId, status: 'active' },
      });

      const eventPayload = {
        event: 'subscription.cancelled',
        payload: {
          subscription: {
            entity: {
              id: subscriptionId,
            },
          },
        },
      };

      const rawBody = JSON.stringify(eventPayload);
      const validSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || mockWebhookSecret)
        .update(rawBody)
        .digest('hex');

      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', validSignature)
        .send(rawBody);

      expect(res.status).toBe(200);

      const dbUser = await User.findById(user._id);
      expect(dbUser.subscription.status).toBe('cancelled');
    });

    it('is idempotent on duplicate webhook delivery', async () => {
      const subscriptionId = `sub_dup_${Date.now()}`;
      const paymentId = `pay_dup_${Date.now()}`;
      await createUser({
        subscription: { id: subscriptionId, status: 'created' },
      });

      const eventPayload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              subscription_id: subscriptionId,
            },
          },
          subscription: {
            entity: {
              id: subscriptionId,
            },
          },
        },
      };

      const rawBody = JSON.stringify(eventPayload);
      const validSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || mockWebhookSecret)
        .update(rawBody)
        .digest('hex');

      // First webhook post
      await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', validSignature)
        .send(rawBody);

      // Duplicate webhook delivery
      await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', validSignature)
        .send(rawBody);

      const count = await Payment.countDocuments({ razorpay_payment_id: paymentId });
      expect(count).toBe(1);
    });
  });

  // ─── 5.6 Admin Payment Records RBAC ───────────────────────────────────────────
  describe('5.6 Admin Payment Records & RBAC (GET /api/v1/payments)', () => {
    it('blocks regular USER from accessing payment records with 403 Forbidden', async () => {
      const { token } = await createUser({ role: 'USER' });

      const res = await request(app)
        .get('/api/v1/payments')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});

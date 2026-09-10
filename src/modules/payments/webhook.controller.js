/**
 * webhook.controller.js — Phase 7 Razorpay webhook handler.
 *
 * SECURITY NOTES:
 *  1. This handler receives the raw request body as a Buffer (mounted with
 *     express.raw() BEFORE express.json() in app.js). Never use express.json()
 *     on this route — it would destroy the raw body needed for HMAC.
 *
 *  2. HMAC verification uses RAZORPAY_WEBHOOK_SECRET (NOT RAZORPAY_SECRET).
 *     These are separate credentials in the Razorpay dashboard:
 *       - RAZORPAY_SECRET       → API key secret (for creating orders/subscriptions)
 *       - RAZORPAY_WEBHOOK_SECRET → Webhook secret (for verifying webhook payloads)
 *
 *  3. Always return 200 immediately after HMAC verification passes, even if
 *     downstream processing fails. Razorpay retries on non-2xx responses —
 *     a transient DB error must NOT trigger infinite retries.
 *
 *  4. Idempotency: we check payment.webhookVerified before processing to
 *     make this handler safe to call multiple times for the same event.
 */

import crypto from 'crypto';
import paymentRepository from './payment.repository.js';
import userRepository from '../users/user.repository.js';
import eventBus from '../../core/events/eventBus.js';
import { Events } from '../../core/events/eventNames.js';
import logger from '../../core/logger/logger.js';
import config from '../../core/config/env.js';

const WEBHOOK_SECRET = config.RAZORPAY_WEBHOOK_SECRET;

/**
 * Verifies Razorpay webhook HMAC signature.
 * @param {Buffer} rawBody  — raw request body (must be Buffer, not string/object)
 * @param {string} signature — value of X-Razorpay-Signature header
 * @returns {boolean}
 */
const verifyWebhookSignature = (rawBody, signature) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || config.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn('[Webhook] RAZORPAY_WEBHOOK_SECRET not set — skipping HMAC verification (UNSAFE)');
    return true; // non-blocking in dev; prod must always have the secret
  }
  if (!signature || typeof signature !== 'string') return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);

  if (expectedBuf.length !== signatureBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
};

const webhookHandler = async (req, res) => {
  // ── 1. Normalize body & event ─────────────────────────────────────────────
  let event;
  let rawBuffer;

  if (Buffer.isBuffer(req.body)) {
    rawBuffer = req.body;
    try {
      event = JSON.parse(req.body.toString('utf-8'));
      if (event && event.type === 'Buffer' && Array.isArray(event.data)) {
        rawBuffer = Buffer.from(event.data);
        event = JSON.parse(rawBuffer.toString('utf-8'));
      }
    } catch {
      logger.error('[Webhook] Failed to parse webhook payload');
      return res.status(200).json({ received: true, dropped: true, error: 'Failed to parse webhook payload' });
    }
  } else if (typeof req.body === 'string') {
    rawBuffer = Buffer.from(req.body);
    try {
      event = JSON.parse(req.body);
      if (event && event.type === 'Buffer' && Array.isArray(event.data)) {
        rawBuffer = Buffer.from(event.data);
        event = JSON.parse(rawBuffer.toString('utf-8'));
      }
    } catch {
      logger.error('[Webhook] Failed to parse webhook payload');
      return res.status(200).json({ received: true, dropped: true, error: 'Failed to parse webhook payload' });
    }
  } else if (typeof req.body === 'object' && req.body !== null) {
    event = req.body;
    rawBuffer = Buffer.from(JSON.stringify(req.body));
  } else {
    logger.error('[Webhook] Empty or invalid body');
    return res.status(200).json({ received: true, dropped: true, error: 'Empty or invalid body' });
  }

  // ── 2. HMAC verification ──────────────────────────────────────────────────
  const signature = req.headers['x-razorpay-signature'];

  if (!verifyWebhookSignature(rawBuffer, signature)) {
    logger.warn('[Webhook] HMAC verification FAILED — dropping event', {
      signature,
      ip: req.ip,
    });
    return res.status(200).json({ received: true, dropped: true, error: 'Invalid signature' });
  }

  const eventName = event.event;
  logger.info(`[Webhook] Received: ${eventName}`, { entity: event.payload?.payment?.entity?.id });

  // ── 3. Route to handler ───────────────────────────────────────────────────
  try {
    switch (eventName) {
      case 'payment.captured':
      case 'subscription.charged':
        await handlePaymentCaptured(event);
        break;
      case 'subscription.cancelled':
        await handleSubscriptionCancelled(event);
        break;
      case 'payment.failed':
        await handlePaymentFailed(event);
        break;
      default:
        logger.debug(`[Webhook] Unhandled event type: ${eventName}`);
    }
  } catch (err) {
    // Log error
    logger.error(`[Webhook] Error processing ${eventName}`, {
      error: err.message,
      stack: err.stack,
    });
  } finally {
    if (!res.headersSent) {
      res.status(200).json({ received: true });
    }
  }
};

// ── Event handlers ─────────────────────────────────────────────────────────────

async function handlePaymentCaptured(event) {
  const paymentEntity = event.payload?.payment?.entity;
  const subscriptionEntity = event.payload?.subscription?.entity;

  const paymentId = paymentEntity?.id;
  const subscriptionId = subscriptionEntity?.id ?? paymentEntity?.subscription_id;

  if (!paymentId || !subscriptionId) {
    logger.warn('[Webhook] payment.captured missing paymentId or subscriptionId', { event });
    return;
  }

  // ── Idempotency check ──────────────────────────────────────────────────────
  const existing = await paymentRepository.findPaymentBySubscriptionId(subscriptionId);
  if (existing?.webhookVerified) {
    logger.info(`[Webhook] Already processed payment for subscription ${subscriptionId} — skipping`);
    return;
  }

  // ── Activate subscription ──────────────────────────────────────────────────
  const user = await userRepository.findOne({ 'subscription.id': subscriptionId });
  if (!user) {
    logger.warn(`[Webhook] No user found for subscription ${subscriptionId}`);
    return;
  }

  user.subscription.status = 'active';
  await userRepository.save(user);

  // ── Mark payment as webhook-verified ──────────────────────────────────────
  if (existing) {
    existing.webhookVerified = true;
    existing.webhookVerifiedAt = new Date();
    existing.webhookEvent = event.event;
    await paymentRepository.save(existing);
  } else {
    // Webhook arrived before client-side verify (rare but possible)
    await paymentRepository.createPayment({
      razorpay_payment_id: paymentId,
      razorpay_subscription_id: subscriptionId,
      razorpay_signature: 'webhook-verified',
      userId: user._id,
      webhookVerified: true,
      webhookVerifiedAt: new Date(),
      webhookEvent: event.event,
    });
  }

  // ── Emit enrollment event ─────────────────────────────────────────────────
  eventBus.emit(Events.ENROLLMENT_CREATED, {
    userId: user._id,
    courseId: null, // subscription model; not per-course
    courseName: 'Platform Subscription',
  });

  logger.info(`[Webhook] Subscription activated for user ${user._id}`);
}

async function handleSubscriptionCancelled(event) {
  const subscriptionId = event.payload?.subscription?.entity?.id;
  if (!subscriptionId) return;

  const user = await userRepository.findOne({ 'subscription.id': subscriptionId });
  if (!user) return;

  user.subscription.status = 'cancelled';
  await userRepository.save(user);
  logger.info(`[Webhook] Subscription cancelled for user ${user._id}`);
}

async function handlePaymentFailed(event) {
  const paymentEntity = event.payload?.payment?.entity;
  logger.warn('[Webhook] payment.failed', {
    paymentId: paymentEntity?.id,
    reason: paymentEntity?.error_description,
  });
  // Future: notify user via notification service
}

export default webhookHandler;

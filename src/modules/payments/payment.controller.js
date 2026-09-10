/**
 * payment.controller.js — Phase 7 hardened payment controllers.
 */

import asyncHandler from '../../core/middlewares/asyncHandler.middleware.js';
import paymentService from './payment.service.js';
import { sendSuccess } from '../../core/utils/apiResponse.js';

export const buySubscription = asyncHandler(async (req, res) => {
  const subscription_id = await paymentService.buySubscription(req.user.id);
  return sendSuccess(res, { subscription_id }, 200, 'Subscribed successfully');
});

export const verifySubscription = asyncHandler(async (req, res) => {
  const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body;
  // Phase 7.2: client generates UUID v4 once per checkout attempt and sends as header
  const idempotencyKey = req.headers['idempotency-key'] ?? null;

  await paymentService.verifySubscription(
    req.user.id,
    razorpay_payment_id,
    razorpay_subscription_id,
    razorpay_signature,
    idempotencyKey
  );
  return sendSuccess(res, null, 200, 'Payment verified successfully');
});

export const cancelSubscription = asyncHandler(async (req, res) => {
  await paymentService.cancelSubscription(req.user.id);
  return sendSuccess(res, null, 200, 'Subscription canceled successfully');
});

export const getRazorpayApiKey = asyncHandler(async (_req, res) => {
  return sendSuccess(res, { key: process.env.RAZORPAY_KEY_ID }, 200, 'Razorpay API key');
});

export const allPayments = asyncHandler(async (req, res) => {
  const { count, skip } = req.query;
  const data = await paymentService.getAllPayments(count, skip);
  return sendSuccess(res, data, 200);
});

/** Admin-only: manually trigger reconciliation of unverified payments */
export const reconcilePayments = asyncHandler(async (req, res) => {
  const result = await paymentService.reconcileUnverifiedPayments();
  return sendSuccess(res, result, 200, 'Reconciliation complete');
});

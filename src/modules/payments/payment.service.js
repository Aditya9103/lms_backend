import crypto from 'crypto';
import Razorpay from 'razorpay';
import AppError from '../../core/utils/AppError.js';
import paymentRepository from './payment.repository.js';
import userRepository from '../users/user.repository.js';
import logger from '../../core/logger/logger.js';

// Lazily initialised to avoid circular import with server.js at module load time
let _razorpay = null;
const getRazorpay = () => {
  if (!_razorpay) {
    _razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_SECRET,
    });
  }
  return _razorpay;
};


class PaymentService {
  async buySubscription(userId) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('Unauthorized, please login', 401);
    if (user.role === 'ADMIN') throw new AppError('Admin cannot purchase a subscription', 400);

    const subscription = await getRazorpay().subscriptions.create({
      plan_id: process.env.RAZORPAY_PLAN_ID,
      customer_notify: 1,
      total_count: 12,
    });

    user.subscription.id = subscription.id;
    user.subscription.status = subscription.status;
    await userRepository.save(user);

    return subscription.id;
  }

  /**
   * Phase 7.2: verifySubscription now accepts an idempotency key.
   * If a payment record already exists for this key, the duplicate
   * verify call is a no-op (safe to retry from the frontend).
   */
  async verifySubscription(userId, paymentId, subscriptionId, signature, idempotencyKey) {
    // ── Idempotency check ────────────────────────────────────────────────────
    if (idempotencyKey) {
      const existing = await paymentRepository.findPaymentByIdempotencyKey(idempotencyKey);
      if (existing) {
        logger.info(`[Payment] Idempotent verify — key already processed: ${idempotencyKey}`);
        return; // safe no-op
      }
    }

    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('Unauthorized', 401);

    const userSubscriptionId = user.subscription.id;

    // Client-side HMAC verification (secondary check — webhook is primary)
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_SECRET)
      .update(`${paymentId}|${userSubscriptionId}`)
      .digest('hex');

    if (generatedSignature !== signature) {
      throw new AppError('Payment not verified, please try again.', 400);
    }

    // Create payment record — idempotencyKey unique index prevents duplicates on DB level too
    await paymentRepository.createPayment({
      razorpay_payment_id: paymentId,
      razorpay_subscription_id: subscriptionId,
      razorpay_signature: signature,
      userId,
      idempotencyKey: idempotencyKey ?? undefined,
      // webhookVerified will be set to true when webhook arrives
      webhookVerified: false,
    });

    // Optimistically mark as active — webhook will re-confirm
    user.subscription.status = 'active';
    await userRepository.save(user);
    logger.info(`[Payment] Subscription verify recorded (awaiting webhook): ${subscriptionId}`);
  }

  /**
   * Phase 7.2: Reconciliation — finds payments created by the client verify
   * flow that never received a webhook confirmation, and checks Razorpay API
   * directly to confirm their status.
   */
  async reconcileUnverifiedPayments() {
    const unverified = await paymentRepository.findUnreconciled({ olderThanMinutes: 30 });
    logger.info(`[Reconciliation] Checking ${unverified.length} unverified payment(s)`);

    for (const payment of unverified) {
      try {
        const rzpPayment = await getRazorpay().payments.fetch(payment.razorpay_payment_id);
        if (rzpPayment.status === 'captured') {
          payment.webhookVerified = true;
          payment.webhookVerifiedAt = new Date();
          payment.webhookEvent = 'reconciliation';
          payment.reconciled = true;
          payment.reconciledAt = new Date();
          await paymentRepository.save(payment);
          logger.info(`[Reconciliation] Confirmed payment ${payment.razorpay_payment_id}`);
        }
      } catch (err) {
        logger.warn(`[Reconciliation] Could not fetch payment ${payment.razorpay_payment_id}`, { error: err.message });
      }
    }

    return { checked: unverified.length };
  }

  async cancelSubscription(userId) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('Unauthorized', 401);
    if (user.role === 'ADMIN') throw new AppError('Admin does not need to cancel subscription', 400);

    const subscriptionId = user.subscription.id;
    let subscription;

    try {
      subscription = await getRazorpay().subscriptions.cancel(subscriptionId);
      user.subscription.status = subscription.status;
      await userRepository.save(user);
    } catch (error) {
      throw new AppError(error.error.description, error.statusCode);
    }

    const payment = await paymentRepository.findPaymentBySubscriptionId(subscriptionId);
    if (!payment) return;

    const timeSinceSubscribed = Date.now() - payment.createdAt;
    const refundPeriod = 14 * 24 * 60 * 60 * 1000;

    if (refundPeriod <= timeSinceSubscribed) {
      throw new AppError('Refund period is over, so there will not be any refunds provided.', 400);
    }

    await getRazorpay().payments.refund(payment.razorpay_payment_id, { speed: 'optimum' });

    user.subscription.id = undefined;
    user.subscription.status = undefined;
    await userRepository.save(user);
    await paymentRepository.deletePayment(payment);
  }

  async getAllPayments(count, skip) {
    const allPayments = await getRazorpay().subscriptions.all({
      count: count ? count : 10,
      skip: skip ? skip : 0,
    });

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    const finalMonths = {
      January: 0, February: 0, March: 0, April: 0, May: 0, June: 0,
      July: 0, August: 0, September: 0, October: 0, November: 0, December: 0,
    };

    const monthlyWisePayments = (allPayments?.items || []).map((payment) => {
      const monthsInNumbers = new Date((payment?.start_at || payment?.created_at || Date.now() / 1000) * 1000);
      return monthNames[monthsInNumbers.getMonth()];
    });

    monthlyWisePayments.forEach((month) => {
      if (finalMonths[month] !== undefined) {
        finalMonths[month] += 1;
      }
    });

    const monthlySalesRecord = [];
    Object.keys(finalMonths).forEach((monthName) => {
      monthlySalesRecord.push(finalMonths[monthName]);
    });

    return { allPayments, finalMonths, monthlySalesRecord };
  }
}

export default new PaymentService();

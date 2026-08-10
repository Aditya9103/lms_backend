/**
 * payment.repository.js — Phase 7 hardened payment data access.
 */

import Payment from './Payment.model.js';

class PaymentRepository {
  async createPayment(paymentData) {
    return await Payment.create(paymentData);
  }

  async findPaymentBySubscriptionId(subscriptionId) {
    return await Payment.findOne({ razorpay_subscription_id: subscriptionId });
  }

  async findPaymentByIdempotencyKey(idempotencyKey) {
    return await Payment.findOne({ idempotencyKey });
  }

  async findByPaymentId(paymentId) {
    return await Payment.findOne({ razorpay_payment_id: paymentId });
  }

  async findUnreconciled({ olderThanMinutes = 30 } = {}) {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    return await Payment.find({
      webhookVerified: false,
      createdAt: { $lt: cutoff },
    });
  }

  /** Persist changes on an existing document. */
  async save(paymentDocument) {
    return await paymentDocument.save();
  }

  async deletePayment(paymentDocument) {
    if (paymentDocument) await paymentDocument.deleteOne();
  }
}

export default new PaymentRepository();

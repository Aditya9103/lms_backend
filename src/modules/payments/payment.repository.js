import Payment from './Payment.model.js';

class PaymentRepository {
  async createPayment(paymentData) {
    return await Payment.create(paymentData);
  }

  async findPaymentBySubscriptionId(subscriptionId) {
    return await Payment.findOne({ razorpay_subscription_id: subscriptionId });
  }

  async deletePayment(paymentDocument) {
    if (paymentDocument) await paymentDocument.remove();
  }
}

export default new PaymentRepository();

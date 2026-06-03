import crypto from 'crypto';
import AppError from '../../core/utils/AppError.js';
import { razorpay } from '../../server.js';
import paymentRepository from './payment.repository.js';
import userRepository from '../users/user.repository.js';

class PaymentService {
  async buySubscription(userId) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('Unauthorized, please login', 401);
    if (user.role === 'ADMIN') throw new AppError('Admin cannot purchase a subscription', 400);

    const subscription = await razorpay.subscriptions.create({
      plan_id: process.env.RAZORPAY_PLAN_ID,
      customer_notify: 1,
      total_count: 12,
    });

    user.subscription.id = subscription.id;
    user.subscription.status = subscription.status;
    await userRepository.save(user);

    return subscription.id;
  }

  async verifySubscription(userId, paymentId, subscriptionId, signature) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('Unauthorized', 401);

    const userSubscriptionId = user.subscription.id;

    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_SECRET)
      .update(`${paymentId}|${userSubscriptionId}`)
      .digest('hex');

    if (generatedSignature !== signature) {
      throw new AppError('Payment not verified, please try again.', 400);
    }

    await paymentRepository.createPayment({
      razorpay_payment_id: paymentId,
      razorpay_subscription_id: subscriptionId,
      razorpay_signature: signature,
    });

    user.subscription.status = 'active';
    await userRepository.save(user);
  }

  async cancelSubscription(userId) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('Unauthorized', 401);
    if (user.role === 'ADMIN') throw new AppError('Admin does not need to cancel subscription', 400);

    const subscriptionId = user.subscription.id;
    let subscription;

    try {
      subscription = await razorpay.subscriptions.cancel(subscriptionId);
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

    await razorpay.payments.refund(payment.razorpay_payment_id, { speed: 'optimum' });

    user.subscription.id = undefined;
    user.subscription.status = undefined;
    await userRepository.save(user);
    await paymentRepository.deletePayment(payment);
  }

  async getAllPayments(count, skip) {
    const allPayments = await razorpay.subscriptions.all({
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

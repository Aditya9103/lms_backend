import asyncHandler from '../../core/middlewares/asyncHandler.middleware.js';
import paymentService from './payment.service.js';

export const buySubscription = asyncHandler(async (req, res, next) => {
  try {
    const subscription_id = await paymentService.buySubscription(req.user.id);
    res.status(200).json({
      success: true,
      message: 'subscribed successfully',
      subscription_id,
    });
  } catch (error) {
    return next(error);
  }
});

export const verifySubscription = asyncHandler(async (req, res, next) => {
  const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body;
  try {
    await paymentService.verifySubscription(
      req.user.id,
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature
    );
    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
    });
  } catch (error) {
    return next(error);
  }
});

export const cancelSubscription = asyncHandler(async (req, res, next) => {
  try {
    await paymentService.cancelSubscription(req.user.id);
    res.status(200).json({
      success: true,
      message: 'Subscription canceled successfully',
    });
  } catch (error) {
    return next(error);
  }
});

export const getRazorpayApiKey = asyncHandler(async (_req, res, _next) => {
  res.status(200).json({
    success: true,
    message: 'Razorpay API key',
    key: process.env.RAZORPAY_KEY_ID,
  });
});

export const allPayments = asyncHandler(async (req, res, next) => {
  const { count, skip } = req.query;
  try {
    const data = await paymentService.getAllPayments(count, skip);
    res.status(200).json({
      success: true,
      message: 'All payments',
      ...data,
    });
  } catch (error) {
    return next(error);
  }
});

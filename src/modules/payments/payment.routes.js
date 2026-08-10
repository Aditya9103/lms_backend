import { Router } from 'express';
import {
  getRazorpayApiKey,
  buySubscription,
  verifySubscription,
  cancelSubscription,
  allPayments,
  reconcilePayments,
} from './payment.controller.js';
import {
  authorizeRoles,
  authorizeSubscribers,
  isLoggedIn,
} from '../../core/middlewares/auth.middleware.js';

const router = Router();

router.route('/subscribe').post(isLoggedIn, buySubscription);
router.route('/verify').post(isLoggedIn, verifySubscription);
router
  .route('/unsubscribe')
  .post(isLoggedIn, authorizeSubscribers, cancelSubscription);
router.route('/razorpay-key').get(isLoggedIn, getRazorpayApiKey);
router.route('/').get(isLoggedIn, authorizeRoles('ADMIN'), allPayments);

// Phase 7.2: Admin-triggered reconciliation of unverified payments
router.post('/reconcile', isLoggedIn, authorizeRoles('ADMIN'), reconcilePayments);

export default router;

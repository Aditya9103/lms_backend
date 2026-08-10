import { model, Schema } from 'mongoose';

/**
 * Phase 7: Payment model with idempotency key.
 *
 * idempotencyKey — generated client-side (UUID v4) before calling /subscribe.
 * Prevents duplicate enrollments if the frontend retries after a network error.
 * The unique index ensures the DB rejects a second insert with the same key.
 *
 * webhookVerified — set to true only after HMAC-verified webhook confirms
 * the payment. This is the single source of truth; client-reported success
 * alone is NOT trusted (Phase 7 hardening).
 */
const paymentSchema = new Schema(
  {
    razorpay_payment_id: {
      type: String,
      required: true,
    },
    razorpay_subscription_id: {
      type: String,
      required: true,
    },
    razorpay_signature: {
      type: String,
      required: true,
    },
    // ── Phase 7: Idempotency ────────────────────────────────────────────────
    idempotencyKey: {
      type: String,
      sparse: true,   // unique but allows documents without the field (old data)
      unique: true,
    },
    // ── Phase 7: Webhook verification status ──────────────────────────────
    webhookVerified: {
      type: Boolean,
      default: false,
    },
    webhookVerifiedAt: Date,
    webhookEvent: String,          // raw Razorpay event name, e.g. 'payment.captured'
    // ── Ownership ─────────────────────────────────────────────────────────
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    // ── Reconciliation ─────────────────────────────────────────────────────
    // Set to true if a reconciliation job verified this payment against
    // the Razorpay API independently of the webhook.
    reconciled: { type: Boolean, default: false },
    reconciledAt: Date,
  },
  {
    timestamps: true,
  }
);

const Payment = model('Payment', paymentSchema);

export default Payment;

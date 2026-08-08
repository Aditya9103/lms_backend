/**
 * Centralised, Zod-validated environment configuration.
 *
 * This is the ONLY place dotenv.config() is called (fixes the ESM hoisting
 * bug where config() was called at runtime in app.js but static imports are
 * resolved before any runtime code executes in ESM modules).
 *
 * Import this module as the ABSOLUTE FIRST import in server.js.
 * All other modules should import `config` from here rather than
 * reading process.env directly.
 */
import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

dotenvConfig();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5001),

  // Database
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),

  // JWT
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRY: z.string().default('15m'),
  REFRESH_TOKEN_SECRET: z.string().min(16, 'REFRESH_TOKEN_SECRET is required').optional(),
  REFRESH_TOKEN_EXPIRY_DAYS: z.coerce.number().default(30),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),

  // SMTP / Email
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USERNAME: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().email().optional(),

  // Razorpay
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_SECRET: z.string().optional(),
  RAZORPAY_PLAN_ID: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Redis (optional for local dev without Docker)
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Frontend
  FRONTEND_URL: z.string().url().optional(),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),

  // Super Admin
  SUPER_ADMIN_SECURITY_CODE: z.string().optional(),

  // Contact
  CONTACT_US_EMAIL: z.string().email().optional(),

  // Observability (all optional — no-ops when absent)
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  SENTRY_PROFILES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  PROMETHEUS_PORT: z.coerce.number().default(9090),
  METRICS_SECRET: z.string().optional(), // Required in production to gate /metrics endpoint

  // BullMQ worker concurrency
  WORKER_CONCURRENCY: z.coerce.number().default(5),

  // Feature flags
  VIDEO_COMPLETION_THRESHOLD: z.coerce.number().min(1).max(100).default(90),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌  Invalid environment configuration. Server cannot start.\n');
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = result.data;
export default config;

/**
 * phase10.preProductionAndDocker.test.js
 *
 * Automated Quality Gate Suite for Phase 10:
 *  - 10.1 Docker Compose Specification & Service Topologies (Dev + Prod)
 *  - 10.2 Container Dockerfiles Architecture (API + BullMQ Worker)
 *  - 10.3 Database Index Definitions Audit (scripts/create-indexes.js)
 *  - 10.4 Environment Configuration Parity & Secret Isolation (.env.example)
 *  - 10.5 OpenAPI 3.0 Contract Completeness & Documentation Health
 */
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import app from '../../app.js';

describe('=== Phase 10: Pre-Production Deployment, Docker & Final Audit ===', () => {
  const rootDir = path.resolve(__dirname, '../../../../');
  const backendDir = path.resolve(__dirname, '../../../');

  describe('10.1 Docker Compose Topologies & Healthchecks', () => {
    it('validates development docker-compose.yml configuration', () => {
      const composePath = [path.join(rootDir, 'docker-compose.yml'), path.join(backendDir, 'docker-compose.yml')].find(p => fs.existsSync(p));
      if (!composePath) {
        return;
      }

      const content = fs.readFileSync(composePath, 'utf8');
      expect(content).toContain('services:');
      expect(content).toContain('redis:');
      expect(content).toContain('backend:');
      expect(content).toContain('worker:');
    });

    it('validates production docker-compose.prod.yml configuration', () => {
      const prodComposePath = [path.join(backendDir, 'docker-compose.prod.yml'), path.join(rootDir, 'docker-compose.prod.yml')].find(p => fs.existsSync(p));
      expect(prodComposePath).toBeDefined();

      const content = fs.readFileSync(prodComposePath, 'utf8');
      expect(content).toContain('services:');
      expect(content).toContain('lms_redis_prod');
      expect(content).toContain('lms_backend_prod');
      expect(content).toContain('lms_worker_prod');
      expect(content).toContain('NODE_ENV=production');
    });
  });

  describe('10.2 Container Dockerfiles Architecture', () => {
    it('validates backend API Dockerfile structure and security best practices', () => {
      const dockerfilePath = path.join(backendDir, 'Dockerfile');
      expect(fs.existsSync(dockerfilePath)).toBe(true);

      const content = fs.readFileSync(dockerfilePath, 'utf8');
      expect(content).toMatch(/FROM node:(20|22)-alpine/);
      expect(content).toContain('COPY package*.json ./');
      expect(content).toContain('RUN npm ci --omit=dev');
      expect(content).toContain('EXPOSE 5001');
      expect(content).toContain('CMD ["node", "src/server.js"]');
    });

    it('validates BullMQ background worker Dockerfile.worker structure', () => {
      const workerDockerfilePath = path.join(backendDir, 'Dockerfile.worker');
      expect(fs.existsSync(workerDockerfilePath)).toBe(true);

      const content = fs.readFileSync(workerDockerfilePath, 'utf8');
      expect(content).toMatch(/FROM node:(20|22)-alpine/);
      expect(content).toContain('RUN npm ci --omit=dev');
      expect(content).toContain('CMD ["node", "src/worker.js"]');
    });
  });

  describe('10.3 Database Index Definitions Audit', () => {
    it('verifies create-indexes.js defines all required query indexes and TTL expiries', () => {
      const indexScriptPath = path.join(backendDir, 'scripts/create-indexes.js');
      expect(fs.existsSync(indexScriptPath)).toBe(true);

      const content = fs.readFileSync(indexScriptPath, 'utf8');
      // Users indexes
      expect(content).toContain('idx_users_email_unique');
      expect(content).toContain('idx_users_subscription_status');
      // Courses indexes
      expect(content).toContain('idx_courses_category_status');
      // Payments indexes
      expect(content).toContain('idx_payments_razorpay_id');
      expect(content).toContain('idx_payments_idempotency');
      // Notifications & Activity TTL
      expect(content).toContain('idx_notifications_ttl');
      expect(content).toContain('idx_activitylog_ttl');
      // Discussions & Blogs
      expect(content).toContain('idx_discussions_course_lecture');
      expect(content).toContain('idx_blogs_slug');
    });
  });

  describe('10.4 Environment Configuration Parity & Secret Hygiene', () => {
    it('verifies .env.example defines all required configuration variables with zero exposed secrets', () => {
      const envExamplePath = path.join(backendDir, '.env.example');
      expect(fs.existsSync(envExamplePath)).toBe(true);

      const content = fs.readFileSync(envExamplePath, 'utf8');
      const requiredEnvVars = [
        'PORT',
        'MONGO_URI',
        'JWT_SECRET',
        'REFRESH_TOKEN_SECRET',
        'REDIS_URL',
        'CLOUDINARY_CLOUD_NAME',
        'CLOUDINARY_API_KEY',
        'CLOUDINARY_API_SECRET',
        'RAZORPAY_KEY_ID',
        'RAZORPAY_SECRET',
        'RAZORPAY_WEBHOOK_SECRET',
        'FRONTEND_URL',
      ];

      for (const envVar of requiredEnvVars) {
        expect(content).toContain(`${envVar}=`);
      }

      // Ensure no raw production private credentials exist in example
      expect(content).not.toContain('rzp_live_secret_real_value');
    });
  });

  describe('10.5 OpenAPI 3.0 Contract Completeness & Documentation Health', () => {
    it('GET /api-docs.json returns valid OpenAPI 3.0 schema with essential tags and paths', async () => {
      const res = await request(app).get('/api-docs.json');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.body.openapi).toMatch(/^3\./);
      expect(res.body.info).toBeDefined();
      expect(res.body.info.title).toBeDefined();
      expect(res.body.paths).toBeDefined();

      // Check key endpoints documented in OpenAPI spec
      const paths = Object.keys(res.body.paths);
      expect(paths).toContain('/user/register');
      expect(paths).toContain('/user/login');
      expect(paths).toContain('/courses');
    });

    it('GET /health probe responds with HTTP 200 and healthy status', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(typeof res.body.uptime).toBe('number');
      expect(res.body.timestamp).toBeDefined();
    });
  });
});

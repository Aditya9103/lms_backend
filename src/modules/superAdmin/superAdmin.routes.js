import { Router } from 'express';
import { isLoggedIn, authorizeSuperAdmin } from '../../core/middlewares/auth.middleware.js';
import { 
  getAllUsersAndAdmins, 
  updateRole, 
  createAdmin, 
  getActivities, 
  requestLogDeletion, 
  executeLogDeletion, 
  getSystemHealth, 
  getDashboardStats 
} from './superAdmin.controller.js';

const router = Router();

// Protect all routes
router.use(isLoggedIn, authorizeSuperAdmin);

// User & Admin Management
router.get('/users', getAllUsersAndAdmins);
router.post('/admin', createAdmin);
router.put('/role/:id', updateRole);

// Analytics & Dashboard
router.get('/stats', getDashboardStats);

// System Monitoring
router.get('/health', getSystemHealth);

// Activity Logs & Log Management
router.get('/activities', getActivities);
router.post('/logs/deletion-request', requestLogDeletion);
router.post('/logs/deletion-execute', executeLogDeletion);

export default router;

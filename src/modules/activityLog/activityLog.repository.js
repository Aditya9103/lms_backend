import ActivityLog from './activityLog.model.js';
import AuditLog from './auditLog.model.js';
import SystemLog from './systemLog.model.js';

class ActivityLogRepository {
  async createActivityLog(data) {
    return await ActivityLog.create(data);
  }

  async createAuditLog(data) {
    return await AuditLog.create(data);
  }

  async createSystemLog(data) {
    return await SystemLog.create(data);
  }
}

export default new ActivityLogRepository();

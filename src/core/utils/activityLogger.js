import activityLogRepository from '../../modules/activityLog/activityLog.repository.js';

/**
 * Utility to log activities across the system
 * @param {Object} data 
 * @param {string} data.userId
 * @param {string} data.role
 * @param {string} data.action
 * @param {string} data.module
 * @param {string} data.description
 * @param {Object} req - Express request object for IP and User-Agent
 */
export const logActivity = async ({ userId, role, action, module, description, req }) => {
  try {
    const ipAddress = req?.headers['x-forwarded-for'] || req?.socket?.remoteAddress;
    const browser = req?.headers['user-agent'];
    // Very basic device info extraction from user-agent
    const deviceInfo = browser ? browser.substring(0, 50) : 'Unknown';

    await activityLogRepository.createActivityLog({
      userId,
      role,
      action,
      module,
      description,
      ipAddress,
      deviceInfo,
      browser,
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
};

/**
 * Utility to log detailed audit trails for sensitive changes
 */
export const logAudit = async ({ performedBy, action, entity, entityId, oldValue, newValue, req }) => {
  try {
    const ipAddress = req?.headers['x-forwarded-for'] || req?.socket?.remoteAddress;

    await activityLogRepository.createAuditLog({
      performedBy,
      action,
      entity,
      entityId,
      oldValue,
      newValue,
      ipAddress,
    });
  } catch (error) {
    console.error('Failed to log audit trail:', error);
  }
};

import User from '../users/user.model.js';
import ActivityLog from '../activityLog/activityLog.model.js';

class SuperAdminRepository {
  async findAllUsersAndAdmins() {
    return await User.find({}).select('-password -superAdminSecurityCode -otp -forgotPasswordToken');
  }

  async findUserById(id) {
    return await User.findById(id);
  }

  async findUserByEmail(email) {
    return await User.findOne({ email });
  }

  async createUser(userData) {
    return await User.create(userData);
  }

  async countUsers(query = {}) {
    return await User.countDocuments(query);
  }

  async save(userDocument) {
    return await userDocument.save();
  }

  async getActivities(limit = 1000) {
    return await ActivityLog.find({}).sort({ createdAt: -1 }).limit(limit).populate('userId', 'fullName email');
  }

  async countOldLogs(dateLimit) {
    return await ActivityLog.countDocuments({ createdAt: { $lt: dateLimit } });
  }

  async deleteOldLogs(dateLimit) {
    return await ActivityLog.deleteMany({ createdAt: { $lt: dateLimit } });
  }
}

export default new SuperAdminRepository();

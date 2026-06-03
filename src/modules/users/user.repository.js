import User from './user.model.js';

class UserRepository {
  async create(userData) {
    return await User.create(userData);
  }

  async findById(id) {
    return await User.findById(id);
  }

  async findByIdWithDashboardData(userId) {
    return await User.findById(userId)
      .populate('progress.courseId')
      .populate('recentlyWatched.courseId');
  }

  async findByEmail(email) {
    return await User.findOne({ email });
  }

  async findByEmailWithPassword(email) {
    return await User.findOne({ email }).select('+password +superAdminSecurityCode');
  }

  async findByEmailWithOtp(email) {
    return await User.findOne({ email }).select('+otp');
  }

  async findByForgotPasswordToken(token, currentTime) {
    return await User.findOne({
      forgotPasswordToken: token,
      forgotPasswordExpiry: { $gt: currentTime },
    });
  }

  async save(userDocument) {
    return await userDocument.save();
  }

  async countUsers(query = {}) {
    return await User.countDocuments(query);
  }
}

export default new UserRepository();

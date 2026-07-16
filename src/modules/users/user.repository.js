import User from './user.model.js';
import crypto from 'crypto';

class UserRepository {
  async create(userData) {
    return await User.create(userData);
  }

  async findById(id) {
    return await User.findById(id);
  }

  async findByIdWithTokens(id) {
    return await User.findById(id).select('+refreshTokens.tokenHash');
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

  /**
   * Finds a user by hashing the incoming raw refresh token and comparing
   * against stored hashes. Returns null if no valid, non-revoked,
   * non-expired token matches.
   */
  async findByRefreshToken(rawToken) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    return await User.findOne({
      refreshTokens: {
        $elemMatch: {
          tokenHash,
          isRevoked: false,
          expiresAt: { $gt: new Date() },
        },
      },
    }).select('+refreshTokens.tokenHash');
  }

  /**
   * Marks a specific refresh token as revoked by its hash.
   * Used during rotation (the old token is revoked when a new one is issued).
   */
  async revokeRefreshToken(userId, rawToken) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    return await User.updateOne(
      { _id: userId, 'refreshTokens.tokenHash': tokenHash },
      { $set: { 'refreshTokens.$.isRevoked': true } }
    );
  }

  /**
   * Revokes ALL refresh tokens for a user — used when reuse is detected
   * (sign of token theft) or on explicit logout-all-sessions.
   */
  async revokeAllRefreshTokens(userId) {
    return await User.updateOne(
      { _id: userId },
      { $set: { 'refreshTokens.$[].isRevoked': true } }
    );
  }

  async save(userDocument) {
    return await userDocument.save();
  }

  async countUsers(query = {}) {
    return await User.countDocuments(query);
  }
}

export default new UserRepository();


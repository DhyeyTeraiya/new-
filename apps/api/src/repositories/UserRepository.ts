import { FilterQuery } from 'mongoose';
import { BaseRepository, QueryResult, PaginationOptions, PaginationResult } from './BaseRepository';
import { User, IUserDocument } from '../models/User';
import { logger } from '../utils/logger';

// =============================================================================
// USER REPOSITORY
// Enterprise-Grade User Data Access Layer
// =============================================================================

export class UserRepository extends BaseRepository<IUserDocument> {
  constructor() {
    super(User);
  }

  // =============================================================================
  // USER-SPECIFIC METHODS
  // =============================================================================

  async findByEmail(email: string): Promise<QueryResult<IUserDocument | null>> {
    const startTime = Date.now();
    
    try {
      logger.debug('Finding user by email', { email: email.toLowerCase() });
      
      const user = await this.model.findOne({ 
        email: email.toLowerCase(),
        is_active: true,
      });
      
      const executionTime = Date.now() - startTime;
      
      logger.debug('User found by email', { 
        found: !!user,
        userId: user?._id,
        executionTime,
      });

      return {
        success: true,
        data: user,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Failed to find user by email', {
        email,
        error: errorMessage,
        executionTime,
      });

      return {
        success: false,
        error: errorMessage,
        executionTime,
      };
    }
  }

  async findByUsername(username: string): Promise<QueryResult<IUserDocument | null>> {
    const startTime = Date.now();
    
    try {
      logger.debug('Finding user by username', { username });
      
      const user = await this.model.findOne({ 
        username,
        is_active: true,
      });
      
      const executionTime = Date.now() - startTime;
      
      logger.debug('User found by username', { 
        found: !!user,
        userId: user?._id,
        executionTime,
      });

      return {
        success: true,
        data: user,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Failed to find user by username', {
        username,
        error: errorMessage,
        executionTime,
      });

      return {
        success: false,
        error: errorMessage,
        executionTime,
      };
    }
  }

  async findByApiKey(apiKey: string): Promise<QueryResult<IUserDocument | null>> {
    const startTime = Date.now();
    
    try {
      logger.debug('Finding user by API key');
      
      const user = await this.model.findOne({ 
        'api_access.api_key': apiKey,
        is_active: true,
      });
      
      const executionTime = Date.now() - startTime;
      
      logger.debug('User found by API key', { 
        found: !!user,
        userId: user?._id,
        executionTime,
      });

      return {
        success: true,
        data: user,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Failed to find user by API key', {
        error: errorMessage,
        executionTime,
      });

      return {
        success: false,
        error: errorMessage,
        executionTime,
      };
    }
  }

  async findActiveUsers(
    paginationOptions: PaginationOptions
  ): Promise<QueryResult<PaginationResult<IUserDocument>>> {
    return this.findWithPagination(
      { is_active: true },
      paginationOptions
    );
  }

  async findBySubscriptionStatus(
    status: string,
    paginationOptions: PaginationOptions
  ): Promise<QueryResult<PaginationResult<IUserDocument>>> {
    return this.findWithPagination(
      { 
        'subscription.status': status,
        is_active: true,
      },
      paginationOptions
    );
  }

  async findByRole(
    role: string,
    paginationOptions: PaginationOptions
  ): Promise<QueryResult<PaginationResult<IUserDocument>>> {
    return this.findWithPagination(
      { 
        role,
        is_active: true,
      },
      paginationOptions
    );
  }

  async searchUsers(
    searchTerm: string,
    paginationOptions: PaginationOptions
  ): Promise<QueryResult<PaginationResult<IUserDocument>>> {
    const searchRegex = new RegExp(searchTerm, 'i');
    
    return this.findWithPagination(
      {
        $or: [
          { email: searchRegex },
          { username: searchRegex },
          { 'personal_info.first_name': searchRegex },
          { 'personal_info.last_name': searchRegex },
          { 'personal_info.full_name': searchRegex },
        ],
        is_active: true,
      },
      paginationOptions
    );
  }

  // =============================================================================
  // USER ANALYTICS & STATISTICS
  // =============================================================================

  async getUserStats(): Promise<QueryResult<any>> {
    const pipeline = [
      {
        $match: { is_active: true }
      },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          verifiedUsers: {
            $sum: { $cond: [{ $eq: ['$email_verified', true] }, 1, 0] }
          },
          premiumUsers: {
            $sum: { $cond: [{ $ne: ['$subscription.plan', 'free'] }, 1, 0] }
          },
          avgTasksPerMonth: { $avg: '$usage.tasks_this_month' },
          avgApplicationsPerMonth: { $avg: '$usage.applications_this_month' },
        }
      }
    ];

    return this.aggregate(pipeline);
  }

  async getUsersBySubscriptionPlan(): Promise<QueryResult<any>> {
    const pipeline = [
      {
        $match: { is_active: true }
      },
      {
        $group: {
          _id: '$subscription.plan',
          count: { $sum: 1 },
          totalRevenue: { $sum: '$subscription.amount' },
        }
      },
      {
        $sort: { count: -1 }
      }
    ];

    return this.aggregate(pipeline);
  }

  async getActiveUsersInPeriod(
    startDate: Date,
    endDate: Date
  ): Promise<QueryResult<any>> {
    const pipeline = [
      {
        $match: {
          is_active: true,
          'usage.last_active': {
            $gte: startDate,
            $lte: endDate,
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$usage.last_active'
            }
          },
          activeUsers: { $sum: 1 },
          totalTasks: { $sum: '$usage.tasks_this_month' },
          totalApplications: { $sum: '$usage.applications_this_month' },
        }
      },
      {
        $sort: { _id: 1 }
      }
    ];

    return this.aggregate(pipeline);
  }

  // =============================================================================
  // USER MANAGEMENT OPERATIONS
  // =============================================================================

  async deactivateUser(userId: string): Promise<QueryResult<IUserDocument | null>> {
    return this.updateById(userId, {
      is_active: false,
      updated_at: new Date(),
    });
  }

  async activateUser(userId: string): Promise<QueryResult<IUserDocument | null>> {
    return this.updateById(userId, {
      is_active: true,
      updated_at: new Date(),
    });
  }

  async verifyEmail(userId: string): Promise<QueryResult<IUserDocument | null>> {
    return this.updateById(userId, {
      email_verified: true,
      email_verification_token: undefined,
      updated_at: new Date(),
    });
  }

  async updateLastLogin(userId: string): Promise<QueryResult<IUserDocument | null>> {
    return this.updateById(userId, {
      last_login: new Date(),
      'usage.last_active': new Date(),
    });
  }

  async incrementUsage(
    userId: string,
    type: 'tasks' | 'applications' | 'api_calls'
  ): Promise<QueryResult<IUserDocument | null>> {
    const updateField = `usage.${type}_this_month`;
    
    return this.updateById(userId, {
      $inc: { [updateField]: 1 },
      'usage.last_active': new Date(),
    });
  }

  async resetMonthlyUsage(): Promise<QueryResult<{ matchedCount: number; modifiedCount: number }>> {
    return this.updateMany(
      { is_active: true },
      {
        $set: {
          'usage.tasks_this_month': 0,
          'usage.applications_this_month': 0,
          'usage.api_calls_this_month': 0,
        }
      }
    );
  }

  async updateSubscription(
    userId: string,
    subscriptionData: any
  ): Promise<QueryResult<IUserDocument | null>> {
    return this.updateById(userId, {
      subscription: subscriptionData,
      updated_at: new Date(),
    });
  }

  async addTrustedDevice(
    userId: string,
    deviceInfo: any
  ): Promise<QueryResult<IUserDocument | null>> {
    return this.updateById(userId, {
      $push: {
        'security.trusted_devices': {
          ...deviceInfo,
          last_used: new Date(),
        }
      },
      updated_at: new Date(),
    });
  }

  async removeTrustedDevice(
    userId: string,
    deviceId: string
  ): Promise<QueryResult<IUserDocument | null>> {
    return this.updateById(userId, {
      $pull: {
        'security.trusted_devices': { device_id: deviceId }
      },
      updated_at: new Date(),
    });
  }

  // =============================================================================
  // BULK OPERATIONS
  // =============================================================================

  async bulkUpdateSubscriptions(
    userIds: string[],
    subscriptionUpdate: any
  ): Promise<QueryResult<{ matchedCount: number; modifiedCount: number }>> {
    return this.updateMany(
      { _id: { $in: userIds } },
      {
        $set: {
          subscription: subscriptionUpdate,
          updated_at: new Date(),
        }
      }
    );
  }

  async bulkDeactivateUsers(userIds: string[]): Promise<QueryResult<{ matchedCount: number; modifiedCount: number }>> {
    return this.updateMany(
      { _id: { $in: userIds } },
      {
        $set: {
          is_active: false,
          updated_at: new Date(),
        }
      }
    );
  }

  // =============================================================================
  // CLEANUP OPERATIONS
  // =============================================================================

  async cleanupExpiredTokens(): Promise<QueryResult<{ matchedCount: number; modifiedCount: number }>> {
    const now = new Date();
    
    return this.updateMany(
      {
        $or: [
          { password_reset_expires: { $lt: now } },
          { 'security.account_locked_until': { $lt: now } },
        ]
      },
      {
        $unset: {
          password_reset_token: '',
          password_reset_expires: '',
          'security.account_locked_until': '',
        },
        $set: {
          'security.failed_login_attempts': 0,
        }
      }
    );
  }

  async cleanupInactiveUsers(daysInactive: number): Promise<QueryResult<{ deletedCount: number }>> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysInactive);
    
    return this.deleteMany({
      is_active: false,
      updated_at: { $lt: cutoffDate },
      email_verified: false,
    });
  }
}

export default new UserRepository();
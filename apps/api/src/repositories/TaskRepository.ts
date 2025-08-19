import { FilterQuery } from 'mongoose';
import { BaseRepository, QueryResult, PaginationOptions, PaginationResult } from './BaseRepository';
import { Task, ITaskDocument } from '../models/Task';
import { TaskStatus, TaskType, TaskPriority } from '@browser-ai-agent/shared/types/agent';
import { logger } from '../utils/logger';

// =============================================================================
// TASK REPOSITORY
// Enterprise-Grade Task Data Access Layer
// =============================================================================

export class TaskRepository extends BaseRepository<ITaskDocument> {
  constructor() {
    super(Task);
  }

  // =============================================================================
  // TASK-SPECIFIC METHODS
  // =============================================================================

  async findByUser(
    userId: string,
    options: {
      status?: TaskStatus;
      type?: TaskType;
      limit?: number;
      sort?: Record<string, 1 | -1>;
    } = {}
  ): Promise<QueryResult<ITaskDocument[]>> {
    const { status, type, limit = 50, sort = { createdAt: -1 } } = options;
    
    const filter: FilterQuery<ITaskDocument> = { userId };
    if (status) filter.status = status;
    if (type) filter.type = type;

    return this.find(filter, { limit, sort });
  }

  async findUserTasksWithPagination(
    userId: string,
    paginationOptions: PaginationOptions,
    filters: {
      status?: TaskStatus;
      type?: TaskType;
      priority?: TaskPriority;
      category?: string;
      tags?: string[];
      search?: string;
    } = {}
  ): Promise<QueryResult<PaginationResult<ITaskDocument>>> {
    const { status, type, priority, category, tags, search } = filters;
    
    const filter: FilterQuery<ITaskDocument> = { userId };
    
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (priority) filter.priority = priority;
    if (category) filter.category = category;
    if (tags && tags.length > 0) filter.tags = { $in: tags };
    
    if (search) {
      filter.$text = { $search: search };
    }

    return this.findWithPagination(filter, paginationOptions);
  }

  async findRunningTasks(): Promise<QueryResult<ITaskDocument[]>> {
    return this.find({ status: TaskStatus.RUNNING });
  }

  async findPendingTasks(limit = 100): Promise<QueryResult<ITaskDocument[]>> {
    return this.find(
      { status: TaskStatus.PENDING },
      { 
        limit,
        sort: { priority: -1, createdAt: 1 } // High priority first, then FIFO
      }
    );
  }

  async findScheduledTasks(): Promise<QueryResult<ITaskDocument[]>> {
    return this.find({
      scheduledFor: { $lte: new Date() },
      status: TaskStatus.PENDING,
    });
  }

  async findRecurringTasks(): Promise<QueryResult<ITaskDocument[]>> {
    return this.find({
      'recurring.enabled': true,
      'recurring.nextRun': { $lte: new Date() },
    });
  }

  async findTasksByStatus(
    status: TaskStatus,
    paginationOptions: PaginationOptions
  ): Promise<QueryResult<PaginationResult<ITaskDocument>>> {
    return this.findWithPagination({ status }, paginationOptions);
  }

  async findTasksByType(
    type: TaskType,
    paginationOptions: PaginationOptions
  ): Promise<QueryResult<PaginationResult<ITaskDocument>>> {
    return this.findWithPagination({ type }, paginationOptions);
  }

  async findTasksByPriority(
    priority: TaskPriority,
    paginationOptions: PaginationOptions
  ): Promise<QueryResult<PaginationResult<ITaskDocument>>> {
    return this.findWithPagination({ priority }, paginationOptions);
  }

  // =============================================================================
  // TASK ANALYTICS & STATISTICS
  // =============================================================================

  async getTaskStats(userId?: string): Promise<QueryResult<any>> {
    const matchFilter = userId ? { userId } : {};
    
    const pipeline = [
      { $match: matchFilter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgExecutionTime: { $avg: '$executionMetadata.executionTime' },
          totalCost: { $sum: '$executionMetadata.cost' },
          avgRetries: { $avg: '$executionMetadata.retryCount' },
        }
      },
      {
        $sort: { count: -1 }
      }
    ];

    return this.aggregate(pipeline);
  }

  async getTaskStatsByType(userId?: string): Promise<QueryResult<any>> {
    const matchFilter = userId ? { userId } : {};
    
    const pipeline = [
      { $match: matchFilter },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', TaskStatus.COMPLETED] }, 1, 0] }
          },
          failed: {
            $sum: { $cond: [{ $eq: ['$status', TaskStatus.FAILED] }, 1, 0] }
          },
          avgExecutionTime: { $avg: '$executionMetadata.executionTime' },
          totalCost: { $sum: '$executionMetadata.cost' },
        }
      },
      {
        $addFields: {
          successRate: {
            $multiply: [
              { $divide: ['$completed', '$count'] },
              100
            ]
          }
        }
      },
      {
        $sort: { count: -1 }
      }
    ];

    return this.aggregate(pipeline);
  }

  async getTasksInPeriod(
    startDate: Date,
    endDate: Date,
    userId?: string
  ): Promise<QueryResult<any>> {
    const matchFilter: any = {
      createdAt: { $gte: startDate, $lte: endDate }
    };
    
    if (userId) {
      matchFilter.userId = userId;
    }
    
    const pipeline = [
      { $match: matchFilter },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt'
              }
            },
            status: '$status'
          },
          count: { $sum: 1 },
          totalExecutionTime: { $sum: '$executionMetadata.executionTime' },
          totalCost: { $sum: '$executionMetadata.cost' },
        }
      },
      {
        $group: {
          _id: '$_id.date',
          statuses: {
            $push: {
              status: '$_id.status',
              count: '$count',
              totalExecutionTime: '$totalExecutionTime',
              totalCost: '$totalCost',
            }
          },
          totalTasks: { $sum: '$count' },
        }
      },
      {
        $sort: { _id: 1 }
      }
    ];

    return this.aggregate(pipeline);
  }

  async getPerformanceMetrics(userId?: string): Promise<QueryResult<any>> {
    const matchFilter = userId ? { userId } : {};
    
    const pipeline = [
      {
        $match: {
          ...matchFilter,
          status: { $in: [TaskStatus.COMPLETED, TaskStatus.FAILED] }
        }
      },
      {
        $group: {
          _id: null,
          totalTasks: { $sum: 1 },
          completedTasks: {
            $sum: { $cond: [{ $eq: ['$status', TaskStatus.COMPLETED] }, 1, 0] }
          },
          failedTasks: {
            $sum: { $cond: [{ $eq: ['$status', TaskStatus.FAILED] }, 1, 0] }
          },
          avgExecutionTime: { $avg: '$executionMetadata.executionTime' },
          minExecutionTime: { $min: '$executionMetadata.executionTime' },
          maxExecutionTime: { $max: '$executionMetadata.executionTime' },
          totalCost: { $sum: '$executionMetadata.cost' },
          avgRetries: { $avg: '$executionMetadata.retryCount' },
          totalRetries: { $sum: '$executionMetadata.retryCount' },
        }
      },
      {
        $addFields: {
          successRate: {
            $multiply: [
              { $divide: ['$completedTasks', '$totalTasks'] },
              100
            ]
          },
          failureRate: {
            $multiply: [
              { $divide: ['$failedTasks', '$totalTasks'] },
              100
            ]
          },
          avgCostPerTask: {
            $divide: ['$totalCost', '$totalTasks']
          }
        }
      }
    ];

    return this.aggregate(pipeline);
  }

  // =============================================================================
  // TASK MANAGEMENT OPERATIONS
  // =============================================================================

  async startTask(taskId: string): Promise<QueryResult<ITaskDocument | null>> {
    return this.updateById(taskId, {
      status: TaskStatus.RUNNING,
      startedAt: new Date(),
      'progress.percentage': 0,
      $push: {
        auditLog: {
          timestamp: new Date(),
          action: 'task_started',
          success: true,
        }
      }
    });
  }

  async completeTask(
    taskId: string,
    results: any,
    executionTime?: number
  ): Promise<QueryResult<ITaskDocument | null>> {
    const updateData: any = {
      status: TaskStatus.COMPLETED,
      completedAt: new Date(),
      'progress.percentage': 100,
      results,
      $push: {
        auditLog: {
          timestamp: new Date(),
          action: 'task_completed',
          success: true,
          details: { results },
        }
      }
    };

    if (executionTime) {
      updateData['executionMetadata.executionTime'] = executionTime;
    }

    return this.updateById(taskId, updateData);
  }

  async failTask(
    taskId: string,
    error: string,
    executionTime?: number
  ): Promise<QueryResult<ITaskDocument | null>> {
    const updateData: any = {
      status: TaskStatus.FAILED,
      completedAt: new Date(),
      error,
      $push: {
        auditLog: {
          timestamp: new Date(),
          action: 'task_failed',
          success: false,
          details: { error },
        }
      }
    };

    if (executionTime) {
      updateData['executionMetadata.executionTime'] = executionTime;
    }

    return this.updateById(taskId, updateData);
  }

  async pauseTask(taskId: string): Promise<QueryResult<ITaskDocument | null>> {
    return this.updateById(taskId, {
      status: TaskStatus.PAUSED,
      $push: {
        auditLog: {
          timestamp: new Date(),
          action: 'task_paused',
          success: true,
        }
      }
    });
  }

  async resumeTask(taskId: string): Promise<QueryResult<ITaskDocument | null>> {
    return this.updateById(taskId, {
      status: TaskStatus.RUNNING,
      $push: {
        auditLog: {
          timestamp: new Date(),
          action: 'task_resumed',
          success: true,
        }
      }
    });
  }

  async cancelTask(taskId: string): Promise<QueryResult<ITaskDocument | null>> {
    return this.updateById(taskId, {
      status: TaskStatus.CANCELLED,
      completedAt: new Date(),
      $push: {
        auditLog: {
          timestamp: new Date(),
          action: 'task_cancelled',
          success: true,
        }
      }
    });
  }

  async updateProgress(
    taskId: string,
    percentage: number,
    currentStep?: string,
    estimatedTimeLeft?: number
  ): Promise<QueryResult<ITaskDocument | null>> {
    const updateData: any = {
      'progress.percentage': Math.max(0, Math.min(100, percentage)),
      $push: {
        auditLog: {
          timestamp: new Date(),
          action: 'progress_updated',
          success: true,
          details: { percentage, currentStep, estimatedTimeLeft },
        }
      }
    };

    if (currentStep) {
      updateData['progress.currentStep'] = currentStep;
    }

    if (estimatedTimeLeft !== undefined) {
      updateData['progress.estimatedTimeLeft'] = estimatedTimeLeft;
    }

    return this.updateById(taskId, updateData);
  }

  async retryTask(taskId: string): Promise<QueryResult<ITaskDocument | null>> {
    return this.updateById(taskId, {
      status: TaskStatus.PENDING,
      error: null,
      'progress.percentage': 0,
      'progress.currentStep': '',
      $inc: { 'executionMetadata.retryCount': 1 },
      $push: {
        auditLog: {
          timestamp: new Date(),
          action: 'task_retried',
          success: true,
        }
      }
    });
  }

  // =============================================================================
  // BULK OPERATIONS
  // =============================================================================

  async bulkUpdateStatus(
    taskIds: string[],
    status: TaskStatus
  ): Promise<QueryResult<{ matchedCount: number; modifiedCount: number }>> {
    return this.updateMany(
      { _id: { $in: taskIds } },
      {
        status,
        updatedAt: new Date(),
        $push: {
          auditLog: {
            timestamp: new Date(),
            action: 'bulk_status_update',
            success: true,
            details: { newStatus: status },
          }
        }
      }
    );
  }

  async bulkCancelTasks(
    taskIds: string[]
  ): Promise<QueryResult<{ matchedCount: number; modifiedCount: number }>> {
    return this.updateMany(
      { 
        _id: { $in: taskIds },
        status: { $in: [TaskStatus.PENDING, TaskStatus.RUNNING, TaskStatus.PAUSED] }
      },
      {
        status: TaskStatus.CANCELLED,
        completedAt: new Date(),
        $push: {
          auditLog: {
            timestamp: new Date(),
            action: 'bulk_cancelled',
            success: true,
          }
        }
      }
    );
  }

  // =============================================================================
  // CLEANUP OPERATIONS
  // =============================================================================

  async cleanupOldTasks(daysOld: number): Promise<QueryResult<{ deletedCount: number }>> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    return this.deleteMany({
      status: { $in: [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED] },
      completedAt: { $lt: cutoffDate },
    });
  }

  async cleanupStuckTasks(hoursStuck: number): Promise<QueryResult<{ matchedCount: number; modifiedCount: number }>> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hoursStuck);
    
    return this.updateMany(
      {
        status: TaskStatus.RUNNING,
        startedAt: { $lt: cutoffDate },
      },
      {
        status: TaskStatus.FAILED,
        error: 'Task stuck - automatically failed after timeout',
        completedAt: new Date(),
        $push: {
          auditLog: {
            timestamp: new Date(),
            action: 'auto_failed_stuck',
            success: false,
            details: { reason: 'Task stuck timeout' },
          }
        }
      }
    );
  }

  // =============================================================================
  // SEARCH OPERATIONS
  // =============================================================================

  async searchTasks(
    searchTerm: string,
    userId?: string,
    paginationOptions: PaginationOptions = { page: 1, limit: 20 }
  ): Promise<QueryResult<PaginationResult<ITaskDocument>>> {
    const filter: FilterQuery<ITaskDocument> = {
      $text: { $search: searchTerm }
    };
    
    if (userId) {
      filter.userId = userId;
    }

    return this.findWithPagination(filter, paginationOptions);
  }

  async findTasksByTags(
    tags: string[],
    userId?: string,
    paginationOptions: PaginationOptions = { page: 1, limit: 20 }
  ): Promise<QueryResult<PaginationResult<ITaskDocument>>> {
    const filter: FilterQuery<ITaskDocument> = {
      tags: { $in: tags }
    };
    
    if (userId) {
      filter.userId = userId;
    }

    return this.findWithPagination(filter, paginationOptions);
  }
}

export default new TaskRepository();
import { Document, Model, FilterQuery, UpdateQuery, QueryOptions } from 'mongoose';
import { logger } from '../utils/logger';

// =============================================================================
// BASE REPOSITORY PATTERN
// Enterprise-Grade Data Access Layer
// =============================================================================

export interface PaginationOptions {
  page: number;
  limit: number;
  sort?: Record<string, 1 | -1>;
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface QueryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  executionTime?: number;
}

export abstract class BaseRepository<T extends Document> {
  protected model: Model<T>;
  protected modelName: string;

  constructor(model: Model<T>) {
    this.model = model;
    this.modelName = model.modelName;
  }

  // =============================================================================
  // CRUD OPERATIONS
  // =============================================================================

  async create(data: Partial<T>): Promise<QueryResult<T>> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Creating ${this.modelName}`, { data });
      
      const document = new this.model(data);
      const savedDocument = await document.save();
      
      const executionTime = Date.now() - startTime;
      
      logger.info(`✅ Created ${this.modelName}`, {
        id: savedDocument._id,
        executionTime,
      });

      return {
        success: true,
        data: savedDocument,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(`❌ Failed to create ${this.modelName}`, {
        error: errorMessage,
        data,
        executionTime,
      });

      return {
        success: false,
        error: errorMessage,
        executionTime,
      };
    }
  }

  async findById(id: string): Promise<QueryResult<T | null>> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Finding ${this.modelName} by ID`, { id });
      
      const document = await this.model.findById(id);
      const executionTime = Date.now() - startTime;
      
      if (document) {
        logger.debug(`✅ Found ${this.modelName}`, { id, executionTime });
      } else {
        logger.debug(`❌ ${this.modelName} not found`, { id, executionTime });
      }

      return {
        success: true,
        data: document,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(`❌ Failed to find ${this.modelName} by ID`, {
        id,
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

  async findOne(filter: FilterQuery<T>): Promise<QueryResult<T | null>> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Finding one ${this.modelName}`, { filter });
      
      const document = await this.model.findOne(filter);
      const executionTime = Date.now() - startTime;
      
      logger.debug(`✅ Found ${this.modelName}`, { 
        found: !!document,
        executionTime,
      });

      return {
        success: true,
        data: document,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(`❌ Failed to find one ${this.modelName}`, {
        filter,
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

  async find(
    filter: FilterQuery<T> = {},
    options: QueryOptions = {}
  ): Promise<QueryResult<T[]>> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Finding ${this.modelName} documents`, { filter, options });
      
      const documents = await this.model.find(filter, null, options);
      const executionTime = Date.now() - startTime;
      
      logger.debug(`✅ Found ${documents.length} ${this.modelName} documents`, {
        count: documents.length,
        executionTime,
      });

      return {
        success: true,
        data: documents,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(`❌ Failed to find ${this.modelName} documents`, {
        filter,
        options,
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

  async findWithPagination(
    filter: FilterQuery<T> = {},
    paginationOptions: PaginationOptions
  ): Promise<QueryResult<PaginationResult<T>>> {
    const startTime = Date.now();
    
    try {
      const { page, limit, sort = { createdAt: -1 } } = paginationOptions;
      const skip = (page - 1) * limit;

      logger.debug(`Finding ${this.modelName} with pagination`, {
        filter,
        page,
        limit,
        sort,
      });

      const [documents, total] = await Promise.all([
        this.model.find(filter).sort(sort).skip(skip).limit(limit),
        this.model.countDocuments(filter),
      ]);

      const pages = Math.ceil(total / limit);
      const executionTime = Date.now() - startTime;

      const result: PaginationResult<T> = {
        data: documents,
        pagination: {
          page,
          limit,
          total,
          pages,
          hasNext: page < pages,
          hasPrev: page > 1,
        },
      };

      logger.debug(`✅ Found ${documents.length} ${this.modelName} documents with pagination`, {
        count: documents.length,
        total,
        pages,
        executionTime,
      });

      return {
        success: true,
        data: result,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(`❌ Failed to find ${this.modelName} with pagination`, {
        filter,
        paginationOptions,
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

  async updateById(
    id: string,
    update: UpdateQuery<T>,
    options: QueryOptions = { new: true }
  ): Promise<QueryResult<T | null>> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Updating ${this.modelName} by ID`, { id, update });
      
      const document = await this.model.findByIdAndUpdate(id, update, options);
      const executionTime = Date.now() - startTime;
      
      if (document) {
        logger.info(`✅ Updated ${this.modelName}`, { id, executionTime });
      } else {
        logger.warn(`❌ ${this.modelName} not found for update`, { id, executionTime });
      }

      return {
        success: true,
        data: document,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(`❌ Failed to update ${this.modelName} by ID`, {
        id,
        update,
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

  async updateOne(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
    options: QueryOptions = { new: true }
  ): Promise<QueryResult<T | null>> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Updating one ${this.modelName}`, { filter, update });
      
      const document = await this.model.findOneAndUpdate(filter, update, options);
      const executionTime = Date.now() - startTime;
      
      if (document) {
        logger.info(`✅ Updated ${this.modelName}`, { executionTime });
      } else {
        logger.warn(`❌ ${this.modelName} not found for update`, { filter, executionTime });
      }

      return {
        success: true,
        data: document,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(`❌ Failed to update one ${this.modelName}`, {
        filter,
        update,
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

  async updateMany(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>
  ): Promise<QueryResult<{ matchedCount: number; modifiedCount: number }>> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Updating many ${this.modelName}`, { filter, update });
      
      const result = await this.model.updateMany(filter, update);
      const executionTime = Date.now() - startTime;
      
      logger.info(`✅ Updated ${result.modifiedCount} ${this.modelName} documents`, {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        executionTime,
      });

      return {
        success: true,
        data: {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
        },
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(`❌ Failed to update many ${this.modelName}`, {
        filter,
        update,
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

  async deleteById(id: string): Promise<QueryResult<T | null>> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Deleting ${this.modelName} by ID`, { id });
      
      const document = await this.model.findByIdAndDelete(id);
      const executionTime = Date.now() - startTime;
      
      if (document) {
        logger.info(`✅ Deleted ${this.modelName}`, { id, executionTime });
      } else {
        logger.warn(`❌ ${this.modelName} not found for deletion`, { id, executionTime });
      }

      return {
        success: true,
        data: document,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(`❌ Failed to delete ${this.modelName} by ID`, {
        id,
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

  async deleteOne(filter: FilterQuery<T>): Promise<QueryResult<T | null>> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Deleting one ${this.modelName}`, { filter });
      
      const document = await this.model.findOneAndDelete(filter);
      const executionTime = Date.now() - startTime;
      
      if (document) {
        logger.info(`✅ Deleted ${this.modelName}`, { executionTime });
      } else {
        logger.warn(`❌ ${this.modelName} not found for deletion`, { filter, executionTime });
      }

      return {
        success: true,
        data: document,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(`❌ Failed to delete one ${this.modelName}`, {
        filter,
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

  async deleteMany(filter: FilterQuery<T>): Promise<QueryResult<{ deletedCount: number }>> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Deleting many ${this.modelName}`, { filter });
      
      const result = await this.model.deleteMany(filter);
      const executionTime = Date.now() - startTime;
      
      logger.info(`✅ Deleted ${result.deletedCount} ${this.modelName} documents`, {
        deletedCount: result.deletedCount,
        executionTime,
      });

      return {
        success: true,
        data: { deletedCount: result.deletedCount },
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(`❌ Failed to delete many ${this.modelName}`, {
        filter,
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

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  async count(filter: FilterQuery<T> = {}): Promise<QueryResult<number>> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Counting ${this.modelName} documents`, { filter });
      
      const count = await this.model.countDocuments(filter);
      const executionTime = Date.now() - startTime;
      
      logger.debug(`✅ Counted ${count} ${this.modelName} documents`, {
        count,
        executionTime,
      });

      return {
        success: true,
        data: count,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(`❌ Failed to count ${this.modelName} documents`, {
        filter,
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

  async exists(filter: FilterQuery<T>): Promise<QueryResult<boolean>> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Checking if ${this.modelName} exists`, { filter });
      
      const document = await this.model.findOne(filter).select('_id');
      const exists = !!document;
      const executionTime = Date.now() - startTime;
      
      logger.debug(`✅ ${this.modelName} exists: ${exists}`, {
        exists,
        executionTime,
      });

      return {
        success: true,
        data: exists,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(`❌ Failed to check if ${this.modelName} exists`, {
        filter,
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

  async aggregate(pipeline: any[]): Promise<QueryResult<any[]>> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Aggregating ${this.modelName} documents`, { pipeline });
      
      const result = await this.model.aggregate(pipeline);
      const executionTime = Date.now() - startTime;
      
      logger.debug(`✅ Aggregated ${result.length} ${this.modelName} results`, {
        count: result.length,
        executionTime,
      });

      return {
        success: true,
        data: result,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(`❌ Failed to aggregate ${this.modelName} documents`, {
        pipeline,
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

  // =============================================================================
  // TRANSACTION SUPPORT
  // =============================================================================

  async withTransaction<R>(
    operation: (session: any) => Promise<R>
  ): Promise<QueryResult<R>> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Starting transaction for ${this.modelName}`);
      
      const result = await this.model.db.transaction(async (session) => {
        return await operation(session);
      });
      
      const executionTime = Date.now() - startTime;
      
      logger.info(`✅ Transaction completed for ${this.modelName}`, {
        executionTime,
      });

      return {
        success: true,
        data: result,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(`❌ Transaction failed for ${this.modelName}`, {
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

  // =============================================================================
  // BULK OPERATIONS
  // =============================================================================

  async bulkWrite(operations: any[]): Promise<QueryResult<any>> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Bulk write for ${this.modelName}`, { 
        operationCount: operations.length,
      });
      
      const result = await this.model.bulkWrite(operations);
      const executionTime = Date.now() - startTime;
      
      logger.info(`✅ Bulk write completed for ${this.modelName}`, {
        insertedCount: result.insertedCount,
        modifiedCount: result.modifiedCount,
        deletedCount: result.deletedCount,
        executionTime,
      });

      return {
        success: true,
        data: result,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(`❌ Bulk write failed for ${this.modelName}`, {
        operationCount: operations.length,
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
}
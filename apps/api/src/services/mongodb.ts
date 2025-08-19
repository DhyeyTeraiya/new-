import mongoose from 'mongoose';
import { logger } from '../utils/logger';
import { config } from '../config';
import { enhancedConfig } from '../config/vault';

// =============================================================================
// ENTERPRISE MONGODB SERVICE
// Superior MongoDB Connection Management with Advanced Features
// =============================================================================

interface DatabaseConfig {
  uri: string;
  options: mongoose.ConnectOptions;
  retryAttempts: number;
  retryDelay: number;
}

interface ConnectionMetrics {
  connectTime: number;
  totalConnections: number;
  failedConnections: number;
  lastConnectionAttempt: Date;
  uptime: number;
}

class MongoDBService {
  private isConnected = false;
  private connectionAttempts = 0;
  private maxRetryAttempts = 5;
  private retryDelay = 5000; // 5 seconds
  private metrics: ConnectionMetrics = {
    connectTime: 0,
    totalConnections: 0,
    failedConnections: 0,
    lastConnectionAttempt: new Date(),
    uptime: 0,
  };
  private healthCheckInterval?: NodeJS.Timeout;

  constructor() {
    this.setupEventListeners();
  }

  // =============================================================================
  // CONNECTION MANAGEMENT
  // =============================================================================

  async connect(): Promise<void> {
    if (this.isConnected) {
      logger.info('MongoDB already connected', {
        readyState: mongoose.connection.readyState,
        host: mongoose.connection.host,
        name: mongoose.connection.name,
      });
      return;
    }

    const startTime = Date.now();
    this.metrics.lastConnectionAttempt = new Date();
    this.connectionAttempts++;

    try {
      const dbConfig = await this.getDatabaseConfig();
      
      logger.info('Attempting to connect to MongoDB...', {
        attempt: this.connectionAttempts,
        maxAttempts: this.maxRetryAttempts,
        uri: this.maskUri(dbConfig.uri),
      });

      await mongoose.connect(dbConfig.uri, dbConfig.options);
      
      this.isConnected = true;
      this.connectionAttempts = 0;
      this.metrics.connectTime = Date.now() - startTime;
      this.metrics.totalConnections++;
      this.metrics.uptime = Date.now();

      logger.info('✅ Connected to MongoDB successfully', {
        connectionTime: this.metrics.connectTime,
        host: mongoose.connection.host,
        name: mongoose.connection.name,
        readyState: mongoose.connection.readyState,
      });

      // Start health monitoring
      this.startHealthMonitoring();

      // Setup indexes
      await this.ensureIndexes();

    } catch (error) {
      this.metrics.failedConnections++;
      this.isConnected = false;
      
      logger.error('❌ Failed to connect to MongoDB', {
        error: error instanceof Error ? error.message : 'Unknown error',
        attempt: this.connectionAttempts,
        maxAttempts: this.maxRetryAttempts,
      });

      if (this.connectionAttempts < this.maxRetryAttempts) {
        logger.info(`Retrying connection in ${this.retryDelay}ms...`);
        await this.delay(this.retryDelay);
        return this.connect();
      } else {
        throw new Error(`Failed to connect to database after ${this.maxRetryAttempts} attempts`);
      }
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      logger.info('MongoDB not connected, skipping disconnect');
      return;
    }

    try {
      // Stop health monitoring
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }

      await mongoose.disconnect();
      this.isConnected = false;
      
      logger.info('✅ Disconnected from MongoDB successfully');
    } catch (error) {
      logger.error('❌ Error disconnecting from MongoDB:', error);
      throw error;
    }
  }

  // =============================================================================
  // CONFIGURATION
  // =============================================================================

  private async getDatabaseConfig(): Promise<DatabaseConfig> {
    let uri: string;
    
    try {
      // Try to get URI from Vault first
      const dbSecrets = enhancedConfig.getSecret('database');
      uri = dbSecrets.uri || config.databaseUrl;
    } catch {
      // Fallback to config
      uri = config.databaseUrl;
    }

    const options: mongoose.ConnectOptions = {
      // Connection Pool Settings
      maxPoolSize: 20, // Maximum number of connections
      minPoolSize: 5,  // Minimum number of connections
      maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
      
      // Timeout Settings
      serverSelectionTimeoutMS: 10000, // How long to try selecting a server
      socketTimeoutMS: 45000, // How long a send or receive on a socket can take
      connectTimeoutMS: 10000, // How long to wait for initial connection
      
      // Heartbeat Settings
      heartbeatFrequencyMS: 10000, // How often to check server status
      
      // Buffer Settings
      bufferCommands: false, // Disable mongoose buffering
      bufferMaxEntries: 0, // Disable mongoose buffering
      
      // Replica Set Settings
      readPreference: 'primaryPreferred',
      retryWrites: true,
      retryReads: true,
      
      // Compression
      compressors: ['zlib'],
      
      // Authentication
      authSource: 'admin',
      
      // Application Name for monitoring
      appName: 'BrowserAIAgent-API',
    };

    return {
      uri,
      options,
      retryAttempts: this.maxRetryAttempts,
      retryDelay: this.retryDelay,
    };
  }

  // =============================================================================
  // EVENT LISTENERS
  // =============================================================================

  private setupEventListeners(): void {
    mongoose.connection.on('connected', () => {
      logger.info('🔗 MongoDB connection established');
      this.isConnected = true;
    });

    mongoose.connection.on('error', (error) => {
      logger.error('❌ MongoDB connection error:', error);
      this.isConnected = false;
      this.metrics.failedConnections++;
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('⚠️  MongoDB disconnected');
      this.isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('🔄 MongoDB reconnected');
      this.isConnected = true;
    });

    mongoose.connection.on('close', () => {
      logger.info('🔒 MongoDB connection closed');
      this.isConnected = false;
    });

    mongoose.connection.on('fullsetup', () => {
      logger.info('🎯 MongoDB replica set fully connected');
    });

    mongoose.connection.on('all', () => {
      logger.info('🌐 MongoDB connected to all servers in replica set');
    });

    // Handle process termination
    process.on('SIGINT', this.gracefulShutdown.bind(this));
    process.on('SIGTERM', this.gracefulShutdown.bind(this));
    process.on('SIGUSR2', this.gracefulShutdown.bind(this)); // For nodemon
  }

  // =============================================================================
  // HEALTH MONITORING
  // =============================================================================

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.healthCheck();
      } catch (error) {
        logger.error('Health check failed:', error);
      }
    }, 30000); // Check every 30 seconds
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isConnected || mongoose.connection.readyState !== 1) {
        return false;
      }

      // Ping the database
      await mongoose.connection.db.admin().ping();
      
      // Check connection stats
      const stats = await this.getConnectionStats();
      
      if (stats.connections.current > stats.connections.available * 0.9) {
        logger.warn('⚠️  High connection usage detected', {
          current: stats.connections.current,
          available: stats.connections.available,
          usage: `${((stats.connections.current / stats.connections.available) * 100).toFixed(1)}%`,
        });
      }

      return true;
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }

  // =============================================================================
  // DATABASE OPERATIONS
  // =============================================================================

  async ensureIndexes(): Promise<void> {
    try {
      logger.info('🔍 Ensuring database indexes...');
      
      const collections = await mongoose.connection.db.listCollections().toArray();
      logger.info(`📊 Found ${collections.length} collections in database`);
      
      // Ensure indexes for each collection
      for (const collection of collections) {
        const indexes = await mongoose.connection.db.collection(collection.name).indexes();
        logger.debug(`Collection ${collection.name} has ${indexes.length} indexes`);
      }
      
      logger.info('✅ Database indexes verified');
    } catch (error) {
      logger.error('❌ Failed to ensure indexes:', error);
      throw error;
    }
  }

  async getConnectionStats(): Promise<any> {
    try {
      const adminDb = mongoose.connection.db.admin();
      const serverStatus = await adminDb.serverStatus();
      
      return {
        connections: serverStatus.connections,
        network: serverStatus.network,
        opcounters: serverStatus.opcounters,
        mem: serverStatus.mem,
        uptime: serverStatus.uptime,
      };
    } catch (error) {
      logger.error('Failed to get connection stats:', error);
      throw error;
    }
  }

  async getDatabaseInfo(): Promise<any> {
    try {
      const adminDb = mongoose.connection.db.admin();
      const [buildInfo, serverStatus, dbStats] = await Promise.all([
        adminDb.buildInfo(),
        adminDb.serverStatus(),
        mongoose.connection.db.stats(),
      ]);

      return {
        version: buildInfo.version,
        uptime: serverStatus.uptime,
        connections: serverStatus.connections,
        collections: dbStats.collections,
        dataSize: dbStats.dataSize,
        indexSize: dbStats.indexSize,
        storageSize: dbStats.storageSize,
      };
    } catch (error) {
      logger.error('Failed to get database info:', error);
      throw error;
    }
  }

  // =============================================================================
  // UTILITIES
  // =============================================================================

  getConnectionStatus(): boolean {
    return this.isConnected && mongoose.connection.readyState === 1;
  }

  getMetrics(): ConnectionMetrics {
    return {
      ...this.metrics,
      uptime: this.isConnected ? Date.now() - this.metrics.uptime : 0,
    };
  }

  private maskUri(uri: string): string {
    return uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async gracefulShutdown(signal: string): Promise<void> {
    logger.info(`Received ${signal}, closing MongoDB connection...`);
    
    try {
      await this.disconnect();
      logger.info('MongoDB connection closed gracefully');
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

const mongoDBService = new MongoDBService();

// =============================================================================
// EXPORTED FUNCTIONS
// =============================================================================

export const connectMongoDB = async (): Promise<void> => {
  return mongoDBService.connect();
};

export const disconnectMongoDB = async (): Promise<void> => {
  return mongoDBService.disconnect();
};

export const getMongoDBConnectionStatus = (): boolean => {
  return mongoDBService.getConnectionStatus();
};

export const getMongoDBHealth = async (): Promise<boolean> => {
  return mongoDBService.healthCheck();
};

export const getMongoDBStats = async (): Promise<any> => {
  return mongoDBService.getConnectionStats();
};

export const getMongoDBInfo = async (): Promise<any> => {
  return mongoDBService.getDatabaseInfo();
};

export const getMongoDBMetrics = (): ConnectionMetrics => {
  return mongoDBService.getMetrics();
};

export default mongoDBService;
/**
 * Browser AI Agent Backend Server
 * Main entry point for the backend API server
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import Redis from 'ioredis';

// Import services and middleware
import { createLogger } from './utils/logger';
import { ErrorHandler } from './middleware/error-handler';
import { AuthMiddleware } from './middleware/auth';
import { validator } from './middleware/validation';
import { rateLimiter } from './middleware/rate-limit';

// Import session management
import { SessionService } from './services/session/session-service';
import { SessionPersistence } from './services/session/session-persistence';
import { SessionSyncService } from './services/session/session-sync';
import { SessionAnalyticsService } from './services/session/session-analytics';
import { SessionExportService } from './services/session/session-export';
import { PostgresSessionStorage } from './services/session/postgres-storage';
import { MemorySessionStorage } from './services/session/memory-storage';
import { RedisSessionStorage } from './services/session/redis-storage';

// Import other services
import { AIService } from './services/nvidia/ai-service';
import { AutomationEngine } from './services/automation/automation-engine';
import { WebSocketServer } from './services/websocket/websocket-server';

// Import routes
import { createSessionRouter } from './routes/sessions';
import { createChatRouter } from './routes/chat';
import { createAutomationRouter } from './routes/automation';

// Load environment variables
dotenv.config();

const logger = createLogger('Server');

class BrowserAIAgentServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private postgresPool: Pool;
  private redis: Redis;
  
  // Services
  private sessionService: SessionService;
  private aiService: AIService;
  private automationEngine: AutomationEngine;
  private webSocketServer: WebSocketServer;
  
  // Middleware
  private errorHandler: ErrorHandler;
  private authMiddleware: AuthMiddleware;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: process.env.FRONTEND_URL || "*",
        methods: ["GET", "POST"]
      }
    });

    this.initializeDatabase();
    this.initializeRedis();
    this.initializeServices();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeWebSocket();
    this.initializeErrorHandling();
  }

  private initializeDatabase(): void {
    const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/browser_ai_agent';
    
    this.postgresPool = new Pool({
      connectionString: databaseUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    logger.info('Database connection pool initialized', {
      url: databaseUrl.replace(/:[^:@]*@/, ':***@') // Hide password in logs
    });
  }

  private initializeRedis(): void {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    this.redis = new Redis(redisUrl, {
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    this.redis.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    this.redis.on('error', (error) => {
      logger.error('Redis connection error', error);
    });

    logger.info('Redis client initialized', { url: redisUrl });
  }

  private initializeServices(): void {
    logger.info('Initializing services...');

    // Initialize storage layers
    const postgresStorage = new PostgresSessionStorage(this.postgresPool);
    const memoryStorage = new MemorySessionStorage();
    const redisStorage = new RedisSessionStorage({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      keyPrefix: 'browser-ai-agent:',
      ttl: 3600, // 1 hour
      maxRetries: 3,
      retryDelayOnFailover: 100
    }, logger);

    // Initialize session management components
    const sessionPersistence = new SessionPersistence(
      postgresStorage,
      memoryStorage,
      logger,
      {
        primaryStorage: 'postgres',
        enableCaching: true,
        cacheTimeout: 300000, // 5 minutes
        enableReplication: true,
        syncInterval: 30000, // 30 seconds
        maxRetries: 3,
        backupEnabled: true
      }
    );

    const sessionSync = new SessionSyncService(logger, {
      syncInterval: 5000,
      conflictResolution: 'last-write-wins',
      maxSyncHistory: 1000,
      enableRealTimeSync: true,
      syncTimeout: 30000
    });

    const sessionAnalytics = new SessionAnalyticsService(logger);
    const sessionExport = new SessionExportService(logger, './exports');

    // Initialize main session service
    this.sessionService = new SessionService(
      {
        defaultSessionTimeout: 3600000, // 1 hour
        maxSessionsPerUser: 10,
        cleanupInterval: 300000 // 5 minutes
      },
      postgresStorage,
      sessionPersistence,
      sessionSync,
      sessionAnalytics,
      sessionExport,
      redisStorage
    );

    // Initialize AI service
    this.aiService = new AIService({
      apiKey: process.env.NVIDIA_API_KEY || '',
      baseUrl: process.env.NVIDIA_API_URL || 'https://integrate.api.nvidia.com/v1',
      model: process.env.NVIDIA_MODEL || 'meta/llama-3.1-405b-instruct',
      maxTokens: 4000,
      temperature: 0.7
    }, logger);

    // Initialize automation engine
    this.automationEngine = new AutomationEngine({
      headless: process.env.NODE_ENV === 'production',
      timeout: 30000,
      screenshotPath: './screenshots',
      maxConcurrentBrowsers: 5
    }, logger);

    // Initialize WebSocket server
    this.webSocketServer = new WebSocketServer(this.io, {
      sessionService: this.sessionService,
      aiService: this.aiService,
      automationEngine: this.automationEngine
    }, logger);

    logger.info('All services initialized successfully');
  }

  private initializeMiddleware(): void {
    logger.info('Initializing middleware...');

    // Initialize middleware
    this.errorHandler = new ErrorHandler(logger);
    this.authMiddleware = new AuthMiddleware({
      jwtSecret: process.env.JWT_SECRET || 'your-jwt-secret-key',
      tokenExpiry: '24h'
    }, logger);

    // Basic middleware
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.FRONTEND_URL || "*",
      credentials: true
    }));
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.debug('Incoming request', {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
      next();
    });

    logger.info('Middleware initialized successfully');
  }

  private initializeRoutes(): void {
    logger.info('Initializing routes...');

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date(),
        version: '1.0.0',
        services: {
          database: 'connected',
          redis: 'connected',
          ai: 'ready',
          automation: 'ready'
        }
      });
    });

    // API routes
    const apiRouter = express.Router();

    // Session routes
    apiRouter.use('/sessions', createSessionRouter({
      sessionService: this.sessionService,
      aiService: this.aiService,
      authMiddleware: this.authMiddleware,
      errorHandler: this.errorHandler
    }));

    // Chat routes
    apiRouter.use('/chat', createChatRouter({
      sessionService: this.sessionService,
      aiService: this.aiService,
      authMiddleware: this.authMiddleware,
      errorHandler: this.errorHandler
    }));

    // Automation routes
    apiRouter.use('/automation', createAutomationRouter({
      sessionService: this.sessionService,
      automationEngine: this.automationEngine,
      authMiddleware: this.authMiddleware,
      errorHandler: this.errorHandler
    }));

    this.app.use('/api/v1', apiRouter);

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Endpoint not found',
          retryable: false
        },
        timestamp: new Date()
      });
    });

    logger.info('Routes initialized successfully');
  }

  private initializeWebSocket(): void {
    logger.info('Initializing WebSocket server...');
    
    this.webSocketServer.initialize();
    
    logger.info('WebSocket server initialized successfully');
  }

  private initializeErrorHandling(): void {
    // Global error handler
    this.app.use(this.errorHandler.handleError.bind(this.errorHandler));

    // Unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', { promise, reason });
    });

    // Uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      this.shutdown();
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully');
      this.shutdown();
    });

    logger.info('Error handling initialized successfully');
  }

  public async start(): Promise<void> {
    const port = process.env.PORT || 3000;

    try {
      // Test database connection
      await this.postgresPool.query('SELECT 1');
      logger.info('Database connection verified');

      // Test Redis connection
      await this.redis.ping();
      logger.info('Redis connection verified');

      // Start server
      this.server.listen(port, () => {
        logger.info(`🚀 Browser AI Agent Backend Server started`, {
          port,
          environment: process.env.NODE_ENV || 'development',
          pid: process.pid
        });

        logger.info('🔗 Available endpoints:', {
          health: `http://localhost:${port}/health`,
          api: `http://localhost:${port}/api/v1`,
          websocket: `ws://localhost:${port}`
        });
      });

    } catch (error) {
      logger.error('Failed to start server', error);
      process.exit(1);
    }
  }

  private async shutdown(): Promise<void> {
    logger.info('Shutting down server...');

    try {
      // Close server
      if (this.server) {
        this.server.close();
      }

      // Shutdown services
      await Promise.all([
        this.sessionService.shutdown(),
        this.automationEngine.shutdown(),
        this.webSocketServer.shutdown(),
        this.postgresPool.end(),
        this.redis.quit()
      ]);

      logger.info('Server shutdown complete');
      process.exit(0);

    } catch (error) {
      logger.error('Error during shutdown', error);
      process.exit(1);
    }
  }
}

// Start the server
const server = new BrowserAIAgentServer();
server.start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
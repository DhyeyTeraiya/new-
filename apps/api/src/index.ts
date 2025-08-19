import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';

import { config } from '@/config';
import { logger } from '@/utils/logger';
import { errorHandler, notFoundHandler } from '@/middleware/error-handler';
import { rateLimiter } from '@/middleware/rate-limiter';
import { authMiddleware } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';

// Routes
import authRoutes from '@/routes/auth';
import userRoutes from '@/routes/users';
import chatRoutes from '@/routes/chat';
import automationRoutes from '@/routes/automation';
import workflowRoutes from '@/routes/workflows';
import analyticsRoutes from '@/routes/analytics';

// Services
import SimpleDatabaseService from '@/services/simple-database';
import SimpleCacheService from '@/services/simple-cache';
import { SocketService } from '@/services/socket';

// Load environment variables
dotenv.config();

class Application {
  public app: express.Application;
  public server: any;
  public io: SocketIOServer;
  private port: number;

  constructor() {
    this.app = express();
    this.port = config.port;
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: config.cors.origin,
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    this.initializeServices();
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
    this.initializeSocket();
  }

  private async initializeServices(): Promise<void> {
    try {
      // Initialize simple database
      await SimpleDatabaseService.getInstance().connect();
      logger.info('Database connected successfully');

      // Initialize simple cache
      await SimpleCacheService.getInstance().connect();
      SimpleCacheService.getInstance().startCleanup();
      logger.info('Cache connected successfully');

    } catch (error) {
      logger.error('Failed to initialize services:', error);
      process.exit(1);
    }
  }

  private initializeMiddlewares(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https:"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'", "ws:", "wss:"],
        },
      },
    }));

    // CORS
    this.app.use(cors({
      origin: config.cors.origin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }));

    // Compression
    this.app.use(compression());

    // Logging
    this.app.use(morgan('combined', {
      stream: {
        write: (message: string) => logger.info(message.trim()),
      },
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use(cookieParser());

    // Rate limiting
    this.app.use('/api', rateLimiter);

    // Health check
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.env,
      });
    });
  }

  private initializeRoutes(): void {
    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/users', authMiddleware, userRoutes);
    this.app.use('/api/chat', authMiddleware, chatRoutes);
    this.app.use('/api/automation', authMiddleware, automationRoutes);
    this.app.use('/api/workflows', authMiddleware, workflowRoutes);
    this.app.use('/api/analytics', authMiddleware, analyticsRoutes);

    // API documentation
    this.app.get('/api', (req, res) => {
      res.json({
        name: 'AI-Powered Website API',
        version: '1.0.0',
        description: 'Backend API for AI-powered browser automation platform',
        endpoints: {
          auth: '/api/auth',
          users: '/api/users',
          chat: '/api/chat',
          automation: '/api/automation',
          workflows: '/api/workflows',
          analytics: '/api/analytics',
        },
        documentation: '/api/docs',
        health: '/health',
      });
    });
  }

  private initializeErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);
  }

  private initializeSocket(): void {
    const socketService = new SocketService(this.io);
    socketService.initialize();
  }

  public listen(): void {
    this.server.listen(this.port, () => {
      logger.info(`🚀 Server running on port ${this.port}`);
      logger.info(`📚 API documentation available at http://localhost:${this.port}/api`);
      logger.info(`🏥 Health check available at http://localhost:${this.port}/health`);
    });

    // Graceful shutdown
    process.on('SIGTERM', this.gracefulShutdown.bind(this));
    process.on('SIGINT', this.gracefulShutdown.bind(this));
  }

  private async gracefulShutdown(signal: string): Promise<void> {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    // Close server
    this.server.close(() => {
      logger.info('HTTP server closed');
    });

    // Close database connections
    await SimpleDatabaseService.getInstance().disconnect();
    logger.info('Database disconnected');

    // Close cache connection
    await SimpleCacheService.getInstance().disconnect();
    logger.info('Cache disconnected');

    logger.info('Graceful shutdown completed');
    process.exit(0);
  }
}

// Start the application
const app = new Application();
app.listen();

export default app;
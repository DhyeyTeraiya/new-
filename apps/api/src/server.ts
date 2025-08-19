import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from './utils/logger';
import { config } from './config';

// =============================================================================
// HIGH-PERFORMANCE FASTIFY SERVER (Superior to Express.js)
// Master Plan: Enterprise-grade API with advanced security and performance
// =============================================================================

export interface ServerConfig {
  port: number;
  host: string;
  cors: {
    origin: string[] | boolean;
    credentials: boolean;
  };
  rateLimit: {
    max: number;
    timeWindow: string;
  };
  security: {
    contentSecurityPolicy: boolean;
    hsts: boolean;
    noSniff: boolean;
    xssFilter: boolean;
    referrerPolicy: string;
  };
  compression: boolean;
  swagger: {
    enabled: boolean;
    routePrefix: string;
  };
}

export interface RequestContext {
  requestId: string;
  userId?: string;
  userRole?: string;
  startTime: number;
  ip: string;
  userAgent: string;
}

// =============================================================================
// FASTIFY SERVER IMPLEMENTATION
// =============================================================================

export class FastifyServer {
  private server: FastifyInstance;
  private config: ServerConfig;

  constructor(serverConfig?: Partial<ServerConfig>) {
    this.config = {
      port: config.port,
      host: config.host,
      cors: {
        origin: config.cors.origin,
        credentials: true,
      },
      rateLimit: {
        max: 100,
        timeWindow: '1 minute',
      },
      security: {
        contentSecurityPolicy: true,
        hsts: true,
        noSniff: true,
        xssFilter: true,
        referrerPolicy: 'same-origin',
      },
      compression: true,
      swagger: {
        enabled: config.env === 'development',
        routePrefix: '/docs',
      },
      ...serverConfig,
    };

    this.server = Fastify({
      logger: false, // We use our custom logger
      trustProxy: true,
      requestIdHeader: 'x-request-id',
      requestIdLogLabel: 'requestId',
      genReqId: this.generateRequestId,
    });

    this.setupPlugins();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  // =============================================================================
  // PLUGIN SETUP
  // =============================================================================

  private async setupPlugins(): Promise<void> {
    // CORS Plugin
    await this.server.register(require('@fastify/cors'), {
      origin: this.config.cors.origin,
      credentials: this.config.cors.credentials,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'X-Request-ID',
        'X-API-Key',
      ],
    });

    // Rate Limiting Plugin
    await this.server.register(require('@fastify/rate-limit'), {
      max: this.config.rateLimit.max,
      timeWindow: this.config.rateLimit.timeWindow,
      keyGenerator: (request: FastifyRequest) => {
        return request.ip + ':' + (request.headers.authorization || 'anonymous');
      },
      errorResponseBuilder: (request: FastifyRequest, context: any) => {
        return {
          error: 'Rate limit exceeded',
          message: `Too many requests from ${request.ip}. Try again later.`,
          retryAfter: Math.round(context.ttl / 1000),
        };
      },
    });

    // Security Headers Plugin
    await this.server.register(require('@fastify/helmet'), {
      contentSecurityPolicy: this.config.security.contentSecurityPolicy ? {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      } : false,
      hsts: this.config.security.hsts ? {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      } : false,
      noSniff: this.config.security.noSniff,
      xssFilter: this.config.security.xssFilter,
      referrerPolicy: { policy: this.config.security.referrerPolicy as any },
    });

    // Compression Plugin
    if (this.config.compression) {
      await this.server.register(require('@fastify/compress'), {
        global: true,
        threshold: 1024,
      });
    }

    // Swagger Documentation Plugin
    if (this.config.swagger.enabled) {
      await this.server.register(require('@fastify/swagger'), {
        swagger: {
          info: {
            title: 'Browser AI Agent API',
            description: 'Next-generation browser automation API',
            version: '1.0.0',
          },
          host: `${this.config.host}:${this.config.port}`,
          schemes: ['http', 'https'],
          consumes: ['application/json'],
          produces: ['application/json'],
          securityDefinitions: {
            Bearer: {
              type: 'apiKey',
              name: 'Authorization',
              in: 'header',
              description: 'Enter: Bearer {token}',
            },
          },
        },
      });

      await this.server.register(require('@fastify/swagger-ui'), {
        routePrefix: this.config.swagger.routePrefix,
        uiConfig: {
          docExpansion: 'list',
          deepLinking: false,
        },
      });
    }

    // Multipart Support for File Uploads
    await this.server.register(require('@fastify/multipart'), {
      limits: {
        fieldNameSize: 100,
        fieldSize: 100,
        fields: 10,
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 5,
        headerPairs: 2000,
      },
    });

    // Cookie Support
    await this.server.register(require('@fastify/cookie'), {
      secret: config.jwt.secret,
      parseOptions: {
        httpOnly: true,
        secure: config.env === 'production',
        sameSite: 'strict',
      },
    });

    // Session Support
    await this.server.register(require('@fastify/session'), {
      secret: config.jwt.secret,
      cookie: {
        secure: config.env === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      },
    });

    logger.info('Fastify plugins registered successfully');
  }

  // =============================================================================
  // MIDDLEWARE SETUP
  // =============================================================================

  private setupMiddleware(): void {
    // Request Context Middleware
    this.server.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
      const context: RequestContext = {
        requestId: request.id,
        startTime: Date.now(),
        ip: request.ip,
        userAgent: request.headers['user-agent'] || 'unknown',
      };

      // Add context to request
      (request as any).context = context;

      logger.info('Request started', {
        requestId: context.requestId,
        method: request.method,
        url: request.url,
        ip: context.ip,
        userAgent: context.userAgent,
      });
    });

    // Request Logging Middleware
    this.server.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
      const context = (request as any).context as RequestContext;
      const duration = Date.now() - context.startTime;

      logger.info('Request completed', {
        requestId: context.requestId,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        duration,
        userId: context.userId,
      });
    });

    // Error Logging Middleware
    this.server.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
      const context = (request as any).context as RequestContext;

      logger.error('Request error', {
        requestId: context.requestId,
        method: request.method,
        url: request.url,
        error: error.message,
        stack: error.stack,
        userId: context.userId,
      });
    });

    // Security Headers Middleware
    this.server.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: any) => {
      // Add custom security headers
      reply.header('X-API-Version', '1.0.0');
      reply.header('X-Response-Time', Date.now() - (request as any).context.startTime);
      
      // Remove server information
      reply.removeHeader('x-powered-by');
      
      return payload;
    });

    logger.info('Fastify middleware configured successfully');
  }

  // =============================================================================
  // ROUTE SETUP
  // =============================================================================

  private setupRoutes(): void {
    // Health Check Route
    this.server.get('/health', {
      schema: {
        description: 'Health check endpoint',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              uptime: { type: 'number' },
              version: { type: 'string' },
            },
          },
        },
      },
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
      };
    });

    // Metrics Route
    this.server.get('/metrics', {
      schema: {
        description: 'System metrics endpoint',
        tags: ['Monitoring'],
        response: {
          200: {
            type: 'object',
            properties: {
              memory: { type: 'object' },
              cpu: { type: 'object' },
              requests: { type: 'object' },
            },
          },
        },
      },
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      return {
        memory: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external,
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
        requests: {
          total: this.getRequestCount(),
          active: this.getActiveRequestCount(),
        },
      };
    });

    // API Info Route
    this.server.get('/api/info', {
      schema: {
        description: 'API information endpoint',
        tags: ['Info'],
        response: {
          200: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              version: { type: 'string' },
              description: { type: 'string' },
              environment: { type: 'string' },
              features: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      return {
        name: 'Browser AI Agent API',
        version: '1.0.0',
        description: 'Next-generation browser automation API with AI-powered capabilities',
        environment: config.env,
        features: [
          'Multi-LLM AI Integration',
          'Advanced Browser Automation',
          'Real-time WebSocket Communication',
          'Visual Testing & Screenshots',
          'Self-healing Automation',
          'Enterprise Security',
        ],
      };
    });

    logger.info('Base routes configured successfully');
  }

  // =============================================================================
  // ERROR HANDLING
  // =============================================================================

  private setupErrorHandling(): void {
    // Global Error Handler
    this.server.setErrorHandler(async (error: any, request: FastifyRequest, reply: FastifyReply) => {
      const context = (request as any).context as RequestContext;

      // Log the error
      logger.error('Unhandled error', {
        requestId: context.requestId,
        error: error.message,
        stack: error.stack,
        statusCode: error.statusCode,
      });

      // Determine status code
      let statusCode = error.statusCode || 500;
      let errorMessage = error.message || 'Internal Server Error';

      // Handle specific error types
      if (error.validation) {
        statusCode = 400;
        errorMessage = 'Validation Error';
      } else if (error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
        statusCode = 401;
        errorMessage = 'Authorization header missing';
      } else if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID') {
        statusCode = 401;
        errorMessage = 'Invalid authorization token';
      }

      // Send error response
      reply.status(statusCode).send({
        error: true,
        message: errorMessage,
        statusCode,
        requestId: context.requestId,
        timestamp: new Date().toISOString(),
        ...(config.env === 'development' && {
          details: error.validation || error.stack,
        }),
      });
    });

    // 404 Handler
    this.server.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
      const context = (request as any).context as RequestContext;

      logger.warn('Route not found', {
        requestId: context.requestId,
        method: request.method,
        url: request.url,
      });

      reply.status(404).send({
        error: true,
        message: 'Route not found',
        statusCode: 404,
        requestId: context.requestId,
        timestamp: new Date().toISOString(),
      });
    });

    logger.info('Error handling configured successfully');
  }

  // =============================================================================
  // ROUTE REGISTRATION METHODS
  // =============================================================================

  public async registerRoutes(routeRegistration: (server: FastifyInstance) => Promise<void>): Promise<void> {
    await routeRegistration(this.server);
    logger.info('Custom routes registered successfully');
  }

  public async registerPlugin(plugin: any, options?: any): Promise<void> {
    await this.server.register(plugin, options);
    logger.info('Custom plugin registered successfully');
  }

  // =============================================================================
  // SERVER LIFECYCLE METHODS
  // =============================================================================

  public async start(): Promise<void> {
    try {
      await this.server.listen({
        port: this.config.port,
        host: this.config.host,
      });

      logger.info('Fastify server started successfully', {
        port: this.config.port,
        host: this.config.host,
        environment: config.env,
        swagger: this.config.swagger.enabled ? `http://${this.config.host}:${this.config.port}${this.config.swagger.routePrefix}` : 'disabled',
      });

      // Log all registered routes in development
      if (config.env === 'development') {
        this.logRegisteredRoutes();
      }
    } catch (error) {
      logger.error('Failed to start Fastify server', { error: error.message });
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      await this.server.close();
      logger.info('Fastify server stopped successfully');
    } catch (error) {
      logger.error('Error stopping Fastify server', { error: error.message });
      throw error;
    }
  }

  public getServer(): FastifyInstance {
    return this.server;
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getRequestCount(): number {
    // This would be implemented with actual metrics collection
    return 0;
  }

  private getActiveRequestCount(): number {
    // This would be implemented with actual metrics collection
    return 0;
  }

  private logRegisteredRoutes(): void {
    const routes = this.server.printRoutes();
    logger.info('Registered routes:', { routes });
  }

  // =============================================================================
  // GRACEFUL SHUTDOWN
  // =============================================================================

  public setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown`);

      try {
        await this.stop();
        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown', { error: error.message });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // For nodemon

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection', { reason, promise });
      process.exit(1);
    });
  }
}

export default FastifyServer;
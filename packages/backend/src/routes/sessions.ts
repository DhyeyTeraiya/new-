import { Router } from 'express';
import { z } from 'zod';
import { 
  SessionCreateRequest,
  SessionCreateResponse,
  APIResponse,
  UserSession,
  DeviceInfoSchema
} from '@browser-ai-agent/shared';
import { AuthenticatedRequest, AuthMiddleware } from '../middleware/auth';
import { validator } from '../middleware/validation';
import { rateLimiter } from '../middleware/rate-limit';
import { ErrorHandler } from '../middleware/error-handler';
import { SessionService } from '../services/session';
import { AIService } from '../services/nvidia';
import { Logger } from 'winston';
import { createLogger } from '../utils/logger';

export interface SessionRouterDependencies {
  sessionService: SessionService;
  aiService: AIService;
  authMiddleware: AuthMiddleware;
  errorHandler: ErrorHandler;
}

export function createSessionRouter(deps: SessionRouterDependencies): Router {
  const router = Router();
  const logger = createLogger('SessionRouter');

  // Session creation schema
  const sessionCreateSchema = z.object({
    userId: z.string().optional(),
    preferences: z.object({
      theme: z.enum(['light', 'dark', 'auto']).default('light'),
      language: z.string().default('en'),
      automation: z.object({
        autoConfirmLowRisk: z.boolean().default(false),
        showActionPreviews: z.boolean().default(true),
        defaultTimeout: z.number().min(1000).max(60000).default(5000),
        takeScreenshots: z.boolean().default(true),
        highlightElements: z.boolean().default(true),
      }).optional(),
      privacy: z.object({
        storeHistory: z.boolean().default(true),
        shareAnalytics: z.boolean().default(false),
        dataRetentionDays: z.number().min(1).max(365).default(30),
      }).optional(),
      notifications: z.object({
        desktop: z.boolean().default(true),
        browser: z.boolean().default(true),
        actionCompletion: z.boolean().default(true),
        errors: z.boolean().default(true),
      }).optional(),
      ai: z.object({
        responseStyle: z.enum(['concise', 'detailed', 'conversational']).default('conversational'),
        explainActions: z.boolean().default(true),
        confidenceThreshold: z.number().min(0).max(1).default(0.7),
        modelPreferences: z.object({
          chat: z.string().default('primary'),
          reasoning: z.string().default('complex'),
          vision: z.string().default('vision'),
          fast: z.string().default('primary'),
        }).optional(),
      }).optional(),
    }).optional(),
    deviceInfo: DeviceInfoSchema,
  });

  /**
   * POST /api/v1/sessions
   * Create a new session
   */
  router.post(
    '/',
    rateLimiter.createGlobalLimiter(),
    validator.validateBody(sessionCreateSchema),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { userId, preferences, deviceInfo } = req.body as SessionCreateRequest;

      logger.info('Creating new session', {
        userId: userId || 'anonymous',
        deviceType: deviceInfo.type,
        browser: deviceInfo.browser,
      });

      try {
        // Create session
        const session = await deps.sessionService.createSession({
          userId: userId || req.user?.id,
          preferences,
          deviceInfo,
        });

        // Initialize AI service context
        deps.aiService.initializeSession(session);

        // Generate authentication token
        const token = deps.authMiddleware.generateToken({
          userId: session.userId,
          sessionId: session.id,
          role: 'user',
        });

        const response: APIResponse<SessionCreateResponse> = {
          success: true,
          data: {
            session,
            token,
          },
          metadata: {
            requestId: `session-create-${Date.now()}`,
            version: '1.0.0',
          },
          timestamp: new Date(),
        };

        logger.info('Session created successfully', {
          sessionId: session.id,
          userId: session.userId,
        });

        res.status(201).json(response);
      } catch (error) {
        logger.error('Failed to create session', {
          userId: userId || 'anonymous',
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  /**
   * GET /api/v1/sessions/:sessionId
   * Get session details
   */
  router.get(
    '/:sessionId',
    deps.authMiddleware.authenticate(),
    validator.validateParams(z.object({
      sessionId: z.string().min(1),
    })),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { sessionId } = req.params;

      logger.debug('Fetching session details', {
        userId: req.user?.id,
        sessionId,
      });

      try {
        const session = await deps.sessionService.getSession(sessionId);

        if (!session) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'SESSION_NOT_FOUND',
              message: 'Session not found',
              retryable: false,
            },
            timestamp: new Date(),
          });
        }

        // Check if user owns this session
        if (session.userId !== req.user?.id && req.user?.role !== 'admin') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'SESSION_ACCESS_DENIED',
              message: 'Access denied to this session',
              retryable: false,
            },
            timestamp: new Date(),
          });
        }

        const response: APIResponse<{ session: UserSession }> = {
          success: true,
          data: {
            session,
          },
          timestamp: new Date(),
        };

        res.json(response);
      } catch (error) {
        logger.error('Failed to fetch session', {
          userId: req.user?.id,
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  /**
   * PUT /api/v1/sessions/:sessionId
   * Update session
   */
  router.put(
    '/:sessionId',
    deps.authMiddleware.authenticate(),
    validator.validateParams(z.object({
      sessionId: z.string().min(1),
    })),
    validator.validateBody(z.object({
      preferences: z.object({
        theme: z.enum(['light', 'dark', 'auto']).optional(),
        language: z.string().optional(),
        automation: z.object({
          autoConfirmLowRisk: z.boolean().optional(),
          showActionPreviews: z.boolean().optional(),
          defaultTimeout: z.number().min(1000).max(60000).optional(),
          takeScreenshots: z.boolean().optional(),
          highlightElements: z.boolean().optional(),
        }).optional(),
        privacy: z.object({
          storeHistory: z.boolean().optional(),
          shareAnalytics: z.boolean().optional(),
          dataRetentionDays: z.number().min(1).max(365).optional(),
        }).optional(),
        notifications: z.object({
          desktop: z.boolean().optional(),
          browser: z.boolean().optional(),
          actionCompletion: z.boolean().optional(),
          errors: z.boolean().optional(),
        }).optional(),
        ai: z.object({
          responseStyle: z.enum(['concise', 'detailed', 'conversational']).optional(),
          explainActions: z.boolean().optional(),
          confidenceThreshold: z.number().min(0).max(1).optional(),
          modelPreferences: z.object({
            chat: z.string().optional(),
            reasoning: z.string().optional(),
            vision: z.string().optional(),
            fast: z.string().optional(),
          }).optional(),
        }).optional(),
      }).optional(),
      browserState: z.object({
        currentTab: z.object({
          id: z.string(),
          url: z.string(),
          title: z.string(),
          active: z.boolean(),
          status: z.enum(['loading', 'complete']),
        }).optional(),
      }).optional(),
    })),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { sessionId } = req.params;
      const updates = req.body;

      logger.info('Updating session', {
        userId: req.user?.id,
        sessionId,
        hasPreferences: !!updates.preferences,
        hasBrowserState: !!updates.browserState,
      });

      try {
        const session = await deps.sessionService.updateSession(sessionId, updates);

        if (!session) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'SESSION_NOT_FOUND',
              message: 'Session not found',
              retryable: false,
            },
            timestamp: new Date(),
          });
        }

        // Check if user owns this session
        if (session.userId !== req.user?.id && req.user?.role !== 'admin') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'SESSION_ACCESS_DENIED',
              message: 'Access denied to this session',
              retryable: false,
            },
            timestamp: new Date(),
          });
        }

        const response: APIResponse<{ session: UserSession }> = {
          success: true,
          data: {
            session,
          },
          timestamp: new Date(),
        };

        logger.info('Session updated successfully', {
          userId: req.user?.id,
          sessionId,
        });

        res.json(response);
      } catch (error) {
        logger.error('Failed to update session', {
          userId: req.user?.id,
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  /**
   * DELETE /api/v1/sessions/:sessionId
   * Delete session
   */
  router.delete(
    '/:sessionId',
    deps.authMiddleware.authenticate(),
    validator.validateParams(z.object({
      sessionId: z.string().min(1),
    })),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { sessionId } = req.params;

      logger.info('Deleting session', {
        userId: req.user?.id,
        sessionId,
      });

      try {
        const session = await deps.sessionService.getSession(sessionId);

        if (!session) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'SESSION_NOT_FOUND',
              message: 'Session not found',
              retryable: false,
            },
            timestamp: new Date(),
          });
        }

        // Check if user owns this session
        if (session.userId !== req.user?.id && req.user?.role !== 'admin') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'SESSION_ACCESS_DENIED',
              message: 'Access denied to this session',
              retryable: false,
            },
            timestamp: new Date(),
          });
        }

        await deps.sessionService.deleteSession(sessionId);

        // Clean up AI service context
        deps.aiService.cleanupSession(sessionId);

        const response: APIResponse<{ message: string }> = {
          success: true,
          data: {
            message: 'Session deleted successfully',
          },
          timestamp: new Date(),
        };

        logger.info('Session deleted successfully', {
          userId: req.user?.id,
          sessionId,
        });

        res.json(response);
      } catch (error) {
        logger.error('Failed to delete session', {
          userId: req.user?.id,
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  /**
   * POST /api/v1/sessions/:sessionId/extend
   * Extend session expiry
   */
  router.post(
    '/:sessionId/extend',
    deps.authMiddleware.authenticate(),
    validator.validateParams(z.object({
      sessionId: z.string().min(1),
    })),
    validator.validateBody(z.object({
      extendByMinutes: z.number().min(1).max(1440).default(60), // Max 24 hours
    })),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { sessionId } = req.params;
      const { extendByMinutes } = req.body;

      logger.info('Extending session', {
        userId: req.user?.id,
        sessionId,
        extendByMinutes,
      });

      try {
        const session = await deps.sessionService.extendSession(sessionId, extendByMinutes);

        if (!session) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'SESSION_NOT_FOUND',
              message: 'Session not found',
              retryable: false,
            },
            timestamp: new Date(),
          });
        }

        const response: APIResponse<{ session: UserSession }> = {
          success: true,
          data: {
            session,
          },
          timestamp: new Date(),
        };

        logger.info('Session extended successfully', {
          userId: req.user?.id,
          sessionId,
          newExpiryTime: session.expiresAt,
        });

        res.json(response);
      } catch (error) {
        logger.error('Failed to extend session', {
          userId: req.user?.id,
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  /**
   * GET /api/v1/sessions
   * List user sessions
   */
  router.get(
    '/',
    deps.authMiddleware.authenticate(),
    validator.validateQuery(z.object({
      limit: z.string().transform(val => parseInt(val)).pipe(z.number().min(1).max(100)).default('10'),
      offset: z.string().transform(val => parseInt(val)).pipe(z.number().min(0)).default('0'),
      active: z.string().transform(val => val === 'true').optional(),
    })),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { limit, offset, active } = req.query as any;

      logger.debug('Listing user sessions', {
        userId: req.user?.id,
        limit,
        offset,
        activeOnly: active,
      });

      try {
        const sessions = await deps.sessionService.getUserSessions(
          req.user!.id,
          { limit, offset, activeOnly: active }
        );

        const response: APIResponse<{ sessions: UserSession[] }> = {
          success: true,
          data: {
            sessions,
          },
          timestamp: new Date(),
        };

        res.json(response);
      } catch (error) {
        logger.error('Failed to list user sessions', {
          userId: req.user?.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  return router;
}
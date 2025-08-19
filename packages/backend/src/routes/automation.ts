import { Router } from 'express';
import { z } from 'zod';
import { 
  AutomationRequest,
  AutomationResponse,
  APIResponse,
  BrowserActionSchema,
  PageContextSchema
} from '@browser-ai-agent/shared';
import { AuthenticatedRequest } from '../middleware/auth';
import { validator, commonSchemas } from '../middleware/validation';
import { rateLimiter } from '../middleware/rate-limit';
import { ErrorHandler } from '../middleware/error-handler';
import { AutomationEngine } from '../services/automation';
import { Logger } from 'winston';
import { createLogger } from '../utils/logger';

export interface AutomationRouterDependencies {
  automationEngine: AutomationEngine;
  errorHandler: ErrorHandler;
}

export function createAutomationRouter(deps: AutomationRouterDependencies): Router {
  const router = Router();
  const logger = createLogger('AutomationRouter');

  // Automation request schema
  const automationRequestSchema = z.object({
    actions: z.array(BrowserActionSchema).min(1).max(50),
    sessionId: z.string().min(1),
    options: z.object({
      browserType: z.enum(['chromium', 'firefox', 'webkit']).optional(),
      headless: z.boolean().optional(),
      viewport: z.object({
        width: z.number().min(320).max(3840),
        height: z.number().min(240).max(2160),
      }).optional(),
      continueOnError: z.boolean().default(false),
      timeout: z.number().min(1000).max(300000).optional(),
    }).optional(),
  });

  /**
   * POST /api/v1/automation/execute
   * Execute browser automation actions
   */
  router.post(
    '/execute',
    rateLimiter.createAutomationLimiter(),
    validator.validateBody(automationRequestSchema),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { actions, sessionId, options } = req.body as AutomationRequest;

      logger.info('Starting automation execution', {
        userId: req.user?.id,
        sessionId,
        actionCount: actions.length,
        options,
      });

      try {
        const automationId = await deps.automationEngine.startAutomation(
          sessionId,
          actions,
          options
        );

        const response: APIResponse<{ automationId: string }> = {
          success: true,
          data: {
            automationId,
          },
          metadata: {
            requestId: `automation-${Date.now()}`,
            version: '1.0.0',
          },
          timestamp: new Date(),
        };

        logger.info('Automation started successfully', {
          userId: req.user?.id,
          sessionId,
          automationId,
          actionCount: actions.length,
        });

        res.json(response);
      } catch (error) {
        logger.error('Failed to start automation', {
          userId: req.user?.id,
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  /**
   * POST /api/v1/automation/execute-single
   * Execute a single browser action
   */
  router.post(
    '/execute-single',
    rateLimiter.createAutomationLimiter(),
    validator.validateBody(z.object({
      action: BrowserActionSchema,
      sessionId: z.string().min(1),
      options: z.object({
        browserInstanceId: z.string().optional(),
        takeScreenshot: z.boolean().default(false),
      }).optional(),
    })),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { action, sessionId, options } = req.body;

      logger.info('Executing single action', {
        userId: req.user?.id,
        sessionId,
        actionType: action.type,
        actionId: action.id,
      });

      try {
        const result = await deps.automationEngine.executeAction(
          sessionId,
          action,
          options
        );

        const response: APIResponse<{ result: typeof result }> = {
          success: true,
          data: {
            result,
          },
          metadata: {
            requestId: `single-action-${Date.now()}`,
            version: '1.0.0',
          },
          timestamp: new Date(),
        };

        logger.info('Single action executed', {
          userId: req.user?.id,
          sessionId,
          actionId: action.id,
          success: result.success,
          executionTime: result.executionTime,
        });

        res.json(response);
      } catch (error) {
        logger.error('Single action execution failed', {
          userId: req.user?.id,
          sessionId,
          actionId: action.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  /**
   * GET /api/v1/automation/status/:automationId
   * Get automation status
   */
  router.get(
    '/status/:automationId',
    validator.validateParams(z.object({
      automationId: z.string().uuid(),
    })),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { automationId } = req.params;

      logger.debug('Fetching automation status', {
        userId: req.user?.id,
        automationId,
      });

      try {
        const status = deps.automationEngine.getAutomationStatus(automationId);

        if (!status) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'AUTOMATION_NOT_FOUND',
              message: 'Automation not found',
              retryable: false,
            },
            timestamp: new Date(),
          });
        }

        const response: APIResponse<{ status: typeof status }> = {
          success: true,
          data: {
            status,
          },
          timestamp: new Date(),
        };

        res.json(response);
      } catch (error) {
        logger.error('Failed to fetch automation status', {
          userId: req.user?.id,
          automationId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  /**
   * POST /api/v1/automation/pause/:automationId
   * Pause automation
   */
  router.post(
    '/pause/:automationId',
    validator.validateParams(z.object({
      automationId: z.string().uuid(),
    })),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { automationId } = req.params;

      logger.info('Pausing automation', {
        userId: req.user?.id,
        automationId,
      });

      try {
        const success = await deps.automationEngine.pauseAutomation(automationId);

        if (!success) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'AUTOMATION_CANNOT_PAUSE',
              message: 'Automation cannot be paused',
              retryable: false,
            },
            timestamp: new Date(),
          });
        }

        const response: APIResponse<{ message: string }> = {
          success: true,
          data: {
            message: 'Automation paused successfully',
          },
          timestamp: new Date(),
        };

        res.json(response);
      } catch (error) {
        logger.error('Failed to pause automation', {
          userId: req.user?.id,
          automationId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  /**
   * POST /api/v1/automation/resume/:automationId
   * Resume automation
   */
  router.post(
    '/resume/:automationId',
    validator.validateParams(z.object({
      automationId: z.string().uuid(),
    })),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { automationId } = req.params;

      logger.info('Resuming automation', {
        userId: req.user?.id,
        automationId,
      });

      try {
        const success = await deps.automationEngine.resumeAutomation(automationId);

        if (!success) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'AUTOMATION_CANNOT_RESUME',
              message: 'Automation cannot be resumed',
              retryable: false,
            },
            timestamp: new Date(),
          });
        }

        const response: APIResponse<{ message: string }> = {
          success: true,
          data: {
            message: 'Automation resumed successfully',
          },
          timestamp: new Date(),
        };

        res.json(response);
      } catch (error) {
        logger.error('Failed to resume automation', {
          userId: req.user?.id,
          automationId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  /**
   * POST /api/v1/automation/cancel/:automationId
   * Cancel automation
   */
  router.post(
    '/cancel/:automationId',
    validator.validateParams(z.object({
      automationId: z.string().uuid(),
    })),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { automationId } = req.params;

      logger.info('Cancelling automation', {
        userId: req.user?.id,
        automationId,
      });

      try {
        const success = await deps.automationEngine.cancelAutomation(automationId);

        if (!success) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'AUTOMATION_CANNOT_CANCEL',
              message: 'Automation cannot be cancelled',
              retryable: false,
            },
            timestamp: new Date(),
          });
        }

        const response: APIResponse<{ message: string }> = {
          success: true,
          data: {
            message: 'Automation cancelled successfully',
          },
          timestamp: new Date(),
        };

        res.json(response);
      } catch (error) {
        logger.error('Failed to cancel automation', {
          userId: req.user?.id,
          automationId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  /**
   * GET /api/v1/automation/metrics/:automationId
   * Get automation metrics
   */
  router.get(
    '/metrics/:automationId',
    validator.validateParams(z.object({
      automationId: z.string().uuid(),
    })),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { automationId } = req.params;

      logger.debug('Fetching automation metrics', {
        userId: req.user?.id,
        automationId,
      });

      try {
        const metrics = deps.automationEngine.getAutomationMetrics(automationId);

        if (!metrics) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'AUTOMATION_NOT_FOUND',
              message: 'Automation not found',
              retryable: false,
            },
            timestamp: new Date(),
          });
        }

        const response: APIResponse<{ metrics: typeof metrics }> = {
          success: true,
          data: {
            metrics,
          },
          timestamp: new Date(),
        };

        res.json(response);
      } catch (error) {
        logger.error('Failed to fetch automation metrics', {
          userId: req.user?.id,
          automationId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  /**
   * POST /api/v1/automation/extract-context
   * Extract page context for automation planning
   */
  router.post(
    '/extract-context',
    rateLimiter.createChatLimiter(),
    validator.validateBody(z.object({
      sessionId: z.string().min(1),
      url: z.string().url().optional(),
      options: z.object({
        browserInstanceId: z.string().optional(),
        includeScreenshot: z.boolean().default(false),
      }).optional(),
    })),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { sessionId, url, options } = req.body;

      logger.info('Extracting page context', {
        userId: req.user?.id,
        sessionId,
        url,
        includeScreenshot: options?.includeScreenshot,
      });

      try {
        const pageContext = await deps.automationEngine.extractPageContext(
          sessionId,
          url,
          options
        );

        const response: APIResponse<{ pageContext: typeof pageContext }> = {
          success: true,
          data: {
            pageContext,
          },
          metadata: {
            requestId: `context-${Date.now()}`,
            version: '1.0.0',
          },
          timestamp: new Date(),
        };

        logger.info('Page context extracted', {
          userId: req.user?.id,
          sessionId,
          url: pageContext.url,
          elementCount: pageContext.elements.length,
        });

        res.json(response);
      } catch (error) {
        logger.error('Failed to extract page context', {
          userId: req.user?.id,
          sessionId,
          url,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  /**
   * POST /api/v1/automation/screenshot
   * Take screenshot
   */
  router.post(
    '/screenshot',
    rateLimiter.createScreenshotLimiter(),
    validator.validateBody(z.object({
      sessionId: z.string().min(1),
      options: z.object({
        browserInstanceId: z.string().optional(),
        fullPage: z.boolean().default(false),
        highlightElements: z.array(z.string()).optional(),
      }).optional(),
    })),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { sessionId, options } = req.body;

      logger.info('Taking screenshot', {
        userId: req.user?.id,
        sessionId,
        fullPage: options?.fullPage,
        highlightCount: options?.highlightElements?.length || 0,
      });

      try {
        const screenshot = await deps.automationEngine.takeScreenshot(
          sessionId,
          options
        );

        const response: APIResponse<{ screenshot: string }> = {
          success: true,
          data: {
            screenshot,
          },
          metadata: {
            requestId: `screenshot-${Date.now()}`,
            version: '1.0.0',
          },
          timestamp: new Date(),
        };

        logger.info('Screenshot captured', {
          userId: req.user?.id,
          sessionId,
          screenshotSize: screenshot.length,
        });

        res.json(response);
      } catch (error) {
        logger.error('Failed to take screenshot', {
          userId: req.user?.id,
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  return router;
}
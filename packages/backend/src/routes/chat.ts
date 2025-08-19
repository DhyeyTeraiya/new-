import { Router } from 'express';
import { z } from 'zod';
import { 
  ChatRequest, 
  ChatResponse, 
  APIResponse,
  PageContextSchema,
  MessageTypeSchema 
} from '@browser-ai-agent/shared';
import { AuthenticatedRequest } from '../middleware/auth';
import { validator } from '../middleware/validation';
import { rateLimiter } from '../middleware/rate-limit';
import { ErrorHandler } from '../middleware/error-handler';
import { AIService } from '../services/nvidia';
import { IntegrationService } from '../services/ai-automation';
import { createLogger } from '../utils/logger';

export interface ChatRouterDependencies {
  aiService: AIService;
  integrationService: IntegrationService;
  errorHandler: ErrorHandler;
}

export function createChatRouter(deps: ChatRouterDependencies): Router {
  const router = Router();
  const logger = createLogger('ChatRouter');

  // Chat request schema
  const chatRequestSchema = z.object({
    message: z.string().min(1).max(5000),
    sessionId: z.string().min(1),
    pageContext: PageContextSchema.optional(),
    type: MessageTypeSchema.default('command'),
    metadata: z.record(z.any()).optional(),
  });

  /**
   * POST /api/v1/chat/message
   * Send a message to the AI assistant
   */
  router.post(
    '/message',
    rateLimiter.createChatLimiter(),
    validator.validateBody(chatRequestSchema),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { message, sessionId, pageContext, type, metadata } = req.body as ChatRequest;

      logger.info('Processing chat message', {
        userId: req.user?.id,
        sessionId,
        messageLength: message.length,
        messageType: type,
        hasPageContext: !!pageContext,
      });

      try {
        // Process message with AI automation integration
        const result = await deps.integrationService.processMessage(
          sessionId,
          message,
          pageContext || {} as any,
          []
        );

        const response: APIResponse<ChatResponse> = {
          success: true,
          data: {
            response: result.aiResponse,
            automationPlan: result.automationPlan,
            requiresConfirmation: result.requiresConfirmation,
            metadata: result.metadata,
          },
          metadata: {
            requestId: `chat-${Date.now()}`,
            processingTime: result.aiResponse.metadata?.totalProcessingTime || 0,
            version: '1.0.0',
          },
          timestamp: new Date(),
        };

        logger.info('Chat message processed successfully', {
          userId: req.user?.id,
          sessionId,
          responseType: result.aiResponse.type,
          hasAutomationPlan: !!result.automationPlan,
          requiresConfirmation: result.requiresConfirmation,
          processingTime: result.aiResponse.metadata?.totalProcessingTime,
        });

        res.json(response);
      } catch (error) {
        logger.error('Chat message processing failed', {
          userId: req.user?.id,
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  /**
   * POST /api/v1/chat/analyze-visual
   * Analyze page visually using screenshot
   */
  router.post(
    '/analyze-visual',
    rateLimiter.createChatLimiter(),
    validator.validateBody(z.object({
      sessionId: z.string().min(1),
      screenshotData: z.string().min(1),
      query: z.string().max(1000).optional(),
    })),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { sessionId, screenshotData, query } = req.body;

      logger.info('Processing visual analysis request', {
        userId: req.user?.id,
        sessionId,
        hasQuery: !!query,
        screenshotSize: screenshotData.length,
      });

      try {
        const aiResponse = await deps.aiService.analyzePageVisually(
          sessionId,
          screenshotData,
          query
        );

        const response: APIResponse<ChatResponse> = {
          success: true,
          data: {
            response: aiResponse,
          },
          metadata: {
            requestId: `visual-${Date.now()}`,
            processingTime: aiResponse.metadata?.processingTime || 0,
            version: '1.0.0',
          },
          timestamp: new Date(),
        };

        logger.info('Visual analysis completed', {
          userId: req.user?.id,
          sessionId,
          processingTime: aiResponse.metadata?.processingTime,
        });

        res.json(response);
      } catch (error) {
        logger.error('Visual analysis failed', {
          userId: req.user?.id,
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  /**
   * POST /api/v1/chat/generate-plan
   * Generate action plan for complex automation
   */
  router.post(
    '/generate-plan',
    rateLimiter.createChatLimiter(),
    validator.validateBody(z.object({
      sessionId: z.string().min(1),
      userGoal: z.string().min(1).max(2000),
      pageContext: PageContextSchema.optional(),
    })),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { sessionId, userGoal, pageContext } = req.body;

      logger.info('Generating action plan', {
        userId: req.user?.id,
        sessionId,
        goalLength: userGoal.length,
        hasPageContext: !!pageContext,
      });

      try {
        const aiResponse = await deps.aiService.generateActionPlan(
          sessionId,
          userGoal,
          pageContext
        );

        const response: APIResponse<ChatResponse> = {
          success: true,
          data: {
            response: aiResponse,
          },
          metadata: {
            requestId: `plan-${Date.now()}`,
            processingTime: aiResponse.metadata?.processingTime || 0,
            version: '1.0.0',
          },
          timestamp: new Date(),
        };

        logger.info('Action plan generated', {
          userId: req.user?.id,
          sessionId,
          actionCount: aiResponse.actions?.length || 0,
          processingTime: aiResponse.metadata?.processingTime,
        });

        res.json(response);
      } catch (error) {
        logger.error('Action plan generation failed', {
          userId: req.user?.id,
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  /**
   * GET /api/v1/chat/history/:sessionId
   * Get conversation history for a session
   */
  router.get(
    '/history/:sessionId',
    validator.validateParams(z.object({
      sessionId: z.string().min(1),
    })),
    validator.validateQuery(z.object({
      limit: z.string().transform(val => parseInt(val)).pipe(z.number().min(1).max(100)).default('50'),
      offset: z.string().transform(val => parseInt(val)).pipe(z.number().min(0)).default('0'),
    })),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { sessionId } = req.params;
      const { limit, offset } = req.query as any;

      logger.debug('Fetching conversation history', {
        userId: req.user?.id,
        sessionId,
        limit,
        offset,
      });

      try {
        // Get conversation context from AI service
        const context = deps.aiService['contextManager'].getContext(sessionId);
        
        if (!context) {
          const response: APIResponse = {
            success: true,
            data: {
              messages: [],
              total: 0,
              hasMore: false,
            },
            timestamp: new Date(),
          };
          return res.json(response);
        }

        const messages = context.messages.slice(offset, offset + limit);
        const total = context.messages.length;
        const hasMore = offset + limit < total;

        const response: APIResponse = {
          success: true,
          data: {
            messages,
            total,
            hasMore,
            pagination: {
              limit,
              offset,
              nextOffset: hasMore ? offset + limit : null,
            },
          },
          timestamp: new Date(),
        };

        res.json(response);
      } catch (error) {
        logger.error('Failed to fetch conversation history', {
          userId: req.user?.id,
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  /**
   * POST /api/v1/chat/execute-automation
   * Execute an automation plan
   */
  router.post(
    '/execute-automation',
    rateLimiter.createChatLimiter(),
    validator.validateBody(z.object({
      sessionId: z.string().min(1),
      planId: z.string().min(1),
      userConfirmation: z.boolean().optional(),
    })),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { sessionId, planId, userConfirmation } = req.body as any;

      logger.info('Executing automation plan', {
        userId: req.user?.id,
        sessionId,
        planId,
        userConfirmation,
      });

      try {
        const result = await deps.integrationService.executeAutomation(
          sessionId,
          planId,
          userConfirmation
        );

        const response: APIResponse = {
          success: true,
          data: {
            result: result.result,
            feedback: result.feedback,
            alternativePlan: result.alternativePlan,
          },
          metadata: {
            requestId: `automation-${Date.now()}`,
            executionTime: result.result.executionTime,
            version: '1.0.0',
          },
          timestamp: new Date(),
        };

        logger.info('Automation execution completed', {
          userId: req.user?.id,
          sessionId,
          planId,
          success: result.result.success,
          stepsExecuted: result.result.stepsExecuted,
          executionTime: result.result.executionTime,
        });

        res.json(response);
      } catch (error) {
        logger.error('Automation execution failed', {
          userId: req.user?.id,
          sessionId,
          planId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  /**
   * GET /api/v1/chat/automation-status/:sessionId
   * Get automation status for a session
   */
  router.get(
    '/automation-status/:sessionId',
    validator.validateParams(z.object({
      sessionId: z.string().min(1),
    })),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { sessionId } = req.params as any;

      try {
        const status = deps.integrationService.getAutomationStatus(sessionId);

        const response: APIResponse = {
          success: true,
          data: status,
          timestamp: new Date(),
        };

        res.json(response);
      } catch (error) {
        logger.error('Failed to get automation status', {
          userId: req.user?.id,
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  /**
   * POST /api/v1/chat/cancel-automation
   * Cancel running automation
   */
  router.post(
    '/cancel-automation',
    rateLimiter.createChatLimiter(),
    validator.validateBody(z.object({
      sessionId: z.string().min(1),
    })),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { sessionId } = req.body as any;

      logger.info('Cancelling automation', {
        userId: req.user?.id,
        sessionId,
      });

      try {
        await deps.integrationService.cancelAutomation(sessionId);

        const response: APIResponse = {
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
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  /**
   * POST /api/v1/chat/provide-feedback
   * Provide user feedback on automation results
   */
  router.post(
    '/provide-feedback',
    rateLimiter.createChatLimiter(),
    validator.validateBody(z.object({
      sessionId: z.string().min(1),
      planId: z.string().min(1),
      rating: z.number().min(1).max(5),
      comments: z.string().max(1000).optional(),
      wasHelpful: z.boolean(),
    })),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { sessionId, planId, rating, comments, wasHelpful } = req.body as any;

      logger.info('Processing user feedback', {
        userId: req.user?.id,
        sessionId,
        planId,
        rating,
        wasHelpful,
      });

      try {
        const aiResponse = await deps.integrationService.provideUserFeedback(
          sessionId,
          planId,
          { rating, comments, wasHelpful }
        );

        const response: APIResponse<ChatResponse> = {
          success: true,
          data: {
            response: aiResponse,
          },
          metadata: {
            requestId: `feedback-${Date.now()}`,
            version: '1.0.0',
          },
          timestamp: new Date(),
        };

        res.json(response);
      } catch (error) {
        logger.error('Failed to process user feedback', {
          userId: req.user?.id,
          sessionId,
          planId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  /**
   * GET /api/v1/chat/learning-insights
   * Get learning insights and statistics
   */
  router.get(
    '/learning-insights',
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      try {
        const insights = deps.integrationService.getLearningInsights();

        const response: APIResponse = {
          success: true,
          data: insights,
          timestamp: new Date(),
        };

        res.json(response);
      } catch (error) {
        logger.error('Failed to get learning insights', {
          userId: req.user?.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    })
  );

  /**
   * DELETE /api/v1/chat/history/:sessionId
   * Clear conversation history for a session
   */
  router.delete(
    '/history/:sessionId',
    validator.validateParams(z.object({
      sessionId: z.string().min(1),
    })),
    deps.errorHandler.asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { sessionId } = req.params as any;

      logger.info('Clearing conversation history', {
        userId: req.user?.id,
        sessionId,
      });

      try {
        // Clear context in AI service
        deps.aiService['contextManager'].removeContext(sessionId);

        const response: APIResponse = {
          success: true,
          data: {
            message: 'Conversation history cleared',
          },
          timestamp: new Date(),
        };

        res.json(response);
      } catch (error) {
        logger.error('Failed to clear conversation history', {
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
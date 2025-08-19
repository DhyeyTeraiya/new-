import { 
  AIResponse, 
  UserIntent, 
  PageContext, 
  UserSession,
  Message,
  MessageType
} from '@browser-ai-agent/shared';
import { NVIDIAClient, NVIDIAClientConfig } from './nvidia-client';
import { ContextManager } from './context-manager';
import { IntentClassifier } from './intent-classifier';
import { ResponseGenerator } from './response-generator';
import { Logger } from 'winston';
import { createLogger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface AIServiceConfig {
  nvidia: NVIDIAClientConfig;
  maxContextLength: number;
  enableCaching: boolean;
  cacheTimeout: number;
}

export class AIService {
  private readonly logger: Logger;
  private readonly nvidiaClient: NVIDIAClient;
  private readonly contextManager: ContextManager;
  private readonly intentClassifier: IntentClassifier;
  private readonly responseGenerator: ResponseGenerator;
  private readonly config: AIServiceConfig;
  private readonly responseCache: Map<string, { response: AIResponse; timestamp: number }>;

  constructor(config: AIServiceConfig) {
    this.logger = createLogger('AIService');
    this.config = config;
    this.responseCache = new Map();

    // Initialize NVIDIA client
    this.nvidiaClient = new NVIDIAClient(config.nvidia);

    // Initialize service components
    this.contextManager = new ContextManager(config.maxContextLength);
    this.intentClassifier = new IntentClassifier(this.nvidiaClient);
    this.responseGenerator = new ResponseGenerator(this.nvidiaClient);

    this.logger.info('AI Service initialized', {
      models: this.nvidiaClient.getModelInfo(),
      maxContextLength: config.maxContextLength,
      cachingEnabled: config.enableCaching,
    });
  }

  /**
   * Process a user message and generate AI response
   */
  async processMessage(
    message: string,
    sessionId: string,
    pageContext?: PageContext,
    messageType: MessageType = 'command'
  ): Promise<AIResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.debug('Processing message', {
        sessionId,
        messageLength: message.length,
        messageType,
        hasPageContext: !!pageContext,
      });

      // Check cache first if enabled
      if (this.config.enableCaching) {
        const cached = this.getCachedResponse(message, sessionId);
        if (cached) {
          this.logger.debug('Returning cached response', { sessionId });
          return cached;
        }
      }

      // Update page context if provided
      if (pageContext) {
        this.contextManager.updatePageContext(sessionId, pageContext);
      }

      // Classify user intent
      const intent = await this.intentClassifier.classifyIntent(message, pageContext);
      
      this.logger.debug('Intent classified', {
        sessionId,
        category: intent.category,
        action: intent.action,
        confidence: intent.confidence,
      });

      // Get conversation context
      const context = this.contextManager.getContext(sessionId);
      const conversationHistory = context?.messages.slice(-5).map(m => m.content) || [];

      // Generate response based on intent
      const response = await this.responseGenerator.generateResponse(
        message,
        intent,
        pageContext,
        conversationHistory
      );

      // Add processing metadata
      response.metadata = {
        ...response.metadata,
        totalProcessingTime: Date.now() - startTime,
        intentCategory: intent.category,
        intentConfidence: intent.confidence,
      };

      // Cache response if enabled
      if (this.config.enableCaching && response.confidence > 0.7) {
        this.cacheResponse(message, sessionId, response);
      }

      // Add message to context
      this.addMessageToContext(sessionId, message, response, messageType);

      this.logger.info('Message processed successfully', {
        sessionId,
        intentCategory: intent.category,
        responseType: response.type,
        hasActions: !!response.actions?.length,
        processingTime: Date.now() - startTime,
      });

      return response;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error('Message processing failed', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime,
      });

      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error occurred',
        processingTime
      );
    }
  }

  /**
   * Analyze page content using vision model
   */
  async analyzePageVisually(
    sessionId: string,
    screenshotData: string,
    userQuery?: string
  ): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      this.logger.debug('Analyzing page visually', {
        sessionId,
        hasScreenshot: !!screenshotData,
        hasQuery: !!userQuery,
      });

      const query = userQuery || 'Analyze this webpage screenshot and describe what you see';
      const messages = this.contextManager.buildVisionPrompt(sessionId, query, screenshotData);

      const nvidiaResponse = await this.nvidiaClient.sendVisionRequest(messages, {
        max_tokens: 800,
        temperature: 0.3,
      });

      const content = nvidiaResponse.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from vision model');
      }

      const response: AIResponse = {
        id: uuidv4(),
        message: content,
        type: 'analysis',
        confidence: 0.8,
        metadata: {
          model: 'vision',
          processingTime: Date.now() - startTime,
          hasScreenshot: true,
          tokenUsage: nvidiaResponse.usage,
        },
        timestamp: new Date(),
      };

      this.logger.info('Visual analysis completed', {
        sessionId,
        processingTime: Date.now() - startTime,
        tokensUsed: nvidiaResponse.usage?.total_tokens,
      });

      return response;
    } catch (error) {
      this.logger.error('Visual analysis failed', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return this.createErrorResponse(
        `Visual analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        Date.now() - startTime
      );
    }
  }

  /**
   * Generate action plan for complex automation
   */
  async generateActionPlan(
    sessionId: string,
    userGoal: string,
    pageContext?: PageContext
  ): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      this.logger.debug('Generating action plan', {
        sessionId,
        goalLength: userGoal.length,
        hasPageContext: !!pageContext,
      });

      const messages = this.contextManager.buildNVIDIAMessages(
        sessionId,
        `Create a detailed action plan for: ${userGoal}`,
        true,
        false // Don't include full history for planning
      );

      // Use complex model for sophisticated planning
      const nvidiaResponse = await this.nvidiaClient.sendComplexRequest(messages, {
        max_tokens: 1200,
        temperature: 0.2, // Low temperature for consistent planning
      });

      const content = nvidiaResponse.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from planning model');
      }

      // Parse the response to extract action plan
      const actionPlan = this.parseActionPlan(content, pageContext);

      const response: AIResponse = {
        id: uuidv4(),
        message: content,
        actions: actionPlan.actions,
        type: 'action_plan',
        confidence: 0.85,
        metadata: {
          model: 'complex',
          processingTime: Date.now() - startTime,
          actionCount: actionPlan.actions.length,
          requiresConfirmation: actionPlan.requiresConfirmation,
          tokenUsage: nvidiaResponse.usage,
        },
        timestamp: new Date(),
      };

      this.logger.info('Action plan generated', {
        sessionId,
        actionCount: actionPlan.actions.length,
        processingTime: Date.now() - startTime,
      });

      return response;
    } catch (error) {
      this.logger.error('Action plan generation failed', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return this.createErrorResponse(
        `Action plan generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        Date.now() - startTime
      );
    }
  }

  /**
   * Initialize session context
   */
  initializeSession(session: UserSession): void {
    this.contextManager.initializeContext(session);
    this.logger.debug('Session initialized', { sessionId: session.id });
  }

  /**
   * Clean up session context
   */
  cleanupSession(sessionId: string): void {
    this.contextManager.removeContext(sessionId);
    this.clearSessionCache(sessionId);
    this.logger.debug('Session cleaned up', { sessionId });
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    models: Record<string, boolean>;
    stats: any;
  }> {
    try {
      const modelHealth = await this.nvidiaClient.healthCheck();
      const contextStats = this.contextManager.getStats();
      
      const healthyModels = Object.values(modelHealth).filter(Boolean).length;
      const totalModels = Object.keys(modelHealth).length;
      
      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (healthyModels === totalModels) {
        status = 'healthy';
      } else if (healthyModels > 0) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }

      return {
        status,
        models: modelHealth,
        stats: {
          ...contextStats,
          cacheSize: this.responseCache.size,
        },
      };
    } catch (error) {
      this.logger.error('Health check failed', { error });
      return {
        status: 'unhealthy',
        models: {},
        stats: {},
      };
    }
  }

  /**
   * Private helper methods
   */
  private getCachedResponse(message: string, sessionId: string): AIResponse | null {
    const cacheKey = this.generateCacheKey(message, sessionId);
    const cached = this.responseCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.config.cacheTimeout) {
      cached.response.metadata = {
        ...cached.response.metadata,
        cached: true,
      };
      return cached.response;
    }

    if (cached) {
      this.responseCache.delete(cacheKey);
    }

    return null;
  }

  private cacheResponse(message: string, sessionId: string, response: AIResponse): void {
    const cacheKey = this.generateCacheKey(message, sessionId);
    this.responseCache.set(cacheKey, {
      response: { ...response },
      timestamp: Date.now(),
    });

    // Clean up old cache entries periodically
    if (this.responseCache.size > 1000) {
      this.cleanupCache();
    }
  }

  private generateCacheKey(message: string, sessionId: string): string {
    // Simple hash function for cache key
    const combined = `${sessionId}:${message}`;
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  private cleanupCache(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [key, cached] of this.responseCache.entries()) {
      if (now - cached.timestamp > this.config.cacheTimeout) {
        expired.push(key);
      }
    }

    expired.forEach(key => this.responseCache.delete(key));
    
    this.logger.debug('Cache cleaned up', { 
      expiredEntries: expired.length,
      remainingEntries: this.responseCache.size 
    });
  }

  private clearSessionCache(sessionId: string): void {
    const keysToDelete: string[] = [];
    
    for (const key of this.responseCache.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.responseCache.delete(key));
  }

  private addMessageToContext(
    sessionId: string,
    userMessage: string,
    aiResponse: AIResponse,
    messageType: MessageType
  ): void {
    // Add user message
    const userMsg: Message = {
      id: uuidv4(),
      type: messageType,
      content: userMessage,
      sender: 'user',
      timestamp: new Date(),
    };
    this.contextManager.addMessage(sessionId, userMsg);

    // Add AI response
    const aiMsg: Message = {
      id: aiResponse.id,
      type: 'response',
      content: aiResponse.message,
      sender: 'ai',
      actions: aiResponse.actions,
      metadata: {
        confidence: aiResponse.confidence,
        model: aiResponse.metadata?.model,
      },
      timestamp: aiResponse.timestamp,
    };
    this.contextManager.addMessage(sessionId, aiMsg);
  }

  private createErrorResponse(errorMessage: string, processingTime: number): AIResponse {
    return {
      id: uuidv4(),
      message: `I encountered an error: ${errorMessage}. Please try again or rephrase your request.`,
      type: 'error',
      confidence: 0,
      metadata: {
        processingTime,
        error: true,
      },
      timestamp: new Date(),
    };
  }

  private parseActionPlan(content: string, pageContext?: PageContext): {
    actions: any[];
    requiresConfirmation: boolean;
  } {
    // This would contain sophisticated parsing logic to extract
    // structured action plans from AI responses
    // For now, return a simple structure
    return {
      actions: [],
      requiresConfirmation: true,
    };
  }
}
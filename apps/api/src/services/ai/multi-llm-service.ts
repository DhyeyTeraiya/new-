import { logger } from '../../utils/logger';
import { createNvidiaClient, ChatMessage, ChatCompletionRequest } from './nvidia-client';
import { ModelRouter, AIModel, TaskContext, RouteDecision } from './model-router';
import { TaskType, AgentType } from '../../../../../packages/shared/src/types/agent';
import { IntentClassifier } from './intent-classifier';
import { ContextManager } from './context-manager';
import { ResponseGenerator } from './response-generator';
import { PerformanceMonitor, RequestTracker } from './performance-monitor';
import { AIConfigManager } from './ai-config';

// =============================================================================
// MULTI-LLM SERVICE (Superior to Manus Claude+Qwen Setup)
// Implements Master Plan Section 5: NVIDIA Multi-Model Strategy
// =============================================================================

export interface LLMProvider {
  name: string;
  client: any;
  models: AIModel[];
  isHealthy: boolean;
  lastHealthCheck: Date;
}

export interface LLMRequest {
  taskContext: TaskContext;
  messages: ChatMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  userId?: string;
  sessionId?: string;
}

export interface LLMResponse {
  content: string;
  model: AIModel;
  provider: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata: {
    routingDecision: RouteDecision;
    executionTime: number;
    cost: number;
    confidence: number;
    fallbackUsed?: boolean;
    retryCount?: number;
  };
}

export interface StreamingLLMResponse {
  onChunk: (chunk: string) => void;
  onComplete: (response: LLMResponse) => void;
  onError: (error: Error) => void;
}

// =============================================================================
// MULTI-LLM SERVICE CLASS
// =============================================================================

export class MultiLLMService {
  private static instance: MultiLLMService;
  private providers: Map<string, LLMProvider> = new Map();
  private modelRouter: ModelRouter;
  private intentClassifier: IntentClassifier;
  private contextManager: ContextManager;
  private responseGenerator: ResponseGenerator;
  private performanceMonitor: PerformanceMonitor;
  private configManager: AIConfigManager;
  private healthCheckInterval?: NodeJS.Timeout;

  private constructor() {
    this.modelRouter = ModelRouter.getInstance();
    this.intentClassifier = IntentClassifier.getInstance();
    this.contextManager = ContextManager.getInstance();
    this.responseGenerator = ResponseGenerator.getInstance();
    this.performanceMonitor = PerformanceMonitor.getInstance();
    this.configManager = AIConfigManager.getInstance();
    this.initializeProviders();
    this.startHealthChecks();
  }

  public static getInstance(): MultiLLMService {
    if (!MultiLLMService.instance) {
      MultiLLMService.instance = new MultiLLMService();
    }
    return MultiLLMService.instance;
  }

  /**
   * Initialize all LLM providers
   */
  private async initializeProviders(): Promise<void> {
    try {
      // NVIDIA NIM Provider (Primary)
      const nvidiaClient = createNvidiaClient();
      this.providers.set('nvidia', {
        name: 'NVIDIA NIM',
        client: nvidiaClient,
        models: [
          AIModel.LLAMA_3_70B,
          AIModel.MISTRAL_7B,
          AIModel.NEMO_RETRIEVER,
          AIModel.MIXTRAL_8X7B,
          AIModel.LLAMA_3_8B,
          AIModel.DEEPSEEK_CODER,
          AIModel.CODE_LLAMA,
        ],
        isHealthy: true,
        lastHealthCheck: new Date(),
      });

      // Anthropic Provider (Fallback)
      if (process.env['ANTHROPIC_API_KEY']) {
        const anthropicClient = this.createAnthropicClient();
        this.providers.set('anthropic', {
          name: 'Anthropic',
          client: anthropicClient,
          models: [AIModel.CLAUDE_3_5_SONNET],
          isHealthy: true,
          lastHealthCheck: new Date(),
        });
      }

      // OpenAI Provider (Fallback)
      if (process.env['OPENAI_API_KEY']) {
        const openaiClient = this.createOpenAIClient();
        this.providers.set('openai', {
          name: 'OpenAI',
          client: openaiClient,
          models: [AIModel.GPT_4O],
          isHealthy: true,
          lastHealthCheck: new Date(),
        });
      }

      // Google Provider (Fallback)
      if (process.env['GOOGLE_AI_API_KEY']) {
        const googleClient = this.createGoogleClient();
        this.providers.set('google', {
          name: 'Google',
          client: googleClient,
          models: [AIModel.GEMINI_PRO],
          isHealthy: true,
          lastHealthCheck: new Date(),
        });
      }

      logger.info('Multi-LLM service initialized', {
        providers: Array.from(this.providers.keys()),
        totalModels: Array.from(this.providers.values()).reduce((sum, p) => sum + p.models.length, 0),
      });
    } catch (error) {
      logger.error('Failed to initialize LLM providers', error);
      throw error;
    }
  }

  /**
   * Enhanced chat completion with advanced intent classification and context management
   * Superior to Manus Claude+Qwen setup with multi-model routing and confidence scoring
   */
  public async chatWithContext(
    sessionId: string,
    userMessage: string,
    userId?: string
  ): Promise<{
    response: string;
    intent: any;
    context: any;
    metadata: any;
  }> {
    const startTime = Date.now();
    
    try {
      // Get or create conversation context
      let context = await this.contextManager.getContext(sessionId);
      if (!context) {
        context = await this.contextManager.createContext(sessionId, userId);
      }

      // Add user message to context
      await this.contextManager.addMessage(sessionId, {
        role: 'user',
        content: userMessage,
      });

      // Classify intent
      const intentResult = await this.intentClassifier.classifyIntent({
        content: userMessage,
        userId,
        sessionId,
        context: {
          previousTasks: context.messages.slice(-5).map(m => m.content),
          userProfile: context.userProfile,
        },
      });

      // Generate response using advanced response generator
      const generatedResponse = await this.responseGenerator.generateResponse({
        intent: intentResult.primaryIntent,
        context,
        userMessage,
        agentType: intentResult.primaryIntent.agentType,
      });

      // Add assistant response to context
      await this.contextManager.addMessage(sessionId, {
        role: 'assistant',
        content: generatedResponse.content,
        metadata: {
          intent: intentResult.primaryIntent.type,
          confidence: intentResult.confidence,
          processingTime: Date.now() - startTime,
        },
      });

      logger.info('Enhanced chat completion successful', {
        sessionId,
        intent: intentResult.primaryIntent.type,
        confidence: intentResult.confidence,
        responseLength: generatedResponse.content.length,
        processingTime: Date.now() - startTime,
      });

      return {
        response: generatedResponse.content,
        intent: intentResult,
        context: await this.contextManager.getContextSummary(sessionId),
        metadata: {
          ...generatedResponse.metadata,
          suggestedActions: generatedResponse.suggestedActions,
          followUpQuestions: generatedResponse.followUpQuestions,
          clarifications: generatedResponse.clarifications,
        },
      };
    } catch (error) {
      logger.error('Enhanced chat completion failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId,
        userMessage: userMessage.substring(0, 100),
      });
      throw error;
    }
  }

  /**
   * Main completion method with intelligent routing and performance monitoring
   */
  public async complete(request: LLMRequest): Promise<LLMResponse> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tracker = this.performanceMonitor.startRequest(requestId);
    
    try {
      // Route to optimal model
      tracker.startQueue();
      const routingDecision = this.modelRouter.routeTask(request.taskContext);
      
      logger.info('LLM request routed', {
        requestId,
        model: routingDecision.model,
        confidence: routingDecision.confidence,
        estimatedCost: routingDecision.estimated_cost,
        reasoning: routingDecision.reasoning,
      });

      // Attempt completion with primary model
      tracker.startProcessing();
      let response: LLMResponse;
      let fallbackUsed = false;
      let retryCount = 0;
      let lastError: Error | null = null;

      try {
        response = await this.executeCompletion(routingDecision.model, request, routingDecision);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        logger.warn('Primary model failed, trying fallbacks', {
          requestId,
          primaryModel: routingDecision.model,
          error: lastError.message,
        });

        // Try fallback models
        for (const fallbackModel of routingDecision.fallback_models) {
          try {
            retryCount++;
            response = await this.executeCompletion(fallbackModel, request, routingDecision);
            fallbackUsed = true;
            lastError = null;
            break;
          } catch (fallbackError) {
            lastError = fallbackError instanceof Error ? fallbackError : new Error('Unknown error');
            logger.warn('Fallback model failed', {
              requestId,
              fallbackModel,
              error: lastError.message,
            });
          }
        }

        if (!response) {
          throw lastError || new Error('All models failed to complete the request');
        }
      }

      // Update performance metrics
      this.modelRouter.updatePerformanceMetrics(
        response.model,
        true,
        response.metadata.executionTime,
        response.metadata.cost
      );

      // Record performance metrics
      tracker.complete(
        response.model,
        request.taskContext.type,
        true,
        response.usage.totalTokens,
        response.metadata.cost,
        response.metadata.confidence,
        {
          agentType: request.taskContext.agent_type,
          userId: request.userId,
          sessionId: request.sessionId,
          retryCount,
          fallbackUsed,
        }
      );

      // Add metadata
      response.metadata = {
        ...response.metadata,
        routingDecision,
        fallbackUsed,
        retryCount,
        requestId,
      };

      logger.info('LLM completion successful', {
        requestId,
        model: response.model,
        provider: response.provider,
        executionTime: response.metadata.executionTime,
        totalTokens: response.usage.totalTokens,
        cost: response.metadata.cost,
        fallbackUsed,
      });

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Record failed performance metrics
      tracker.complete(
        routingDecision?.model || AIModel.MISTRAL_7B,
        request.taskContext.type,
        false,
        0,
        0,
        0,
        {
          agentType: request.taskContext.agent_type,
          userId: request.userId,
          sessionId: request.sessionId,
          errorType: this.categorizeError(error),
          retryCount,
          fallbackUsed,
        }
      );
      
      logger.error('LLM completion failed', {
        requestId,
        error: errorMessage,
        taskType: request.taskContext.type,
        agentType: request.taskContext.agent_type,
      });

      throw error;
    }
  }

  /**
   * Execute completion with specific model
   */
  private async executeCompletion(
    model: AIModel,
    request: LLMRequest,
    routingDecision: RouteDecision
  ): Promise<LLMResponse> {
    const provider = this.getProviderForModel(model);
    
    if (!provider) {
      throw new Error(`No provider available for model ${model}`);
    }

    if (!provider.isHealthy) {
      throw new Error(`Provider ${provider.name} is not healthy`);
    }

    const startTime = Date.now();
    
    // Prepare chat request
    const chatRequest: ChatCompletionRequest = {
      model,
      messages: this.prepareMessages(request),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 2048,
    };

    // Execute based on provider type
    let response: any;
    
    if (provider.name === 'NVIDIA NIM') {
      response = await provider.client.chatCompletion(chatRequest);
    } else {
      response = await this.executeExternalProvider(provider, chatRequest);
    }

    const executionTime = Date.now() - startTime;
    const cost = this.calculateCost(model, response.usage.total_tokens);

    return {
      content: response.choices[0].message.content,
      model,
      provider: provider.name,
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
      metadata: {
        routingDecision,
        executionTime,
        cost,
        confidence: routingDecision.confidence,
      },
    };
  }

  /**
   * Execute completion with external providers (Anthropic, OpenAI, Google)
   */
  private async executeExternalProvider(provider: LLMProvider, request: ChatCompletionRequest): Promise<any> {
    switch (provider.name) {
      case 'Anthropic':
        return await this.executeAnthropicCompletion(provider.client, request);
      case 'OpenAI':
        return await this.executeOpenAICompletion(provider.client, request);
      case 'Google':
        return await this.executeGoogleCompletion(provider.client, request);
      default:
        throw new Error(`Unknown provider: ${provider.name}`);
    }
  }

  /**
   * Prepare messages with system prompt
   */
  private prepareMessages(request: LLMRequest): ChatMessage[] {
    const messages: ChatMessage[] = [];
    
    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt,
      });
    }
    
    messages.push(...request.messages);
    return messages;
  }

  /**
   * Get provider that supports the specified model
   */
  private getProviderForModel(model: AIModel): LLMProvider | null {
    for (const provider of this.providers.values()) {
      if (provider.models.includes(model) && provider.isHealthy) {
        return provider;
      }
    }
    return null;
  }

  /**
   * Calculate cost based on model and token usage
   */
  private calculateCost(model: AIModel, totalTokens: number): number {
    const costPer1kTokens = {
      [AIModel.LLAMA_3_70B]: 0.008,
      [AIModel.MISTRAL_7B]: 0.0015,
      [AIModel.NEMO_RETRIEVER]: 0.001,
      [AIModel.MIXTRAL_8X7B]: 0.006,
      [AIModel.LLAMA_3_8B]: 0.002,
      [AIModel.DEEPSEEK_CODER]: 0.004,
      [AIModel.CODE_LLAMA]: 0.005,
      [AIModel.CLAUDE_3_5_SONNET]: 0.015,
      [AIModel.GPT_4O]: 0.03,
      [AIModel.GEMINI_PRO]: 0.0025,
    };

    return (totalTokens / 1000) * (costPer1kTokens[model] || 0.01);
  }

  /**
   * Health check for all providers
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const [name, provider] of this.providers) {
        try {
          if (provider.name === 'NVIDIA NIM') {
            const health = await provider.client.healthCheck();
            provider.isHealthy = health.status === 'healthy';
          } else {
            // Simple ping for external providers
            provider.isHealthy = await this.pingExternalProvider(provider);
          }
          
          provider.lastHealthCheck = new Date();
          
          if (!provider.isHealthy) {
            logger.warn(`Provider ${name} is unhealthy`);
          }
        } catch (error) {
          provider.isHealthy = false;
          logger.error(`Health check failed for provider ${name}`, error);
        }
      }
    }, 60000); // Check every minute
  }

  /**
   * Get comprehensive service statistics
   */
  public getStats(): {
    providers: Array<{
      name: string;
      isHealthy: boolean;
      models: AIModel[];
      lastHealthCheck: Date;
    }>;
    routingAnalytics: any;
    performance: any;
    alerts: any;
  } {
    return {
      providers: Array.from(this.providers.values()).map(p => ({
        name: p.name,
        isHealthy: p.isHealthy,
        models: p.models,
        lastHealthCheck: p.lastHealthCheck,
      })),
      routingAnalytics: this.modelRouter.getRoutingAnalytics(),
      performance: this.performanceMonitor.getPerformanceSummary(),
      alerts: {
        active: this.performanceMonitor.getActiveAlerts(),
        recent: this.performanceMonitor.getAlertHistory(10),
      },
    };
  }

  /**
   * Get detailed performance metrics
   */
  public getPerformanceMetrics(model?: AIModel, timeWindow?: string) {
    return this.performanceMonitor.getMetrics(model, timeWindow);
  }

  /**
   * Categorize errors for better monitoring
   */
  private categorizeError(error: any): string {
    if (!error) return 'UNKNOWN';
    
    const message = error.message || error.toString();
    
    if (message.includes('timeout') || message.includes('ECONNABORTED')) {
      return 'TIMEOUT';
    }
    
    if (message.includes('rate limit') || message.includes('429')) {
      return 'RATE_LIMIT';
    }
    
    if (message.includes('unauthorized') || message.includes('401')) {
      return 'AUTH_ERROR';
    }
    
    if (message.includes('not found') || message.includes('404')) {
      return 'NOT_FOUND';
    }
    
    if (message.includes('server error') || message.includes('500')) {
      return 'SERVER_ERROR';
    }
    
    if (message.includes('network') || message.includes('ENOTFOUND')) {
      return 'NETWORK_ERROR';
    }
    
    if (message.includes('validation') || message.includes('invalid')) {
      return 'VALIDATION_ERROR';
    }
    
    return 'UNKNOWN';
  }

  /**
   * Shutdown service and cleanup
   */
  public shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Shutdown all components
    this.performanceMonitor.shutdown();
    this.contextManager.shutdown();
    
    logger.info('Multi-LLM service shutdown');
  }

  // =============================================================================
  // EXTERNAL PROVIDER IMPLEMENTATIONS
  // =============================================================================

  private createAnthropicClient(): any {
    const axios = require('axios');
    return axios.create({
      baseURL: 'https://api.anthropic.com',
      headers: {
        'Authorization': `Bearer ${process.env['ANTHROPIC_API_KEY']}`,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      timeout: 60000,
    });
  }

  private createOpenAIClient(): any {
    const axios = require('axios');
    return axios.create({
      baseURL: 'https://api.openai.com/v1',
      headers: {
        'Authorization': `Bearer ${process.env['OPENAI_API_KEY']}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });
  }

  private createGoogleClient(): any {
    const axios = require('axios');
    return axios.create({
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });
  }

  private async executeAnthropicCompletion(client: any, request: ChatCompletionRequest): Promise<any> {
    const response = await client.post('/v1/messages', {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      messages: request.messages,
    });

    return {
      choices: [{
        message: {
          content: response.data.content[0].text,
        },
      }],
      usage: {
        prompt_tokens: response.data.usage.input_tokens,
        completion_tokens: response.data.usage.output_tokens,
        total_tokens: response.data.usage.input_tokens + response.data.usage.output_tokens,
      },
    };
  }

  private async executeOpenAICompletion(client: any, request: ChatCompletionRequest): Promise<any> {
    const response = await client.post('/chat/completions', {
      model: 'gpt-4o',
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
    });

    return response.data;
  }

  private async executeGoogleCompletion(client: any, request: ChatCompletionRequest): Promise<any> {
    const prompt = request.messages.map(m => `${m.role}: ${m.content}`).join('\n');
    
    const response = await client.post(`/models/gemini-pro:generateContent?key=${process.env['GOOGLE_AI_API_KEY']}`, {
      contents: [{
        parts: [{ text: prompt }],
      }],
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.max_tokens,
      },
    });

    return {
      choices: [{
        message: {
          content: response.data.candidates[0].content.parts[0].text,
        },
      }],
      usage: {
        prompt_tokens: response.data.usageMetadata?.promptTokenCount || 0,
        completion_tokens: response.data.usageMetadata?.candidatesTokenCount || 0,
        total_tokens: response.data.usageMetadata?.totalTokenCount || 0,
      },
    };
  }

  private async pingExternalProvider(provider: LLMProvider): Promise<boolean> {
    try {
      // Simple health check - attempt a minimal request
      const testRequest: ChatCompletionRequest = {
        model: provider.models[0],
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        temperature: 0,
      };

      await this.executeExternalProvider(provider, testRequest);
      return true;
    } catch (error) {
      return false;
    }
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

export function createMultiLLMService(): MultiLLMService {
  return MultiLLMService.getInstance();
}

export default MultiLLMService;
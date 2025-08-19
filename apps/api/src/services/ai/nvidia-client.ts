import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { logger } from '../../utils/logger';
import { AIModel } from './model-router';

// =============================================================================
// NVIDIA NIM CLIENT (Superior to Basic API Clients)
// =============================================================================

export interface NvidiaConfig {
  apiKey: string;
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  metadata?: Record<string, any>;
}

export interface ChatCompletionRequest {
  model: AIModel;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  stream?: boolean;
  user?: string;
  metadata?: Record<string, any>;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: ChatMessage;
    finish_reason: string;
    logprobs?: any;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  metadata?: Record<string, any>;
}

export interface EmbeddingRequest {
  model: string;
  input: string | string[];
  user?: string;
}

export interface EmbeddingResponse {
  object: string;
  data: {
    object: string;
    embedding: number[];
    index: number;
  }[];
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface ModelInfo {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  capabilities: string[];
  context_length: number;
  pricing: {
    input: number;
    output: number;
  };
}

// =============================================================================
// NVIDIA NIM CLIENT CLASS
// =============================================================================

export class NvidiaClient {
  private client: AxiosInstance;
  private config: NvidiaConfig;
  private requestCount: number = 0;
  private lastRequestTime: number = 0;
  private rateLimitRemaining: number = 1000;
  private rateLimitReset: number = 0;

  constructor(config: NvidiaConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'BrowserAIAgent/2.0.0',
      },
    });

    this.setupInterceptors();
  }

  /**
   * Setup request/response interceptors for monitoring and error handling
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        this.requestCount++;
        this.lastRequestTime = Date.now();
        
        // Add request ID for tracing
        config.headers['X-Request-ID'] = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        logger.debug('NVIDIA API request', {
          method: config.method,
          url: config.url,
          requestId: config.headers['X-Request-ID'],
        });
        
        return config;
      },
      (error) => {
        logger.error('NVIDIA API request error', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        // Update rate limit info
        this.rateLimitRemaining = parseInt(response.headers['x-ratelimit-remaining'] || '1000');
        this.rateLimitReset = parseInt(response.headers['x-ratelimit-reset'] || '0');
        
        logger.debug('NVIDIA API response', {
          status: response.status,
          requestId: response.config.headers['X-Request-ID'],
          rateLimitRemaining: this.rateLimitRemaining,
        });
        
        return response;
      },
      async (error) => {
        const requestId = error.config?.headers['X-Request-ID'];
        
        logger.error('NVIDIA API response error', {
          status: error.response?.status,
          message: error.message,
          requestId,
          data: error.response?.data,
        });

        // Handle rate limiting
        if (error.response?.status === 429) {
          const retryAfter = parseInt(error.response.headers['retry-after'] || '60');
          logger.warn(`Rate limited, retrying after ${retryAfter}s`, { requestId });
          
          await this.sleep(retryAfter * 1000);
          return this.client.request(error.config);
        }

        // Handle server errors with retry
        if (error.response?.status >= 500 && this.shouldRetry(error.config)) {
          const delay = this.calculateRetryDelay(error.config.retryCount || 0);
          logger.warn(`Server error, retrying after ${delay}ms`, { requestId });
          
          await this.sleep(delay);
          error.config.retryCount = (error.config.retryCount || 0) + 1;
          return this.client.request(error.config);
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Chat completion with advanced error handling and retries
   */
  public async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    try {
      // Validate request
      this.validateChatRequest(request);
      
      // Check rate limits
      await this.checkRateLimit();
      
      // Prepare request payload
      const payload = {
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.max_tokens ?? 2048,
        top_p: request.top_p ?? 0.9,
        frequency_penalty: request.frequency_penalty ?? 0,
        presence_penalty: request.presence_penalty ?? 0,
        stop: request.stop,
        stream: request.stream ?? false,
        user: request.user,
        ...request.metadata,
      };

      const startTime = Date.now();
      const response = await this.client.post('/v1/chat/completions', payload);
      const endTime = Date.now();

      // Log performance metrics
      logger.info('Chat completion successful', {
        model: request.model,
        promptTokens: response.data.usage.prompt_tokens,
        completionTokens: response.data.usage.completion_tokens,
        totalTokens: response.data.usage.total_tokens,
        duration: endTime - startTime,
        finishReason: response.data.choices[0]?.finish_reason,
      });

      return response.data;
    } catch (error) {
      logger.error('Chat completion failed', {
        model: request.model,
        error: error.message,
        messagesCount: request.messages.length,
      });
      throw this.handleApiError(error);
    }
  }

  /**
   * Generate embeddings for text
   */
  public async createEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    try {
      await this.checkRateLimit();
      
      const response = await this.client.post('/v1/embeddings', request);
      
      logger.info('Embedding generation successful', {
        model: request.model,
        inputLength: Array.isArray(request.input) ? request.input.length : 1,
        totalTokens: response.data.usage.total_tokens,
      });

      return response.data;
    } catch (error) {
      logger.error('Embedding generation failed', {
        model: request.model,
        error: error.message,
      });
      throw this.handleApiError(error);
    }
  }

  /**
   * List available models
   */
  public async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await this.client.get('/v1/models');
      return response.data.data;
    } catch (error) {
      logger.error('Failed to list models', error);
      throw this.handleApiError(error);
    }
  }

  /**
   * Get model information
   */
  public async getModel(modelId: string): Promise<ModelInfo> {
    try {
      const response = await this.client.get(`/v1/models/${modelId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get model info', { modelId, error: error.message });
      throw this.handleApiError(error);
    }
  }

  /**
   * Stream chat completion (for real-time responses)
   */
  public async streamChatCompletion(
    request: ChatCompletionRequest,
    onChunk: (chunk: any) => void,
    onComplete: (response: ChatCompletionResponse) => void,
    onError: (error: Error) => void
  ): Promise<void> {
    try {
      const payload = {
        ...request,
        stream: true,
      };

      const response = await this.client.post('/v1/chat/completions', payload, {
        responseType: 'stream',
      });

      let fullResponse = '';
      
      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              onComplete({
                id: 'stream_complete',
                object: 'chat.completion',
                created: Date.now(),
                model: request.model,
                choices: [{
                  index: 0,
                  message: { role: 'assistant', content: fullResponse },
                  finish_reason: 'stop',
                }],
                usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
              });
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content || '';
              fullResponse += content;
              onChunk(parsed);
            } catch (parseError) {
              logger.warn('Failed to parse streaming chunk', { data });
            }
          }
        }
      });

      response.data.on('error', onError);
      
    } catch (error) {
      onError(this.handleApiError(error));
    }
  }

  /**
   * Health check for NVIDIA API
   */
  public async healthCheck(): Promise<{ status: string; latency: number; models: number }> {
    const startTime = Date.now();
    
    try {
      const models = await this.listModels();
      const latency = Date.now() - startTime;
      
      return {
        status: 'healthy',
        latency,
        models: models.length,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: Date.now() - startTime,
        models: 0,
      };
    }
  }

  /**
   * Get client statistics
   */
  public getStats(): {
    requestCount: number;
    lastRequestTime: number;
    rateLimitRemaining: number;
    rateLimitReset: number;
  } {
    return {
      requestCount: this.requestCount,
      lastRequestTime: this.lastRequestTime,
      rateLimitRemaining: this.rateLimitRemaining,
      rateLimitReset: this.rateLimitReset,
    };
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  private validateChatRequest(request: ChatCompletionRequest): void {
    if (!request.model) {
      throw new Error('Model is required');
    }
    
    if (!request.messages || request.messages.length === 0) {
      throw new Error('Messages array cannot be empty');
    }
    
    if (request.max_tokens && request.max_tokens > 4096) {
      logger.warn('Max tokens exceeds recommended limit', { maxTokens: request.max_tokens });
    }
  }

  private async checkRateLimit(): Promise<void> {
    if (this.rateLimitRemaining <= 10) {
      const waitTime = Math.max(0, this.rateLimitReset * 1000 - Date.now());
      if (waitTime > 0) {
        logger.warn(`Rate limit low, waiting ${waitTime}ms`);
        await this.sleep(waitTime);
      }
    }
  }

  private shouldRetry(config: AxiosRequestConfig): boolean {
    const retryCount = config.retryCount || 0;
    return retryCount < this.config.maxRetries;
  }

  private calculateRetryDelay(retryCount: number): number {
    // Exponential backoff with jitter
    const baseDelay = this.config.retryDelay;
    const exponentialDelay = baseDelay * Math.pow(2, retryCount);
    const jitter = Math.random() * 1000;
    return Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds
  }

  private handleApiError(error: any): Error {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      switch (status) {
        case 400:
          return new Error(`Bad Request: ${data.error?.message || 'Invalid request'}`);
        case 401:
          return new Error('Unauthorized: Invalid API key');
        case 403:
          return new Error('Forbidden: Access denied');
        case 404:
          return new Error('Not Found: Model or endpoint not found');
        case 429:
          return new Error('Rate Limited: Too many requests');
        case 500:
          return new Error('Internal Server Error: NVIDIA API error');
        case 503:
          return new Error('Service Unavailable: NVIDIA API temporarily unavailable');
        default:
          return new Error(`API Error ${status}: ${data.error?.message || 'Unknown error'}`);
      }
    }
    
    if (error.code === 'ECONNABORTED') {
      return new Error('Request Timeout: NVIDIA API did not respond in time');
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return new Error('Connection Error: Cannot reach NVIDIA API');
    }
    
    return new Error(`Network Error: ${error.message}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

export function createNvidiaClient(config?: Partial<NvidiaConfig>): NvidiaClient {
  const defaultConfig: NvidiaConfig = {
    apiKey: process.env['NVIDIA_API_KEY'] || '',
    baseUrl: process.env['NVIDIA_API_BASE_URL'] || 'https://integrate.api.nvidia.com',
    timeout: 90000, // 90 seconds for complex requests
    maxRetries: 5, // More retries for reliability
    retryDelay: 2000, // 2 seconds base delay
  };

  if (!defaultConfig.apiKey) {
    throw new Error('NVIDIA_API_KEY environment variable is required');
  }

  return new NvidiaClient({ ...defaultConfig, ...config });
}

export default NvidiaClient;
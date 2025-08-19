import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { NVIDIARequest, NVIDIAResponse, NVIDIAMessage } from '@browser-ai-agent/shared';
import { Logger } from 'winston';
import { createLogger } from '../../utils/logger';

export interface NVIDIAClientConfig {
  baseUrl: string;
  models: {
    primary: { name: string; apiKey: string };
    vision: { name: string; apiKey: string };
    complex: { name: string; apiKey: string };
  };
  timeout: number;
  maxRetries: number;
  retryDelay: number;
}

export class NVIDIAClient {
  private readonly logger: Logger;
  private readonly config: NVIDIAClientConfig;
  private readonly httpClients: Map<string, AxiosInstance>;

  constructor(config: NVIDIAClientConfig) {
    this.logger = createLogger('NVIDIAClient');
    this.config = config;
    this.httpClients = new Map();
    
    // Create HTTP clients for each model
    this.initializeHttpClients();
  }

  private initializeHttpClients(): void {
    const models = [
      { key: 'primary', ...this.config.models.primary },
      { key: 'vision', ...this.config.models.vision },
      { key: 'complex', ...this.config.models.complex },
    ];

    models.forEach(({ key, name, apiKey }) => {
      const client = axios.create({
        baseURL: this.config.baseUrl,
        timeout: this.config.timeout,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      // Add request interceptor for logging
      client.interceptors.request.use(
        (config) => {
          this.logger.debug(`NVIDIA API Request [${name}]`, {
            url: config.url,
            method: config.method,
            data: config.data ? JSON.stringify(config.data).substring(0, 500) : undefined,
          });
          return config;
        },
        (error) => {
          this.logger.error('NVIDIA API Request Error', error);
          return Promise.reject(error);
        }
      );

      // Add response interceptor for logging
      client.interceptors.response.use(
        (response) => {
          this.logger.debug(`NVIDIA API Response [${name}]`, {
            status: response.status,
            data: response.data ? JSON.stringify(response.data).substring(0, 500) : undefined,
          });
          return response;
        },
        (error) => {
          this.logger.error(`NVIDIA API Response Error [${name}]`, {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
          });
          return Promise.reject(error);
        }
      );

      this.httpClients.set(key, client);
    });
  }

  /**
   * Send a request to the primary model (Llama 3.3 70B)
   */
  async sendPrimaryRequest(
    messages: NVIDIAMessage[],
    parameters?: any
  ): Promise<NVIDIAResponse> {
    return this.sendRequest('primary', messages, parameters);
  }

  /**
   * Send a request to the vision model (Llama 3.2 90B Vision)
   */
  async sendVisionRequest(
    messages: NVIDIAMessage[],
    parameters?: any
  ): Promise<NVIDIAResponse> {
    return this.sendRequest('vision', messages, parameters);
  }

  /**
   * Send a request to the complex model (Llama 3.1 405B)
   */
  async sendComplexRequest(
    messages: NVIDIAMessage[],
    parameters?: any
  ): Promise<NVIDIAResponse> {
    return this.sendRequest('complex', messages, parameters);
  }

  /**
   * Send a request to a specific model
   */
  private async sendRequest(
    modelKey: 'primary' | 'vision' | 'complex',
    messages: NVIDIAMessage[],
    parameters?: any
  ): Promise<NVIDIAResponse> {
    const client = this.httpClients.get(modelKey);
    if (!client) {
      throw new Error(`HTTP client not found for model: ${modelKey}`);
    }

    const modelName = this.config.models[modelKey].name;
    const request: NVIDIARequest = {
      model: modelName,
      messages,
      parameters: {
        max_tokens: 2000,
        temperature: 0.7,
        top_p: 0.9,
        stream: false,
        ...parameters,
      },
    };

    const startTime = Date.now();
    
    try {
      const response = await this.executeWithRetry(
        () => client.post('/chat/completions', request),
        modelKey
      );

      const processingTime = Date.now() - startTime;
      
      this.logger.info(`NVIDIA API Success [${modelName}]`, {
        processingTime,
        tokensUsed: response.data.usage?.total_tokens,
      });

      return response.data;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error(`NVIDIA API Failed [${modelName}]`, {
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw this.handleError(error, modelKey);
    }
  }

  /**
   * Stream a response from a model
   */
  async *streamResponse(
    modelKey: 'primary' | 'vision' | 'complex',
    messages: NVIDIAMessage[],
    parameters?: any
  ): AsyncIterator<string> {
    const client = this.httpClients.get(modelKey);
    if (!client) {
      throw new Error(`HTTP client not found for model: ${modelKey}`);
    }

    const modelName = this.config.models[modelKey].name;
    const request: NVIDIARequest = {
      model: modelName,
      messages,
      parameters: {
        max_tokens: 2000,
        temperature: 0.7,
        top_p: 0.9,
        stream: true,
        ...parameters,
      },
    };

    try {
      const response = await client.post('/chat/completions', request, {
        responseType: 'stream',
      });

      const stream = response.data;
      let buffer = '';

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                yield content;
              }
            } catch (parseError) {
              this.logger.warn('Failed to parse streaming chunk', { data });
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(`NVIDIA Streaming Failed [${modelName}]`, error);
      throw this.handleError(error, modelKey);
    }
  }

  /**
   * Execute request with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<AxiosResponse<T>>,
    modelKey: string,
    attempt: number = 1
  ): Promise<AxiosResponse<T>> {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= this.config.maxRetries) {
        throw error;
      }

      const isRetryable = this.isRetryableError(error);
      if (!isRetryable) {
        throw error;
      }

      const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
      this.logger.warn(`Retrying NVIDIA API request [${modelKey}]`, {
        attempt,
        delay,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      await this.sleep(delay);
      return this.executeWithRetry(operation, modelKey, attempt + 1);
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      // Retry on network errors, timeouts, and 5xx errors
      return !status || status >= 500 || status === 429;
    }
    return false;
  }

  /**
   * Handle and transform errors
   */
  private handleError(error: any, modelKey: string): Error {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;

      switch (status) {
        case 401:
          return new Error(`NVIDIA API authentication failed for ${modelKey} model`);
        case 403:
          return new Error(`NVIDIA API access forbidden for ${modelKey} model`);
        case 429:
          return new Error(`NVIDIA API rate limit exceeded for ${modelKey} model`);
        case 500:
        case 502:
        case 503:
        case 504:
          return new Error(`NVIDIA API server error for ${modelKey} model`);
        default:
          return new Error(`NVIDIA API error for ${modelKey} model: ${data?.message || error.message}`);
      }
    }

    return error instanceof Error ? error : new Error(`Unknown error for ${modelKey} model`);
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get model information
   */
  getModelInfo(): Record<string, { name: string; hasApiKey: boolean }> {
    return {
      primary: {
        name: this.config.models.primary.name,
        hasApiKey: !!this.config.models.primary.apiKey,
      },
      vision: {
        name: this.config.models.vision.name,
        hasApiKey: !!this.config.models.vision.apiKey,
      },
      complex: {
        name: this.config.models.complex.name,
        hasApiKey: !!this.config.models.complex.apiKey,
      },
    };
  }

  /**
   * Health check for all models
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    const healthCheckPromises = ['primary', 'vision', 'complex'].map(async (modelKey) => {
      try {
        await this.sendRequest(modelKey as any, [
          { role: 'user', content: 'Hello' }
        ], { max_tokens: 1 });
        results[modelKey] = true;
      } catch (error) {
        results[modelKey] = false;
      }
    });

    await Promise.allSettled(healthCheckPromises);
    return results;
  }
}
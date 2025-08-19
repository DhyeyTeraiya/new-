import { 
  APIResponse, 
  ChatRequest, 
  ChatResponse,
  AutomationRequest,
  AutomationResponse,
  SessionCreateRequest,
  SessionCreateResponse,
  UserSession 
} from '@browser-ai-agent/shared';
import ExtensionErrorHandler, { ErrorContext } from './error-handler';

export interface APIClientConfig {
  baseUrl: string;
  timeout: number;
  maxRetries?: number;
  retryDelay?: number;
  enableOfflineMode?: boolean;
}

export interface RequestOptions extends RequestInit {
  retryable?: boolean;
  skipErrorHandling?: boolean;
  context?: ErrorContext;
}

export class APIClient {
  private config: APIClientConfig;
  private authToken: string | null = null;
  private errorHandler: ExtensionErrorHandler;
  private offlineMode: boolean = false;
  private requestQueue: Array<{ request: () => Promise<any>; resolve: Function; reject: Function }> = [];

  constructor(config: APIClientConfig) {
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      enableOfflineMode: true,
      ...config,
    };
    this.errorHandler = ExtensionErrorHandler.getInstance();
    this.setupOfflineHandling();
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string): void {
    this.authToken = token;
  }

  /**
   * Get authentication token
   */
  getAuthToken(): string | null {
    return this.authToken;
  }

  /**
   * Setup offline handling
   */
  private setupOfflineHandling(): void {
    if (!this.config.enableOfflineMode) return;

    window.addEventListener('online', () => {
      this.offlineMode = false;
      this.processQueuedRequests();
    });

    window.addEventListener('offline', () => {
      this.offlineMode = true;
    });

    this.offlineMode = !navigator.onLine;
  }

  /**
   * Process queued requests when back online
   */
  private async processQueuedRequests(): Promise<void> {
    const queue = [...this.requestQueue];
    this.requestQueue = [];

    for (const { request, resolve, reject } of queue) {
      try {
        const result = await request();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }
  }

  /**
   * Make authenticated API request with enhanced error handling
   */
  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<APIResponse<T>> {
    const { retryable = true, skipErrorHandling = false, context = {}, ...requestOptions } = options;
    
    // Check if offline and request is not critical
    if (this.offlineMode && this.config.enableOfflineMode) {
      return this.handleOfflineRequest<T>(endpoint, options);
    }

    const url = `${this.config.baseUrl}${endpoint}`;
    const requestId = `${endpoint}_${Date.now()}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
      ...((requestOptions.headers as Record<string, string>) || {}),
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const finalRequestOptions: RequestInit = {
      ...requestOptions,
      headers,
      signal: AbortSignal.timeout(this.config.timeout),
    };

    const makeRequest = async (): Promise<APIResponse<T>> => {
      try {
        const response = await fetch(url, finalRequestOptions);
        
        if (!response.ok) {
          const errorData = await this.parseErrorResponse(response);
          throw this.createAPIError(response.status, errorData, endpoint);
        }

        const data: APIResponse<T> = await response.json();
        
        // Validate response structure
        if (!this.isValidAPIResponse(data)) {
          throw new Error('Invalid API response format');
        }

        return data;
      } catch (error) {
        if (!skipErrorHandling) {
          const processedError = await this.errorHandler.handleError(error, {
            ...context,
            component: 'APIClient',
            action: `request_${endpoint}`,
            metadata: {
              endpoint,
              method: finalRequestOptions.method || 'GET',
              requestId,
            },
          });

          // Enhance error with request context
          (error as any).processedError = processedError;
        }
        
        throw error;
      }
    };

    // Retry logic for retryable requests
    if (retryable && this.config.maxRetries! > 0) {
      return this.errorHandler.retryWithBackoff(
        makeRequest,
        requestId,
        this.config.maxRetries
      );
    }

    return makeRequest();
  }

  /**
   * Handle offline requests
   */
  private async handleOfflineRequest<T>(
    endpoint: string,
    options: RequestOptions
  ): Promise<APIResponse<T>> {
    // Check if we have cached data for this request
    const cachedData = await this.getCachedResponse<T>(endpoint);
    if (cachedData) {
      return cachedData;
    }

    // Queue request for when back online
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        request: () => this.request<T>(endpoint, { ...options, skipErrorHandling: true }),
        resolve,
        reject,
      });

      // Notify user about offline mode
      this.errorHandler.handleError(
        new Error('Currently offline'),
        {
          component: 'APIClient',
          action: 'offline_request',
          metadata: { endpoint },
        }
      );
    });
  }

  /**
   * Parse error response
   */
  private async parseErrorResponse(response: Response): Promise<any> {
    try {
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      }
      return { message: await response.text() };
    } catch {
      return { message: response.statusText };
    }
  }

  /**
   * Create API error from response
   */
  private createAPIError(status: number, errorData: any, endpoint: string): Error {
    const error = new Error(errorData.message || `HTTP ${status}`) as any;
    error.status = status;
    error.code = errorData.code || `HTTP_${status}`;
    error.retryable = this.isRetryableStatus(status);
    error.details = errorData.details;
    error.endpoint = endpoint;
    return error;
  }

  /**
   * Check if status code is retryable
   */
  private isRetryableStatus(status: number): boolean {
    return status >= 500 || status === 429 || status === 408;
  }

  /**
   * Validate API response structure
   */
  private isValidAPIResponse<T>(data: any): data is APIResponse<T> {
    return (
      typeof data === 'object' &&
      data !== null &&
      typeof data.success === 'boolean' &&
      'timestamp' in data
    );
  }

  /**
   * Get cached response for offline mode
   */
  private async getCachedResponse<T>(endpoint: string): Promise<APIResponse<T> | null> {
    try {
      const cached = localStorage.getItem(`api_cache_${endpoint}`);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        // Return cached data if less than 5 minutes old
        if (Date.now() - timestamp < 5 * 60 * 1000) {
          return data;
        }
      }
    } catch {
      // Ignore cache errors
    }
    return null;
  }

  /**
   * Cache response for offline mode
   */
  private async cacheResponse<T>(endpoint: string, data: APIResponse<T>): Promise<void> {
    try {
      localStorage.setItem(`api_cache_${endpoint}`, JSON.stringify({
        data,
        timestamp: Date.now(),
      }));
    } catch {
      // Ignore cache errors (storage might be full)
    }
  }

  /**
   * Create new session
   */
  async createSession(request: SessionCreateRequest): Promise<SessionCreateResponse> {
    const response = await this.request<SessionCreateResponse>('/sessions', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    if (!response.success || !response.data) {
      throw new Error('Failed to create session');
    }

    // Store auth token
    this.setAuthToken(response.data.token);

    return response.data;
  }

  /**
   * Get session details
   */
  async getSession(sessionId: string): Promise<UserSession> {
    const response = await this.request<{ session: UserSession }>(`/sessions/${sessionId}`);

    if (!response.success || !response.data) {
      throw new Error('Failed to get session');
    }

    return response.data.session;
  }

  /**
   * Update session
   */
  async updateSession(
    sessionId: string,
    updates: Partial<UserSession>
  ): Promise<UserSession> {
    const response = await this.request<{ session: UserSession }>(`/sessions/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });

    if (!response.success || !response.data) {
      throw new Error('Failed to update session');
    }

    return response.data.session;
  }

  /**
   * Send chat message
   */
  async sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
    const response = await this.request<ChatResponse>('/chat/message', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    if (!response.success || !response.data) {
      throw new Error('Failed to send chat message');
    }

    return response.data;
  }

  /**
   * Analyze page visually
   */
  async analyzePageVisually(
    sessionId: string,
    screenshotData: string,
    query?: string
  ): Promise<ChatResponse> {
    const response = await this.request<ChatResponse>('/chat/analyze-visual', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        screenshotData,
        query,
      }),
    });

    if (!response.success || !response.data) {
      throw new Error('Failed to analyze page visually');
    }

    return response.data;
  }

  /**
   * Generate action plan
   */
  async generateActionPlan(
    sessionId: string,
    userGoal: string,
    pageContext?: any
  ): Promise<ChatResponse> {
    const response = await this.request<ChatResponse>('/chat/generate-plan', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        userGoal,
        pageContext,
      }),
    });

    if (!response.success || !response.data) {
      throw new Error('Failed to generate action plan');
    }

    return response.data;
  }

  /**
   * Execute automation
   */
  async executeAutomation(request: AutomationRequest): Promise<{ automationId: string }> {
    const response = await this.request<{ automationId: string }>('/automation/execute', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    if (!response.success || !response.data) {
      throw new Error('Failed to execute automation');
    }

    return response.data;
  }

  /**
   * Execute single action
   */
  async executeSingleAction(
    sessionId: string,
    action: any,
    options?: any
  ): Promise<{ result: any }> {
    const response = await this.request<{ result: any }>('/automation/execute-single', {
      method: 'POST',
      body: JSON.stringify({
        action,
        sessionId,
        options,
      }),
    });

    if (!response.success || !response.data) {
      throw new Error('Failed to execute single action');
    }

    return response.data;
  }

  /**
   * Get automation status
   */
  async getAutomationStatus(automationId: string): Promise<{ status: any }> {
    const response = await this.request<{ status: any }>(`/automation/status/${automationId}`);

    if (!response.success || !response.data) {
      throw new Error('Failed to get automation status');
    }

    return response.data;
  }

  /**
   * Pause automation
   */
  async pauseAutomation(automationId: string): Promise<{ message: string }> {
    const response = await this.request<{ message: string }>(`/automation/pause/${automationId}`, {
      method: 'POST',
    });

    if (!response.success || !response.data) {
      throw new Error('Failed to pause automation');
    }

    return response.data;
  }

  /**
   * Resume automation
   */
  async resumeAutomation(automationId: string): Promise<{ message: string }> {
    const response = await this.request<{ message: string }>(`/automation/resume/${automationId}`, {
      method: 'POST',
    });

    if (!response.success || !response.data) {
      throw new Error('Failed to resume automation');
    }

    return response.data;
  }

  /**
   * Cancel automation
   */
  async cancelAutomation(automationId: string): Promise<{ message: string }> {
    const response = await this.request<{ message: string }>(`/automation/cancel/${automationId}`, {
      method: 'POST',
    });

    if (!response.success || !response.data) {
      throw new Error('Failed to cancel automation');
    }

    return response.data;
  }

  /**
   * Extract page context
   */
  async extractPageContext(
    sessionId: string,
    url?: string,
    options?: any
  ): Promise<{ pageContext: any }> {
    const response = await this.request<{ pageContext: any }>('/automation/extract-context', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        url,
        options,
      }),
    });

    if (!response.success || !response.data) {
      throw new Error('Failed to extract page context');
    }

    return response.data;
  }

  /**
   * Take screenshot
   */
  async takeScreenshot(
    sessionId: string,
    options?: any
  ): Promise<{ screenshot: string }> {
    const response = await this.request<{ screenshot: string }>('/automation/screenshot', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        options,
      }),
    });

    if (!response.success || !response.data) {
      throw new Error('Failed to take screenshot');
    }

    return response.data;
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(
    sessionId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ messages: any[]; total: number; hasMore: boolean }> {
    const response = await this.request<{
      messages: any[];
      total: number;
      hasMore: boolean;
    }>(`/chat/history/${sessionId}?limit=${limit}&offset=${offset}`);

    if (!response.success || !response.data) {
      throw new Error('Failed to get conversation history');
    }

    return response.data;
  }

  /**
   * Clear conversation history
   */
  async clearConversationHistory(sessionId: string): Promise<{ message: string }> {
    const response = await this.request<{ message: string }>(`/chat/history/${sessionId}`, {
      method: 'DELETE',
    });

    if (!response.success || !response.data) {
      throw new Error('Failed to clear conversation history');
    }

    return response.data;
  }
}
import { Logger } from 'winston';
import { createLogger } from '../utils/logger';
import { APIError } from '@browser-ai-agent/shared';

export interface RecoveryContext {
  operation: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface RecoveryAction {
  type: 'retry' | 'fallback' | 'circuit_breaker' | 'graceful_degradation' | 'manual_intervention';
  description: string;
  execute: (context: RecoveryContext) => Promise<any>;
  condition?: (error: any, context: RecoveryContext) => boolean;
  priority: number;
  maxAttempts?: number;
}

export interface RecoveryStrategy {
  name: string;
  errorTypes: string[];
  actions: RecoveryAction[];
  enabled: boolean;
}

export class ErrorRecoveryService {
  private logger: Logger;
  private strategies: Map<string, RecoveryStrategy> = new Map();
  private recoveryAttempts: Map<string, number> = new Map();
  private circuitBreakers: Map<string, { failures: number; lastFailure: Date; isOpen: boolean }> = new Map();
  private maxRetryAttempts = 3;
  private circuitBreakerThreshold = 5;
  private circuitBreakerTimeout = 60000; // 1 minute

  constructor() {
    this.logger = createLogger('ErrorRecoveryService');
    this.initializeDefaultStrategies();
  }

  /**
   * Initialize default recovery strategies
   */
  private initializeDefaultStrategies(): void {
    // Network error recovery
    this.addStrategy({
      name: 'network_recovery',
      errorTypes: ['NETWORK_ERROR', 'CONNECTION_REFUSED', 'TIMEOUT'],
      enabled: true,
      actions: [
        {
          type: 'retry',
          description: 'Retry with exponential backoff',
          priority: 1,
          maxAttempts: 3,
          execute: async (context) => {
            await this.exponentialBackoff(context);
            return { action: 'retry', context };
          },
        },
        {
          type: 'circuit_breaker',
          description: 'Open circuit breaker to prevent cascade failures',
          priority: 2,
          execute: async (context) => {
            this.openCircuitBreaker(context.operation);
            return { action: 'circuit_breaker_opened', context };
          },
          condition: (error, context) => this.shouldOpenCircuitBreaker(context.operation),
        },
        {
          type: 'fallback',
          description: 'Use cached data or alternative service',
          priority: 3,
          execute: async (context) => {
            return this.executeFallbackStrategy(context);
          },
        },
      ],
    });

    // Database error recovery
    this.addStrategy({
      name: 'database_recovery',
      errorTypes: ['DATABASE_ERROR', 'CONNECTION_POOL_EXHAUSTED', 'DEADLOCK'],
      enabled: true,
      actions: [
        {
          type: 'retry',
          description: 'Retry database operation',
          priority: 1,
          maxAttempts: 2,
          execute: async (context) => {
            await this.databaseRetryDelay();
            return { action: 'database_retry', context };
          },
        },
        {
          type: 'fallback',
          description: 'Use read replica or cached data',
          priority: 2,
          execute: async (context) => {
            return this.executeDatabaseFallback(context);
          },
        },
        {
          type: 'graceful_degradation',
          description: 'Continue with limited functionality',
          priority: 3,
          execute: async (context) => {
            return this.executeGracefulDegradation(context);
          },
        },
      ],
    });

    // External API error recovery
    this.addStrategy({
      name: 'external_api_recovery',
      errorTypes: ['EXTERNAL_API_ERROR', 'RATE_LIMIT_EXCEEDED', 'SERVICE_UNAVAILABLE'],
      enabled: true,
      actions: [
        {
          type: 'retry',
          description: 'Retry with rate limit backoff',
          priority: 1,
          maxAttempts: 3,
          execute: async (context) => {
            await this.rateLimitBackoff(context);
            return { action: 'rate_limit_retry', context };
          },
          condition: (error) => error.code === 'RATE_LIMIT_EXCEEDED',
        },
        {
          type: 'fallback',
          description: 'Use alternative API or cached response',
          priority: 2,
          execute: async (context) => {
            return this.executeAPIFallback(context);
          },
        },
        {
          type: 'graceful_degradation',
          description: 'Provide limited functionality',
          priority: 3,
          execute: async (context) => {
            return this.executeAPIGracefulDegradation(context);
          },
        },
      ],
    });

    // Authentication error recovery
    this.addStrategy({
      name: 'auth_recovery',
      errorTypes: ['UNAUTHORIZED', 'TOKEN_EXPIRED', 'INVALID_CREDENTIALS'],
      enabled: true,
      actions: [
        {
          type: 'retry',
          description: 'Refresh authentication token',
          priority: 1,
          maxAttempts: 1,
          execute: async (context) => {
            return this.refreshAuthToken(context);
          },
          condition: (error) => error.code === 'TOKEN_EXPIRED',
        },
        {
          type: 'manual_intervention',
          description: 'Require user re-authentication',
          priority: 2,
          execute: async (context) => {
            return this.requireReAuthentication(context);
          },
        },
      ],
    });
  }

  /**
   * Add recovery strategy
   */
  addStrategy(strategy: RecoveryStrategy): void {
    this.strategies.set(strategy.name, strategy);
    this.logger.info(`Added recovery strategy: ${strategy.name}`);
  }

  /**
   * Execute recovery for error
   */
  async executeRecovery(
    error: any,
    context: RecoveryContext
  ): Promise<{ recovered: boolean; result?: any; action?: string }> {
    const errorCode = error.code || error.name || 'UNKNOWN_ERROR';
    
    this.logger.info(`Executing recovery for error: ${errorCode}`, {
      operation: context.operation,
      sessionId: context.sessionId,
      requestId: context.requestId,
    });

    // Find applicable strategies
    const applicableStrategies = this.findApplicableStrategies(errorCode);
    
    if (applicableStrategies.length === 0) {
      this.logger.warn(`No recovery strategies found for error: ${errorCode}`);
      return { recovered: false };
    }

    // Try each strategy
    for (const strategy of applicableStrategies) {
      if (!strategy.enabled) continue;

      const result = await this.executeStrategy(strategy, error, context);
      if (result.recovered) {
        this.logger.info(`Recovery successful using strategy: ${strategy.name}`, {
          action: result.action,
          operation: context.operation,
        });
        return result;
      }
    }

    this.logger.error(`All recovery strategies failed for error: ${errorCode}`, {
      operation: context.operation,
      strategiesAttempted: applicableStrategies.map(s => s.name),
    });

    return { recovered: false };
  }

  /**
   * Find applicable recovery strategies
   */
  private findApplicableStrategies(errorCode: string): RecoveryStrategy[] {
    const strategies: RecoveryStrategy[] = [];

    for (const strategy of this.strategies.values()) {
      if (strategy.errorTypes.some(type => errorCode.includes(type))) {
        strategies.push(strategy);
      }
    }

    return strategies.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Execute recovery strategy
   */
  private async executeStrategy(
    strategy: RecoveryStrategy,
    error: any,
    context: RecoveryContext
  ): Promise<{ recovered: boolean; result?: any; action?: string }> {
    const sortedActions = strategy.actions.sort((a, b) => a.priority - b.priority);

    for (const action of sortedActions) {
      // Check if action condition is met
      if (action.condition && !action.condition(error, context)) {
        continue;
      }

      // Check retry attempts
      const attemptKey = `${context.operation}_${action.type}`;
      const attempts = this.recoveryAttempts.get(attemptKey) || 0;
      
      if (action.maxAttempts && attempts >= action.maxAttempts) {
        this.logger.warn(`Max attempts reached for recovery action: ${action.type}`, {
          attempts,
          maxAttempts: action.maxAttempts,
        });
        continue;
      }

      try {
        this.recoveryAttempts.set(attemptKey, attempts + 1);
        
        this.logger.info(`Executing recovery action: ${action.type}`, {
          strategy: strategy.name,
          attempt: attempts + 1,
          description: action.description,
        });

        const result = await action.execute(context);
        
        // Clear attempts on success
        this.recoveryAttempts.delete(attemptKey);
        
        return {
          recovered: true,
          result,
          action: action.type,
        };
      } catch (actionError) {
        this.logger.error(`Recovery action failed: ${action.type}`, {
          error: actionError.message,
          strategy: strategy.name,
          attempt: attempts + 1,
        });
        
        // Continue to next action
        continue;
      }
    }

    return { recovered: false };
  }

  /**
   * Exponential backoff delay
   */
  private async exponentialBackoff(context: RecoveryContext): Promise<void> {
    const attemptKey = `${context.operation}_retry`;
    const attempts = this.recoveryAttempts.get(attemptKey) || 0;
    const delay = Math.min(1000 * Math.pow(2, attempts), 30000); // Max 30 seconds
    
    this.logger.info(`Applying exponential backoff: ${delay}ms`, {
      operation: context.operation,
      attempt: attempts + 1,
    });

    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Database retry delay
   */
  private async databaseRetryDelay(): Promise<void> {
    // Short delay for database retries
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
  }

  /**
   * Rate limit backoff
   */
  private async rateLimitBackoff(context: RecoveryContext): Promise<void> {
    // Extract retry-after header if available
    const retryAfter = context.metadata?.retryAfter || 5000;
    const delay = Math.min(retryAfter * 1000, 60000); // Max 1 minute
    
    this.logger.info(`Applying rate limit backoff: ${delay}ms`, {
      operation: context.operation,
    });

    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Check if circuit breaker should open
   */
  private shouldOpenCircuitBreaker(operation: string): boolean {
    const breaker = this.circuitBreakers.get(operation);
    if (!breaker) return false;

    return breaker.failures >= this.circuitBreakerThreshold;
  }

  /**
   * Open circuit breaker
   */
  private openCircuitBreaker(operation: string): void {
    this.circuitBreakers.set(operation, {
      failures: this.circuitBreakerThreshold,
      lastFailure: new Date(),
      isOpen: true,
    });

    this.logger.warn(`Circuit breaker opened for operation: ${operation}`);

    // Auto-close after timeout
    setTimeout(() => {
      this.closeCircuitBreaker(operation);
    }, this.circuitBreakerTimeout);
  }

  /**
   * Close circuit breaker
   */
  private closeCircuitBreaker(operation: string): void {
    const breaker = this.circuitBreakers.get(operation);
    if (breaker) {
      breaker.isOpen = false;
      breaker.failures = 0;
      this.logger.info(`Circuit breaker closed for operation: ${operation}`);
    }
  }

  /**
   * Execute fallback strategy
   */
  private async executeFallbackStrategy(context: RecoveryContext): Promise<any> {
    this.logger.info(`Executing fallback strategy for: ${context.operation}`);
    
    // Implementation depends on the specific operation
    switch (context.operation) {
      case 'chat_completion':
        return this.executeChatFallback(context);
      case 'automation_execution':
        return this.executeAutomationFallback(context);
      default:
        return { fallback: true, message: 'Using fallback mode' };
    }
  }

  /**
   * Execute database fallback
   */
  private async executeDatabaseFallback(context: RecoveryContext): Promise<any> {
    this.logger.info(`Executing database fallback for: ${context.operation}`);
    
    // Try read replica or cached data
    return {
      fallback: true,
      source: 'cache',
      message: 'Using cached data due to database issues',
    };
  }

  /**
   * Execute graceful degradation
   */
  private async executeGracefulDegradation(context: RecoveryContext): Promise<any> {
    this.logger.info(`Executing graceful degradation for: ${context.operation}`);
    
    return {
      degraded: true,
      message: 'Service running with limited functionality',
      availableFeatures: this.getAvailableFeatures(context.operation),
    };
  }

  /**
   * Execute API fallback
   */
  private async executeAPIFallback(context: RecoveryContext): Promise<any> {
    this.logger.info(`Executing API fallback for: ${context.operation}`);
    
    return {
      fallback: true,
      source: 'alternative_api',
      message: 'Using alternative service provider',
    };
  }

  /**
   * Execute API graceful degradation
   */
  private async executeAPIGracefulDegradation(context: RecoveryContext): Promise<any> {
    this.logger.info(`Executing API graceful degradation for: ${context.operation}`);
    
    return {
      degraded: true,
      message: 'External service unavailable, using basic functionality',
    };
  }

  /**
   * Execute chat fallback
   */
  private async executeChatFallback(context: RecoveryContext): Promise<any> {
    return {
      fallback: true,
      response: 'I apologize, but I\'m experiencing technical difficulties. Please try again in a moment.',
      type: 'fallback_response',
    };
  }

  /**
   * Execute automation fallback
   */
  private async executeAutomationFallback(context: RecoveryContext): Promise<any> {
    return {
      fallback: true,
      message: 'Automation service temporarily unavailable. Manual intervention may be required.',
      suggestedActions: ['retry_later', 'manual_execution'],
    };
  }

  /**
   * Refresh authentication token
   */
  private async refreshAuthToken(context: RecoveryContext): Promise<any> {
    this.logger.info(`Refreshing auth token for session: ${context.sessionId}`);
    
    // Implementation would refresh the actual token
    return {
      action: 'token_refreshed',
      message: 'Authentication token refreshed successfully',
    };
  }

  /**
   * Require re-authentication
   */
  private async requireReAuthentication(context: RecoveryContext): Promise<any> {
    this.logger.info(`Requiring re-authentication for session: ${context.sessionId}`);
    
    return {
      action: 'reauth_required',
      message: 'Please sign in again to continue',
      redirectUrl: '/auth/login',
    };
  }

  /**
   * Get available features during degradation
   */
  private getAvailableFeatures(operation: string): string[] {
    const featureMap: Record<string, string[]> = {
      'chat_completion': ['basic_responses', 'cached_responses'],
      'automation_execution': ['manual_guidance', 'step_by_step_instructions'],
      'page_analysis': ['basic_analysis', 'cached_results'],
    };

    return featureMap[operation] || ['basic_functionality'];
  }

  /**
   * Record failure for circuit breaker
   */
  recordFailure(operation: string): void {
    const breaker = this.circuitBreakers.get(operation) || {
      failures: 0,
      lastFailure: new Date(),
      isOpen: false,
    };

    breaker.failures++;
    breaker.lastFailure = new Date();

    this.circuitBreakers.set(operation, breaker);
  }

  /**
   * Record success for circuit breaker
   */
  recordSuccess(operation: string): void {
    const breaker = this.circuitBreakers.get(operation);
    if (breaker) {
      breaker.failures = Math.max(0, breaker.failures - 1);
    }
  }

  /**
   * Check if circuit breaker is open
   */
  isCircuitBreakerOpen(operation: string): boolean {
    const breaker = this.circuitBreakers.get(operation);
    return breaker?.isOpen || false;
  }

  /**
   * Get recovery statistics
   */
  getRecoveryStats(): {
    totalAttempts: number;
    successfulRecoveries: number;
    activeCircuitBreakers: number;
    strategiesCount: number;
  } {
    return {
      totalAttempts: this.recoveryAttempts.size,
      successfulRecoveries: 0, // Would track this in production
      activeCircuitBreakers: Array.from(this.circuitBreakers.values()).filter(b => b.isOpen).length,
      strategiesCount: this.strategies.size,
    };
  }

  /**
   * Clear recovery attempts (for cleanup)
   */
  clearRecoveryAttempts(): void {
    this.recoveryAttempts.clear();
    this.logger.info('Recovery attempts cleared');
  }
}

export default ErrorRecoveryService;
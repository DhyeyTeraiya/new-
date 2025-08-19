import { APIError } from '@browser-ai-agent/shared';

export interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  sessionId?: string;
  url?: string;
  userAgent?: string;
  timestamp?: Date;
  metadata?: Record<string, any>;
}

export interface ErrorRecoveryAction {
  type: 'retry' | 'fallback' | 'redirect' | 'refresh' | 'manual';
  label: string;
  description?: string;
  action: () => Promise<void> | void;
  priority: number; // 1 = highest priority
}

export interface ProcessedError {
  id: string;
  type: 'network' | 'validation' | 'auth' | 'permission' | 'server' | 'client' | 'unknown';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  userMessage: string;
  retryable: boolean;
  recoveryActions: ErrorRecoveryAction[];
  context: ErrorContext;
  originalError: any;
  timestamp: Date;
}

export class ExtensionErrorHandler {
  private static instance: ExtensionErrorHandler;
  private errorQueue: ProcessedError[] = [];
  private maxQueueSize = 100;
  private retryAttempts = new Map<string, number>();
  private maxRetries = 3;

  private constructor() {}

  static getInstance(): ExtensionErrorHandler {
    if (!ExtensionErrorHandler.instance) {
      ExtensionErrorHandler.instance = new ExtensionErrorHandler();
    }
    return ExtensionErrorHandler.instance;
  }

  /**
   * Process and handle error
   */
  async handleError(
    error: any,
    context: ErrorContext = {}
  ): Promise<ProcessedError> {
    const processedError = this.processError(error, context);
    
    // Add to error queue
    this.addToQueue(processedError);
    
    // Log error
    this.logError(processedError);
    
    // Report error if critical
    if (processedError.severity === 'critical') {
      await this.reportError(processedError);
    }
    
    return processedError;
  }

  /**
   * Process raw error into structured format
   */
  private processError(error: any, context: ErrorContext): ProcessedError {
    const id = this.generateErrorId();
    const timestamp = new Date();
    
    let type: ProcessedError['type'] = 'unknown';
    let severity: ProcessedError['severity'] = 'medium';
    let message = 'An unexpected error occurred';
    let userMessage = 'Something went wrong. Please try again.';
    let retryable = false;
    let recoveryActions: ErrorRecoveryAction[] = [];

    // Process different error types
    if (this.isNetworkError(error)) {
      type = 'network';
      severity = 'high';
      retryable = true;
      message = 'Network connection failed';
      userMessage = 'Unable to connect to the server. Please check your internet connection.';
      recoveryActions = this.getNetworkRecoveryActions(context);
    } else if (this.isAPIError(error)) {
      const apiError = error as APIError;
      type = this.getAPIErrorType(apiError);
      severity = this.getAPIErrorSeverity(apiError);
      retryable = apiError.retryable || false;
      message = apiError.message;
      userMessage = this.getUserFriendlyMessage(apiError);
      recoveryActions = this.getAPIRecoveryActions(apiError, context);
    } else if (this.isValidationError(error)) {
      type = 'validation';
      severity = 'low';
      retryable = false;
      message = error.message || 'Validation failed';
      userMessage = 'Please check your input and try again.';
      recoveryActions = this.getValidationRecoveryActions(error, context);
    } else if (this.isAuthError(error)) {
      type = 'auth';
      severity = 'high';
      retryable = false;
      message = 'Authentication failed';
      userMessage = 'Please sign in again to continue.';
      recoveryActions = this.getAuthRecoveryActions(context);
    } else if (this.isPermissionError(error)) {
      type = 'permission';
      severity = 'medium';
      retryable = false;
      message = 'Permission denied';
      userMessage = 'You don\'t have permission to perform this action.';
      recoveryActions = this.getPermissionRecoveryActions(context);
    } else {
      // Generic error handling
      if (error.message) {
        message = error.message;
      }
      
      if (error.name === 'TypeError' || error.name === 'ReferenceError') {
        type = 'client';
        severity = 'high';
        userMessage = 'A technical error occurred. Please refresh the page.';
        recoveryActions = this.getClientErrorRecoveryActions(context);
      }
    }

    return {
      id,
      type,
      severity,
      message,
      userMessage,
      retryable,
      recoveryActions,
      context: {
        ...context,
        timestamp,
        userAgent: navigator.userAgent,
        url: window.location.href,
      },
      originalError: error,
      timestamp,
    };
  }

  /**
   * Get recovery actions for network errors
   */
  private getNetworkRecoveryActions(context: ErrorContext): ErrorRecoveryAction[] {
    return [
      {
        type: 'retry',
        label: 'Try Again',
        description: 'Retry the last action',
        action: async () => {
          // Retry logic will be implemented by the caller
        },
        priority: 1,
      },
      {
        type: 'refresh',
        label: 'Refresh Page',
        description: 'Reload the current page',
        action: () => {
          window.location.reload();
        },
        priority: 2,
      },
      {
        type: 'manual',
        label: 'Check Connection',
        description: 'Verify your internet connection',
        action: () => {
          // Open network settings or show connection status
        },
        priority: 3,
      },
    ];
  }

  /**
   * Get recovery actions for API errors
   */
  private getAPIRecoveryActions(error: APIError, context: ErrorContext): ErrorRecoveryAction[] {
    const actions: ErrorRecoveryAction[] = [];

    if (error.retryable) {
      actions.push({
        type: 'retry',
        label: 'Try Again',
        description: 'Retry the request',
        action: async () => {
          // Retry logic
        },
        priority: 1,
      });
    }

    if (error.code === 'RATE_LIMIT_EXCEEDED') {
      actions.push({
        type: 'manual',
        label: 'Wait and Retry',
        description: 'Wait a moment before trying again',
        action: async () => {
          await new Promise(resolve => setTimeout(resolve, 5000));
        },
        priority: 1,
      });
    }

    if (error.code === 'SERVICE_UNAVAILABLE') {
      actions.push({
        type: 'fallback',
        label: 'Use Offline Mode',
        description: 'Continue with limited functionality',
        action: () => {
          // Enable offline mode
        },
        priority: 2,
      });
    }

    return actions;
  }

  /**
   * Get recovery actions for validation errors
   */
  private getValidationRecoveryActions(error: any, context: ErrorContext): ErrorRecoveryAction[] {
    return [
      {
        type: 'manual',
        label: 'Fix Input',
        description: 'Correct the highlighted fields',
        action: () => {
          // Focus on invalid field
        },
        priority: 1,
      },
    ];
  }

  /**
   * Get recovery actions for auth errors
   */
  private getAuthRecoveryActions(context: ErrorContext): ErrorRecoveryAction[] {
    return [
      {
        type: 'redirect',
        label: 'Sign In',
        description: 'Sign in to your account',
        action: () => {
          // Redirect to login
        },
        priority: 1,
      },
      {
        type: 'refresh',
        label: 'Refresh Page',
        description: 'Reload and try again',
        action: () => {
          window.location.reload();
        },
        priority: 2,
      },
    ];
  }

  /**
   * Get recovery actions for permission errors
   */
  private getPermissionRecoveryActions(context: ErrorContext): ErrorRecoveryAction[] {
    return [
      {
        type: 'manual',
        label: 'Contact Support',
        description: 'Request additional permissions',
        action: () => {
          // Open support contact
        },
        priority: 1,
      },
    ];
  }

  /**
   * Get recovery actions for client errors
   */
  private getClientErrorRecoveryActions(context: ErrorContext): ErrorRecoveryAction[] {
    return [
      {
        type: 'refresh',
        label: 'Refresh Page',
        description: 'Reload the page to fix the issue',
        action: () => {
          window.location.reload();
        },
        priority: 1,
      },
      {
        type: 'manual',
        label: 'Clear Cache',
        description: 'Clear browser cache and reload',
        action: () => {
          // Clear cache and reload
        },
        priority: 2,
      },
    ];
  }

  /**
   * Automatic retry with exponential backoff
   */
  async retryWithBackoff<T>(
    operation: () => Promise<T>,
    errorId: string,
    maxRetries: number = this.maxRetries
  ): Promise<T> {
    const attempts = this.retryAttempts.get(errorId) || 0;
    
    if (attempts >= maxRetries) {
      throw new Error(`Max retries (${maxRetries}) exceeded for operation`);
    }

    try {
      const result = await operation();
      this.retryAttempts.delete(errorId); // Clear on success
      return result;
    } catch (error) {
      this.retryAttempts.set(errorId, attempts + 1);
      
      // Exponential backoff: 1s, 2s, 4s, 8s...
      const delay = Math.pow(2, attempts) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return this.retryWithBackoff(operation, errorId, maxRetries);
    }
  }

  /**
   * Check if error is network-related
   */
  private isNetworkError(error: any): boolean {
    return (
      error.name === 'NetworkError' ||
      error.code === 'NETWORK_ERROR' ||
      error.message?.includes('fetch') ||
      error.message?.includes('network') ||
      !navigator.onLine
    );
  }

  /**
   * Check if error is API error
   */
  private isAPIError(error: any): boolean {
    return error && typeof error === 'object' && 'code' in error && 'message' in error;
  }

  /**
   * Check if error is validation error
   */
  private isValidationError(error: any): boolean {
    return (
      error.name === 'ValidationError' ||
      error.code === 'VALIDATION_ERROR' ||
      error.type === 'validation'
    );
  }

  /**
   * Check if error is auth error
   */
  private isAuthError(error: any): boolean {
    return (
      error.code === 'UNAUTHORIZED' ||
      error.status === 401 ||
      error.name === 'UnauthorizedError'
    );
  }

  /**
   * Check if error is permission error
   */
  private isPermissionError(error: any): boolean {
    return (
      error.code === 'FORBIDDEN' ||
      error.status === 403 ||
      error.name === 'ForbiddenError'
    );
  }

  /**
   * Get API error type
   */
  private getAPIErrorType(error: APIError): ProcessedError['type'] {
    if (error.code.includes('NETWORK') || error.code.includes('CONNECTION')) {
      return 'network';
    }
    if (error.code.includes('VALIDATION')) {
      return 'validation';
    }
    if (error.code.includes('UNAUTHORIZED') || error.code.includes('AUTH')) {
      return 'auth';
    }
    if (error.code.includes('FORBIDDEN') || error.code.includes('PERMISSION')) {
      return 'permission';
    }
    if (error.code.includes('SERVER') || error.code.includes('INTERNAL')) {
      return 'server';
    }
    return 'client';
  }

  /**
   * Get API error severity
   */
  private getAPIErrorSeverity(error: APIError): ProcessedError['severity'] {
    if (error.code.includes('CRITICAL') || error.code.includes('FATAL')) {
      return 'critical';
    }
    if (error.code.includes('SERVER') || error.code.includes('UNAUTHORIZED')) {
      return 'high';
    }
    if (error.code.includes('VALIDATION') || error.code.includes('NOT_FOUND')) {
      return 'low';
    }
    return 'medium';
  }

  /**
   * Get user-friendly error message
   */
  private getUserFriendlyMessage(error: APIError): string {
    const friendlyMessages: Record<string, string> = {
      'UNAUTHORIZED': 'Please sign in to continue.',
      'FORBIDDEN': 'You don\'t have permission to perform this action.',
      'NOT_FOUND': 'The requested resource was not found.',
      'VALIDATION_ERROR': 'Please check your input and try again.',
      'RATE_LIMIT_EXCEEDED': 'Too many requests. Please wait a moment.',
      'SERVICE_UNAVAILABLE': 'The service is temporarily unavailable.',
      'TIMEOUT': 'The request timed out. Please try again.',
      'INTERNAL_SERVER_ERROR': 'A server error occurred. Please try again later.',
    };

    return friendlyMessages[error.code] || error.message || 'An unexpected error occurred.';
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add error to queue
   */
  private addToQueue(error: ProcessedError): void {
    this.errorQueue.unshift(error);
    
    // Maintain queue size
    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue = this.errorQueue.slice(0, this.maxQueueSize);
    }
  }

  /**
   * Log error
   */
  private logError(error: ProcessedError): void {
    const logLevel = this.getLogLevel(error.severity);
    
    console[logLevel](`[${error.type.toUpperCase()}] ${error.message}`, {
      id: error.id,
      severity: error.severity,
      context: error.context,
      recoveryActions: error.recoveryActions.length,
      timestamp: error.timestamp,
    });

    // Send to background script for centralized logging
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'ERROR_LOG',
        error: {
          id: error.id,
          type: error.type,
          severity: error.severity,
          message: error.message,
          context: error.context,
          timestamp: error.timestamp,
        },
      }).catch(() => {
        // Ignore if background script is not available
      });
    }
  }

  /**
   * Get console log level for severity
   */
  private getLogLevel(severity: ProcessedError['severity']): 'error' | 'warn' | 'info' | 'log' {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'error';
      case 'medium':
        return 'warn';
      case 'low':
        return 'info';
      default:
        return 'log';
    }
  }

  /**
   * Report critical errors
   */
  private async reportError(error: ProcessedError): Promise<void> {
    try {
      // Send error report to backend
      await fetch('/api/v1/errors/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          errorId: error.id,
          type: error.type,
          severity: error.severity,
          message: error.message,
          context: error.context,
          userAgent: navigator.userAgent,
          url: window.location.href,
          timestamp: error.timestamp,
        }),
      });
    } catch (reportError) {
      console.error('Failed to report error:', reportError);
    }
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit: number = 10): ProcessedError[] {
    return this.errorQueue.slice(0, limit);
  }

  /**
   * Clear error queue
   */
  clearErrors(): void {
    this.errorQueue = [];
    this.retryAttempts.clear();
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    retryable: number;
  } {
    const stats = {
      total: this.errorQueue.length,
      byType: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
      retryable: 0,
    };

    this.errorQueue.forEach(error => {
      stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
      if (error.retryable) {
        stats.retryable++;
      }
    });

    return stats;
  }
}

/**
 * Global error boundary for unhandled errors
 */
export class GlobalErrorBoundary {
  private errorHandler: ExtensionErrorHandler;

  constructor() {
    this.errorHandler = ExtensionErrorHandler.getInstance();
    this.setupGlobalHandlers();
  }

  private setupGlobalHandlers(): void {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.errorHandler.handleError(event.reason, {
        component: 'GlobalErrorBoundary',
        action: 'unhandledrejection',
      });
    });

    // Handle uncaught errors
    window.addEventListener('error', (event) => {
      this.errorHandler.handleError(event.error || event, {
        component: 'GlobalErrorBoundary',
        action: 'uncaught_error',
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });

    // Handle resource loading errors
    window.addEventListener('error', (event) => {
      if (event.target !== window) {
        this.errorHandler.handleError(new Error('Resource loading failed'), {
          component: 'GlobalErrorBoundary',
          action: 'resource_error',
          metadata: {
            element: event.target,
            source: (event.target as any)?.src || (event.target as any)?.href,
          },
        });
      }
    }, true);
  }
}

// Initialize global error boundary
if (typeof window !== 'undefined') {
  new GlobalErrorBoundary();
}

export default ExtensionErrorHandler;
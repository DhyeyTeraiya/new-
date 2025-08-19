import { Request, Response, NextFunction } from 'express';
import { APIError, APIResponse } from '@browser-ai-agent/shared';
import { Logger } from 'winston';
import { createLogger } from '../utils/logger';

export interface ErrorHandlerConfig {
  includeStackTrace: boolean;
  logErrors: boolean;
  customErrorMap?: Map<string, { status: number; message: string }>;
}

export class ErrorHandler {
  private readonly logger: Logger;
  private readonly config: ErrorHandlerConfig;

  constructor(config: ErrorHandlerConfig) {
    this.logger = createLogger('ErrorHandler');
    this.config = config;
  }

  /**
   * Express error handling middleware
   */
  handle = (error: any, req: Request, res: Response, next: NextFunction) => {
    // Skip if response already sent
    if (res.headersSent) {
      return next(error);
    }

    const errorInfo = this.processError(error, req);

    // Log error if enabled
    if (this.config.logErrors) {
      this.logError(error, req, errorInfo);
    }

    // Send error response
    this.sendErrorResponse(res, errorInfo);
  };

  /**
   * Async error wrapper for route handlers
   */
  asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  };

  /**
   * Create standardized error
   */
  createError(
    code: string,
    message: string,
    status: number = 500,
    retryable: boolean = false,
    details?: any
  ): APIError & { status: number } {
    return {
      code,
      message,
      retryable,
      details,
      status,
    } as APIError & { status: number };
  }

  /**
   * Process error and determine response
   */
  private processError(error: any, req: Request): {
    status: number;
    apiError: APIError;
    originalError: any;
  } {
    let status = 500;
    let apiError: APIError;

    // Handle known error types
    if (error.status && error.code && error.message) {
      // Already formatted API error
      status = error.status;
      apiError = {
        code: error.code,
        message: error.message,
        retryable: error.retryable || false,
        details: error.details,
      };
    } else if (error.name === 'ValidationError') {
      // Validation errors
      status = 400;
      apiError = {
        code: 'VALIDATION_ERROR',
        message: error.message || 'Request validation failed',
        retryable: false,
        details: error.details,
      };
    } else if (error.name === 'UnauthorizedError' || error.status === 401) {
      // Authentication errors
      status = 401;
      apiError = {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        retryable: false,
      };
    } else if (error.name === 'ForbiddenError' || error.status === 403) {
      // Authorization errors
      status = 403;
      apiError = {
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
        retryable: false,
      };
    } else if (error.name === 'NotFoundError' || error.status === 404) {
      // Not found errors
      status = 404;
      apiError = {
        code: 'NOT_FOUND',
        message: 'Resource not found',
        retryable: false,
      };
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      // Network errors
      status = 503;
      apiError = {
        code: 'SERVICE_UNAVAILABLE',
        message: 'External service unavailable',
        retryable: true,
      };
    } else if (error.code === 'ETIMEDOUT') {
      // Timeout errors
      status = 504;
      apiError = {
        code: 'TIMEOUT',
        message: 'Request timeout',
        retryable: true,
      };
    } else if (this.config.customErrorMap?.has(error.code)) {
      // Custom mapped errors
      const mapped = this.config.customErrorMap.get(error.code)!;
      status = mapped.status;
      apiError = {
        code: error.code,
        message: mapped.message,
        retryable: this.isRetryableStatus(status),
      };
    } else {
      // Generic server error
      status = 500;
      apiError = {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        retryable: false,
      };

      // Include original error message in development
      if (process.env.NODE_ENV === 'development') {
        apiError.message = error.message || apiError.message;
        if (this.config.includeStackTrace) {
          apiError.details = {
            stack: error.stack,
            originalError: error.toString(),
          };
        }
      }
    }

    return {
      status,
      apiError,
      originalError: error,
    };
  }

  /**
   * Log error with context
   */
  private logError(error: any, req: Request, errorInfo: any): void {
    const logData = {
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code,
        name: error.name,
      },
      request: {
        method: req.method,
        url: req.url,
        headers: this.sanitizeHeaders(req.headers),
        body: this.sanitizeBody(req.body),
        query: req.query,
        params: req.params,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      },
      response: {
        status: errorInfo.status,
        code: errorInfo.apiError.code,
      },
    };

    if (errorInfo.status >= 500) {
      this.logger.error('Server error', logData);
    } else if (errorInfo.status >= 400) {
      this.logger.warn('Client error', logData);
    } else {
      this.logger.info('Request error', logData);
    }
  }

  /**
   * Send error response
   */
  private sendErrorResponse(res: Response, errorInfo: any): void {
    const response: APIResponse = {
      success: false,
      error: errorInfo.apiError,
      timestamp: new Date(),
    };

    res.status(errorInfo.status).json(response);
  }

  /**
   * Determine if status code indicates retryable error
   */
  private isRetryableStatus(status: number): boolean {
    return status >= 500 || status === 429 || status === 408;
  }

  /**
   * Sanitize headers for logging
   */
  private sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };
    
    // Remove sensitive headers
    const sensitiveHeaders = [
      'authorization',
      'cookie',
      'x-api-key',
      'x-auth-token',
    ];

    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Sanitize request body for logging
   */
  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sanitized = { ...body };
    
    // Remove sensitive fields
    const sensitiveFields = [
      'password',
      'token',
      'apiKey',
      'secret',
      'credentials',
    ];

    const sanitizeObject = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
      }

      if (obj && typeof obj === 'object') {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          if (sensitiveFields.some(field => 
            key.toLowerCase().includes(field.toLowerCase())
          )) {
            result[key] = '[REDACTED]';
          } else {
            result[key] = sanitizeObject(value);
          }
        }
        return result;
      }

      return obj;
    };

    return sanitizeObject(sanitized);
  }
}

/**
 * Not found handler middleware
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const error = {
    status: 404,
    code: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`,
    retryable: false,
  };

  next(error);
};

/**
 * Common error creators
 */
export const createValidationError = (message: string, details?: any) => ({
  status: 400,
  code: 'VALIDATION_ERROR',
  message,
  retryable: false,
  details,
});

export const createAuthError = (message: string = 'Authentication required') => ({
  status: 401,
  code: 'UNAUTHORIZED',
  message,
  retryable: false,
});

export const createForbiddenError = (message: string = 'Insufficient permissions') => ({
  status: 403,
  code: 'FORBIDDEN',
  message,
  retryable: false,
});

export const createNotFoundError = (message: string = 'Resource not found') => ({
  status: 404,
  code: 'NOT_FOUND',
  message,
  retryable: false,
});

export const createRateLimitError = (message: string = 'Rate limit exceeded') => ({
  status: 429,
  code: 'RATE_LIMIT_EXCEEDED',
  message,
  retryable: true,
});

export const createServerError = (message: string = 'Internal server error') => ({
  status: 500,
  code: 'INTERNAL_SERVER_ERROR',
  message,
  retryable: false,
});

export const createServiceUnavailableError = (message: string = 'Service unavailable') => ({
  status: 503,
  code: 'SERVICE_UNAVAILABLE',
  message,
  retryable: true,
});
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { APIError } from '@browser-ai-agent/shared';
import { Logger } from 'winston';
import { createLogger } from '../utils/logger';

export interface ValidationConfig {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
  headers?: ZodSchema;
}

export class ValidationMiddleware {
  private readonly logger: Logger;

  constructor() {
    this.logger = createLogger('Validation');
  }

  /**
   * Create validation middleware
   */
  validate(config: ValidationConfig) {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        // Validate request body
        if (config.body) {
          req.body = config.body.parse(req.body);
        }

        // Validate query parameters
        if (config.query) {
          req.query = config.query.parse(req.query);
        }

        // Validate route parameters
        if (config.params) {
          req.params = config.params.parse(req.params);
        }

        // Validate headers
        if (config.headers) {
          req.headers = config.headers.parse(req.headers);
        }

        next();
      } catch (error) {
        if (error instanceof ZodError) {
          return this.sendValidationError(res, error);
        }

        this.logger.error('Validation error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return this.sendGenericValidationError(res);
      }
    };
  }

  /**
   * Validate request body only
   */
  validateBody(schema: ZodSchema) {
    return this.validate({ body: schema });
  }

  /**
   * Validate query parameters only
   */
  validateQuery(schema: ZodSchema) {
    return this.validate({ query: schema });
  }

  /**
   * Validate route parameters only
   */
  validateParams(schema: ZodSchema) {
    return this.validate({ params: schema });
  }

  /**
   * Content type validation middleware
   */
  requireContentType(contentType: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      const requestContentType = req.headers['content-type'];

      if (!requestContentType || !requestContentType.includes(contentType)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CONTENT_TYPE',
            message: `Content-Type must be ${contentType}`,
            retryable: false,
          },
          timestamp: new Date(),
        });
      }

      next();
    };
  }

  /**
   * Request size validation middleware
   */
  validateRequestSize(maxSizeBytes: number) {
    return (req: Request, res: Response, next: NextFunction) => {
      const contentLength = req.headers['content-length'];

      if (contentLength && parseInt(contentLength) > maxSizeBytes) {
        return res.status(413).json({
          success: false,
          error: {
            code: 'REQUEST_TOO_LARGE',
            message: `Request size exceeds maximum of ${maxSizeBytes} bytes`,
            retryable: false,
          },
          timestamp: new Date(),
        });
      }

      next();
    };
  }

  /**
   * Custom validation middleware
   */
  custom(validator: (req: Request) => string | null) {
    return (req: Request, res: Response, next: NextFunction) => {
      const error = validator(req);

      if (error) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'CUSTOM_VALIDATION_FAILED',
            message: error,
            retryable: false,
          },
          timestamp: new Date(),
        });
      }

      next();
    };
  }

  /**
   * Send validation error response
   */
  private sendValidationError(res: Response, error: ZodError): void {
    const validationErrors = error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code,
      received: err.received,
    }));

    const apiError: APIError = {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      retryable: false,
      details: {
        errors: validationErrors,
      },
    };

    this.logger.warn('Request validation failed', {
      errors: validationErrors,
    });

    res.status(400).json({
      success: false,
      error: apiError,
      timestamp: new Date(),
    });
  }

  /**
   * Send generic validation error
   */
  private sendGenericValidationError(res: Response): void {
    const apiError: APIError = {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      retryable: false,
    };

    res.status(400).json({
      success: false,
      error: apiError,
      timestamp: new Date(),
    });
  }
}

// Global validation instance
export const validator = new ValidationMiddleware();

/**
 * Common validation schemas
 */
import { z } from 'zod';

export const commonSchemas = {
  // UUID validation
  uuid: z.string().uuid(),

  // Pagination
  pagination: z.object({
    page: z.string().transform(val => parseInt(val)).pipe(z.number().min(1)).optional(),
    limit: z.string().transform(val => parseInt(val)).pipe(z.number().min(1).max(100)).optional(),
  }),

  // Session ID
  sessionId: z.object({
    sessionId: z.string().min(1),
  }),

  // Automation ID
  automationId: z.object({
    automationId: z.string().uuid(),
  }),

  // URL validation
  url: z.string().url(),

  // Non-empty string
  nonEmptyString: z.string().min(1).trim(),

  // Optional non-empty string
  optionalNonEmptyString: z.string().min(1).trim().optional(),

  // Boolean from string
  booleanFromString: z.string().transform(val => val === 'true'),

  // Number from string
  numberFromString: z.string().transform(val => {
    const num = parseInt(val);
    if (isNaN(num)) {
      throw new Error('Invalid number');
    }
    return num;
  }),

  // Positive number from string
  positiveNumberFromString: z.string().transform(val => {
    const num = parseInt(val);
    if (isNaN(num) || num <= 0) {
      throw new Error('Must be a positive number');
    }
    return num;
  }),
};
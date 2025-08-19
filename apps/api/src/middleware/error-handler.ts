import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';

export interface APIError {
  code: string;
  message: string;
  status: number;
  details?: any;
}

export class AppError extends Error implements APIError {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: any;

  constructor(code: string, message: string, status: number = 500, details?: any) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Skip if response already sent
  if (res.headersSent) {
    return next(error);
  }

  let status = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected error occurred';
  let details: any = undefined;

  // Handle known error types
  if (error instanceof AppError) {
    status = error.status;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error.name === 'ValidationError') {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = error.message;
  } else if (error.name === 'UnauthorizedError') {
    status = 401;
    code = 'UNAUTHORIZED';
    message = 'Authentication required';
  } else if (error.name === 'CastError') {
    status = 400;
    code = 'INVALID_ID';
    message = 'Invalid ID format';
  } else if ((error as any).code === 11000) {
    status = 409;
    code = 'DUPLICATE_ENTRY';
    message = 'Resource already exists';
  }

  // Log error
  logger.error(`${code}: ${message}`, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      params: req.params,
      query: req.query,
      ip: req.ip,
    },
    status,
    code,
  });

  // Send error response
  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    },
    timestamp: new Date().toISOString(),
  });
};

export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const error = new AppError(
    'NOT_FOUND',
    `Route ${req.method} ${req.path} not found`,
    404
  );
  next(error);
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
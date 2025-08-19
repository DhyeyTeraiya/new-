import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { APIError } from '@browser-ai-agent/shared';
import { Logger } from 'winston';
import { createLogger } from '../utils/logger';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    role: string;
  };
  sessionId?: string;
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  allowAnonymous: boolean;
}

export class AuthMiddleware {
  private readonly logger: Logger;
  private readonly config: AuthConfig;

  constructor(config: AuthConfig) {
    this.logger = createLogger('AuthMiddleware');
    this.config = config;
  }

  /**
   * JWT authentication middleware
   */
  authenticate = (required: boolean = true) => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const token = this.extractToken(req);

        if (!token) {
          if (!required || this.config.allowAnonymous) {
            // Create anonymous user
            req.user = {
              id: `anonymous-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              role: 'anonymous',
            };
            return next();
          }

          return this.sendAuthError(res, 'No authentication token provided', 'AUTH_TOKEN_MISSING');
        }

        // Verify JWT token
        const decoded = jwt.verify(token, this.config.jwtSecret) as any;
        
        req.user = {
          id: decoded.userId || decoded.sub,
          email: decoded.email,
          role: decoded.role || 'user',
        };

        req.sessionId = decoded.sessionId;

        this.logger.debug('User authenticated', {
          userId: req.user.id,
          role: req.user.role,
          sessionId: req.sessionId,
        });

        next();
      } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
          return this.sendAuthError(res, 'Token has expired', 'AUTH_TOKEN_EXPIRED');
        }

        if (error instanceof jwt.JsonWebTokenError) {
          return this.sendAuthError(res, 'Invalid token', 'AUTH_INVALID_TOKEN');
        }

        this.logger.error('Authentication error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return this.sendAuthError(res, 'Authentication failed', 'AUTH_FAILED');
      }
    };
  };

  /**
   * Role-based authorization middleware
   */
  authorize = (allowedRoles: string[]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return this.sendAuthError(res, 'Authentication required', 'AUTH_REQUIRED');
      }

      if (!allowedRoles.includes(req.user.role)) {
        return this.sendAuthError(res, 'Insufficient permissions', 'AUTH_INSUFFICIENT_PERMISSIONS');
      }

      next();
    };
  };

  /**
   * Generate JWT token
   */
  generateToken(payload: {
    userId: string;
    email?: string;
    role?: string;
    sessionId?: string;
  }): string {
    return jwt.sign(
      {
        userId: payload.userId,
        email: payload.email,
        role: payload.role || 'user',
        sessionId: payload.sessionId,
      },
      this.config.jwtSecret,
      {
        expiresIn: this.config.jwtExpiresIn,
        issuer: 'browser-ai-agent',
        audience: 'browser-ai-agent-users',
      }
    );
  }

  /**
   * Verify and decode token without middleware
   */
  verifyToken(token: string): any {
    return jwt.verify(token, this.config.jwtSecret);
  }

  /**
   * Extract token from request
   */
  private extractToken(req: Request): string | null {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check query parameter (for WebSocket connections)
    if (req.query.token && typeof req.query.token === 'string') {
      return req.query.token;
    }

    // Check cookies
    if (req.cookies && req.cookies.auth_token) {
      return req.cookies.auth_token;
    }

    return null;
  }

  /**
   * Send authentication error response
   */
  private sendAuthError(res: Response, message: string, code: string): void {
    const error: APIError = {
      code,
      message,
      retryable: false,
    };

    res.status(401).json({
      success: false,
      error,
      timestamp: new Date(),
    });
  }
}

/**
 * Session validation middleware
 */
export const validateSession = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const sessionId = req.sessionId || req.headers['x-session-id'] || req.body.sessionId;

  if (!sessionId) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'SESSION_ID_REQUIRED',
        message: 'Session ID is required',
        retryable: false,
      },
      timestamp: new Date(),
    });
  }

  req.sessionId = sessionId as string;
  next();
};

/**
 * API key authentication middleware (for external integrations)
 */
export const authenticateApiKey = (validApiKeys: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'API_KEY_REQUIRED',
          message: 'API key is required',
          retryable: false,
        },
        timestamp: new Date(),
      });
    }

    if (!validApiKeys.includes(apiKey)) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_API_KEY',
          message: 'Invalid API key',
          retryable: false,
        },
        timestamp: new Date(),
      });
    }

    // Set user for API key authentication
    req.user = {
      id: `api-key-${apiKey.substring(0, 8)}`,
      role: 'api',
    };

    next();
  };
};
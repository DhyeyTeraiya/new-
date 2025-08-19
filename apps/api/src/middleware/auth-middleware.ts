import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import JWTService, { TokenPayload } from '../auth/jwt-service';
import AuthorizationService from '../auth/authorization-service';

// =============================================================================
// AUTHENTICATION & AUTHORIZATION MIDDLEWARE
// Master Plan: Secure request processing with JWT validation and RBAC
// =============================================================================

export interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: string;
    email: string;
    role: string;
    permissions: string[];
    sessionId: string;
  };
  context: {
    requestId: string;
    userId: string;
    userRole: string;
    startTime: number;
    ip: string;
    userAgent: string;
  };
}

export interface AuthMiddlewareOptions {
  required?: boolean;
  roles?: string[];
  permissions?: Array<{
    resource: string;
    action: string;
  }>;
  requireAll?: boolean; // For permissions - require all or any
}

// =============================================================================
// AUTHENTICATION MIDDLEWARE
// =============================================================================

export class AuthMiddleware {
  private jwtService: JWTService;
  private authorizationService: AuthorizationService;

  constructor() {
    this.jwtService = JWTService.getInstance();
    this.authorizationService = AuthorizationService.getInstance();
  }

  // =============================================================================
  // MAIN AUTHENTICATION MIDDLEWARE
  // =============================================================================

  authenticate(options: AuthMiddlewareOptions = { required: true }) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const startTime = Date.now();
      
      try {
        // Extract token from Authorization header
        const authHeader = request.headers.authorization;
        
        if (!authHeader) {
          if (options.required) {
            return this.sendUnauthorized(reply, 'Authorization header missing', request.id);
          }
          return; // Optional auth, continue without user
        }

        // Validate Bearer token format
        const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/);
        if (!tokenMatch) {
          return this.sendUnauthorized(reply, 'Invalid authorization header format', request.id);
        }

        const token = tokenMatch[1];

        // Validate JWT token
        const validation = await this.jwtService.validateAccessToken(token);
        
        if (!validation.valid) {
          if (validation.expired) {
            return this.sendUnauthorized(reply, 'Token expired', request.id, 'TOKEN_EXPIRED');
          } else if (validation.blacklisted) {
            return this.sendUnauthorized(reply, 'Token revoked', request.id, 'TOKEN_REVOKED');
          } else {
            return this.sendUnauthorized(reply, validation.error || 'Invalid token', request.id);
          }
        }

        const payload = validation.payload!;

        // Add user information to request
        (request as AuthenticatedRequest).user = {
          id: payload.userId,
          email: payload.email,
          role: payload.role,
          permissions: payload.permissions,
          sessionId: payload.sessionId,
        };

        // Update request context
        const context = (request as any).context;
        if (context) {
          context.userId = payload.userId;
          context.userRole = payload.role;
        }

        // Check role requirements
        if (options.roles && options.roles.length > 0) {
          if (!options.roles.includes(payload.role)) {
            return this.sendForbidden(reply, 'Insufficient role permissions', request.id);
          }
        }

        // Check permission requirements
        if (options.permissions && options.permissions.length > 0) {
          const hasPermission = options.requireAll
            ? await this.authorizationService.hasAllPermissions(payload.userId, options.permissions)
            : await this.authorizationService.hasAnyPermission(payload.userId, options.permissions);

          if (!hasPermission) {
            return this.sendForbidden(reply, 'Insufficient permissions', request.id);
          }
        }

        const duration = Date.now() - startTime;
        
        logger.debug('Authentication successful', {
          requestId: request.id,
          userId: payload.userId,
          role: payload.role,
          sessionId: payload.sessionId,
          duration,
        });

      } catch (error) {
        logger.error('Authentication middleware error', {
          requestId: request.id,
          error: error.message,
          stack: error.stack,
        });

        return this.sendUnauthorized(reply, 'Authentication failed', request.id);
      }
    };
  }

  // =============================================================================
  // AUTHORIZATION MIDDLEWARE
  // =============================================================================

  authorize(resource: string, action: string) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const authenticatedRequest = request as AuthenticatedRequest;
      
      if (!authenticatedRequest.user) {
        return this.sendUnauthorized(reply, 'Authentication required', request.id);
      }

      try {
        const hasPermission = await this.authorizationService.hasPermission(
          authenticatedRequest.user.id,
          resource,
          action,
          request.body // Pass request body as resource data
        );

        if (!hasPermission) {
          logger.warn('Authorization denied', {
            requestId: request.id,
            userId: authenticatedRequest.user.id,
            resource,
            action,
          });

          return this.sendForbidden(reply, `Access denied for ${action} on ${resource}`, request.id);
        }

        logger.debug('Authorization successful', {
          requestId: request.id,
          userId: authenticatedRequest.user.id,
          resource,
          action,
        });

      } catch (error) {
        logger.error('Authorization middleware error', {
          requestId: request.id,
          userId: authenticatedRequest.user.id,
          resource,
          action,
          error: error.message,
        });

        return this.sendForbidden(reply, 'Authorization failed', request.id);
      }
    };
  }

  // =============================================================================
  // COMBINED MIDDLEWARE
  // =============================================================================

  requireAuth(options: AuthMiddlewareOptions = {}) {
    return this.authenticate({ ...options, required: true });
  }

  optionalAuth() {
    return this.authenticate({ required: false });
  }

  requireRole(roles: string | string[]) {
    const roleArray = Array.isArray(roles) ? roles : [roles];
    return this.authenticate({ required: true, roles: roleArray });
  }

  requirePermission(resource: string, action: string) {
    return this.authenticate({
      required: true,
      permissions: [{ resource, action }],
    });
  }

  requirePermissions(permissions: Array<{ resource: string; action: string }>, requireAll = false) {
    return this.authenticate({
      required: true,
      permissions,
      requireAll,
    });
  }

  requireAdmin() {
    return this.authenticate({
      required: true,
      roles: ['admin'],
    });
  }

  // =============================================================================
  // API KEY AUTHENTICATION
  // =============================================================================

  authenticateApiKey() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const apiKey = request.headers['x-api-key'] as string;
        
        if (!apiKey) {
          return this.sendUnauthorized(reply, 'API key required', request.id);
        }

        // Validate API key (this would check against database)
        const isValid = await this.validateApiKey(apiKey);
        
        if (!isValid) {
          return this.sendUnauthorized(reply, 'Invalid API key', request.id);
        }

        // Get API key details
        const apiKeyData = await this.getApiKeyData(apiKey);
        
        if (apiKeyData) {
          (request as AuthenticatedRequest).user = {
            id: apiKeyData.userId,
            email: apiKeyData.email,
            role: apiKeyData.role,
            permissions: apiKeyData.permissions,
            sessionId: `api_${apiKeyData.keyId}`,
          };

          logger.debug('API key authentication successful', {
            requestId: request.id,
            keyId: apiKeyData.keyId,
            userId: apiKeyData.userId,
          });
        }

      } catch (error) {
        logger.error('API key authentication error', {
          requestId: request.id,
          error: error.message,
        });

        return this.sendUnauthorized(reply, 'API key authentication failed', request.id);
      }
    };
  }

  // =============================================================================
  // RATE LIMITING BY USER
  // =============================================================================

  rateLimitByUser(maxRequests: number, windowMs: number) {
    const userRequests = new Map<string, { count: number; resetTime: number }>();

    return async (request: FastifyRequest, reply: FastifyReply) => {
      const authenticatedRequest = request as AuthenticatedRequest;
      
      if (!authenticatedRequest.user) {
        return; // Skip rate limiting if not authenticated
      }

      const userId = authenticatedRequest.user.id;
      const now = Date.now();
      const windowStart = now - windowMs;

      // Clean up old entries
      for (const [key, data] of userRequests.entries()) {
        if (data.resetTime < now) {
          userRequests.delete(key);
        }
      }

      // Get or create user request data
      let userData = userRequests.get(userId);
      if (!userData || userData.resetTime < now) {
        userData = { count: 0, resetTime: now + windowMs };
        userRequests.set(userId, userData);
      }

      // Check rate limit
      if (userData.count >= maxRequests) {
        const retryAfter = Math.ceil((userData.resetTime - now) / 1000);
        
        reply.header('Retry-After', retryAfter.toString());
        reply.status(429).send({
          error: 'Rate limit exceeded',
          message: `Too many requests. Try again in ${retryAfter} seconds.`,
          retryAfter,
        });
        return;
      }

      // Increment counter
      userData.count++;
    };
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  private sendUnauthorized(reply: FastifyReply, message: string, requestId: string, code?: string): void {
    reply.status(401).send({
      error: 'Unauthorized',
      message,
      code,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  private sendForbidden(reply: FastifyReply, message: string, requestId: string): void {
    reply.status(403).send({
      error: 'Forbidden',
      message,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  private async validateApiKey(apiKey: string): Promise<boolean> {
    // This would validate against database/cache
    // For now, return mock validation
    return apiKey.startsWith('ak_');
  }

  private async getApiKeyData(apiKey: string): Promise<any> {
    // This would fetch API key data from database
    // For now, return mock data
    return {
      keyId: 'key_123',
      userId: 'user_123',
      email: 'api@example.com',
      role: 'user',
      permissions: ['automation.task.create', 'automation.task.read'],
    };
  }

  // =============================================================================
  // SESSION MANAGEMENT
  // =============================================================================

  async refreshUserSession(request: FastifyRequest): Promise<boolean> {
    const authenticatedRequest = request as AuthenticatedRequest;
    
    if (!authenticatedRequest.user) {
      return false;
    }

    try {
      // This would refresh user session data
      // Update last activity, check for role/permission changes, etc.
      
      logger.debug('User session refreshed', {
        requestId: request.id,
        userId: authenticatedRequest.user.id,
        sessionId: authenticatedRequest.user.sessionId,
      });

      return true;
    } catch (error) {
      logger.error('Session refresh failed', {
        requestId: request.id,
        userId: authenticatedRequest.user.id,
        error: error.message,
      });

      return false;
    }
  }

  // =============================================================================
  // SECURITY HEADERS
  // =============================================================================

  securityHeaders() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      // Add security headers
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Frame-Options', 'DENY');
      reply.header('X-XSS-Protection', '1; mode=block');
      reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
      reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      
      // Remove server information
      reply.removeHeader('Server');
      reply.removeHeader('X-Powered-By');
    };
  }

  // =============================================================================
  // AUDIT LOGGING
  // =============================================================================

  auditLog() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const authenticatedRequest = request as AuthenticatedRequest;
      
      // Log sensitive operations
      const sensitiveOperations = ['POST', 'PUT', 'DELETE', 'PATCH'];
      
      if (sensitiveOperations.includes(request.method) && authenticatedRequest.user) {
        logger.info('Audit log', {
          requestId: request.id,
          userId: authenticatedRequest.user.id,
          method: request.method,
          url: request.url,
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          timestamp: new Date().toISOString(),
        });
      }
    };
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const authMiddleware = new AuthMiddleware();

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

export const requireAuth = (options?: AuthMiddlewareOptions) => authMiddleware.requireAuth(options);
export const optionalAuth = () => authMiddleware.optionalAuth();
export const requireRole = (roles: string | string[]) => authMiddleware.requireRole(roles);
export const requirePermission = (resource: string, action: string) => authMiddleware.requirePermission(resource, action);
export const requirePermissions = (permissions: Array<{ resource: string; action: string }>, requireAll = false) => 
  authMiddleware.requirePermissions(permissions, requireAll);
export const requireAdmin = () => authMiddleware.requireAdmin();
export const authenticateApiKey = () => authMiddleware.authenticateApiKey();
export const authorize = (resource: string, action: string) => authMiddleware.authorize(resource, action);
export const rateLimitByUser = (maxRequests: number, windowMs: number) => authMiddleware.rateLimitByUser(maxRequests, windowMs);
export const securityHeaders = () => authMiddleware.securityHeaders();
export const auditLog = () => authMiddleware.auditLog();

export default authMiddleware;
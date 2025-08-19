import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { config } from '../config';
import { RedisService } from '../services/redis';

// =============================================================================
// ADVANCED JWT SERVICE (Superior Authentication System)
// Master Plan: JWT with refresh token rotation and security features
// =============================================================================

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
  sessionId: string;
  tokenType: 'access' | 'refresh';
  iat?: number;
  exp?: number;
  jti?: string; // JWT ID for token tracking
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface TokenValidationResult {
  valid: boolean;
  payload?: TokenPayload;
  error?: string;
  expired?: boolean;
  blacklisted?: boolean;
}

export interface RefreshTokenData {
  userId: string;
  sessionId: string;
  deviceId?: string;
  userAgent?: string;
  ip?: string;
  createdAt: Date;
  lastUsed: Date;
  expiresAt: Date;
}

// =============================================================================
// JWT SERVICE IMPLEMENTATION
// =============================================================================

export class JWTService {
  private static instance: JWTService;
  private redisService: RedisService;
  private accessTokenSecret: string;
  private refreshTokenSecret: string;
  private accessTokenExpiry: string;
  private refreshTokenExpiry: string;

  private constructor() {
    this.redisService = RedisService.getInstance();
    this.accessTokenSecret = config.jwt.secret;
    this.refreshTokenSecret = config.jwt.refreshSecret || config.jwt.secret + '_refresh';
    this.accessTokenExpiry = config.jwt.expiresIn;
    this.refreshTokenExpiry = config.jwt.refreshExpiresIn || '7d';
    
    logger.info('JWT Service initialized');
  }

  public static getInstance(): JWTService {
    if (!JWTService.instance) {
      JWTService.instance = new JWTService();
    }
    return JWTService.instance;
  }

  // =============================================================================
  // TOKEN GENERATION
  // =============================================================================

  async generateTokenPair(
    userId: string,
    email: string,
    role: string,
    permissions: string[],
    sessionId: string,
    deviceInfo?: { deviceId?: string; userAgent?: string; ip?: string }
  ): Promise<TokenPair> {
    logger.info('Generating token pair', { userId, email, role, sessionId });

    try {
      // Generate unique JWT IDs
      const accessJti = this.generateJTI('access');
      const refreshJti = this.generateJTI('refresh');

      // Create access token payload
      const accessPayload: TokenPayload = {
        userId,
        email,
        role,
        permissions,
        sessionId,
        tokenType: 'access',
        jti: accessJti,
      };

      // Create refresh token payload
      const refreshPayload: TokenPayload = {
        userId,
        email,
        role,
        permissions,
        sessionId,
        tokenType: 'refresh',
        jti: refreshJti,
      };

      // Generate tokens
      const accessToken = jwt.sign(accessPayload, this.accessTokenSecret, {
        expiresIn: this.accessTokenExpiry,
        issuer: 'browser-ai-agent',
        audience: 'browser-ai-agent-api',
        algorithm: 'HS256',
      });

      const refreshToken = jwt.sign(refreshPayload, this.refreshTokenSecret, {
        expiresIn: this.refreshTokenExpiry,
        issuer: 'browser-ai-agent',
        audience: 'browser-ai-agent-api',
        algorithm: 'HS256',
      });

      // Store refresh token data in Redis
      await this.storeRefreshToken(refreshJti, {
        userId,
        sessionId,
        deviceId: deviceInfo?.deviceId,
        userAgent: deviceInfo?.userAgent,
        ip: deviceInfo?.ip,
        createdAt: new Date(),
        lastUsed: new Date(),
        expiresAt: new Date(Date.now() + this.parseExpiry(this.refreshTokenExpiry)),
      });

      // Store active session
      await this.storeActiveSession(sessionId, userId, accessJti, refreshJti);

      const expiresIn = this.parseExpiry(this.accessTokenExpiry) / 1000; // Convert to seconds

      logger.info('Token pair generated successfully', {
        userId,
        sessionId,
        accessJti,
        refreshJti,
        expiresIn,
      });

      return {
        accessToken,
        refreshToken,
        expiresIn,
        tokenType: 'Bearer',
      };
    } catch (error) {
      logger.error('Failed to generate token pair', {
        userId,
        error: error.message,
      });
      throw new Error('Token generation failed');
    }
  }

  // =============================================================================
  // TOKEN VALIDATION
  // =============================================================================

  async validateAccessToken(token: string): Promise<TokenValidationResult> {
    try {
      // Verify and decode token
      const payload = jwt.verify(token, this.accessTokenSecret, {
        issuer: 'browser-ai-agent',
        audience: 'browser-ai-agent-api',
        algorithms: ['HS256'],
      }) as TokenPayload;

      // Check if token type is correct
      if (payload.tokenType !== 'access') {
        return {
          valid: false,
          error: 'Invalid token type',
        };
      }

      // Check if token is blacklisted
      const isBlacklisted = await this.isTokenBlacklisted(payload.jti!);
      if (isBlacklisted) {
        return {
          valid: false,
          error: 'Token is blacklisted',
          blacklisted: true,
        };
      }

      // Check if session is still active
      const isSessionActive = await this.isSessionActive(payload.sessionId);
      if (!isSessionActive) {
        return {
          valid: false,
          error: 'Session is no longer active',
        };
      }

      logger.debug('Access token validated successfully', {
        userId: payload.userId,
        sessionId: payload.sessionId,
        jti: payload.jti,
      });

      return {
        valid: true,
        payload,
      };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return {
          valid: false,
          error: 'Token expired',
          expired: true,
        };
      } else if (error.name === 'JsonWebTokenError') {
        return {
          valid: false,
          error: 'Invalid token',
        };
      } else {
        logger.error('Token validation error', { error: error.message });
        return {
          valid: false,
          error: 'Token validation failed',
        };
      }
    }
  }

  async validateRefreshToken(token: string): Promise<TokenValidationResult> {
    try {
      // Verify and decode token
      const payload = jwt.verify(token, this.refreshTokenSecret, {
        issuer: 'browser-ai-agent',
        audience: 'browser-ai-agent-api',
        algorithms: ['HS256'],
      }) as TokenPayload;

      // Check if token type is correct
      if (payload.tokenType !== 'refresh') {
        return {
          valid: false,
          error: 'Invalid token type',
        };
      }

      // Check if refresh token exists and is valid
      const refreshTokenData = await this.getRefreshTokenData(payload.jti!);
      if (!refreshTokenData) {
        return {
          valid: false,
          error: 'Refresh token not found',
        };
      }

      // Check if refresh token is expired
      if (refreshTokenData.expiresAt < new Date()) {
        await this.revokeRefreshToken(payload.jti!);
        return {
          valid: false,
          error: 'Refresh token expired',
          expired: true,
        };
      }

      // Update last used timestamp
      await this.updateRefreshTokenLastUsed(payload.jti!);

      logger.debug('Refresh token validated successfully', {
        userId: payload.userId,
        sessionId: payload.sessionId,
        jti: payload.jti,
      });

      return {
        valid: true,
        payload,
      };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return {
          valid: false,
          error: 'Refresh token expired',
          expired: true,
        };
      } else if (error.name === 'JsonWebTokenError') {
        return {
          valid: false,
          error: 'Invalid refresh token',
        };
      } else {
        logger.error('Refresh token validation error', { error: error.message });
        return {
          valid: false,
          error: 'Refresh token validation failed',
        };
      }
    }
  }

  // =============================================================================
  // TOKEN REFRESH
  // =============================================================================

  async refreshTokens(refreshToken: string, deviceInfo?: { userAgent?: string; ip?: string }): Promise<TokenPair> {
    logger.info('Refreshing tokens');

    // Validate refresh token
    const validation = await this.validateRefreshToken(refreshToken);
    if (!validation.valid || !validation.payload) {
      throw new Error(validation.error || 'Invalid refresh token');
    }

    const { userId, email, role, permissions, sessionId } = validation.payload;

    // Revoke old refresh token (rotation)
    await this.revokeRefreshToken(validation.payload.jti!);

    // Generate new token pair
    const newTokenPair = await this.generateTokenPair(
      userId,
      email,
      role,
      permissions,
      sessionId,
      deviceInfo
    );

    logger.info('Tokens refreshed successfully', {
      userId,
      sessionId,
      oldJti: validation.payload.jti,
    });

    return newTokenPair;
  }

  // =============================================================================
  // TOKEN REVOCATION
  // =============================================================================

  async revokeToken(token: string, tokenType: 'access' | 'refresh'): Promise<void> {
    try {
      const secret = tokenType === 'access' ? this.accessTokenSecret : this.refreshTokenSecret;
      const payload = jwt.verify(token, secret) as TokenPayload;

      if (tokenType === 'access') {
        await this.blacklistToken(payload.jti!, payload.exp!);
      } else {
        await this.revokeRefreshToken(payload.jti!);
      }

      logger.info('Token revoked successfully', {
        tokenType,
        jti: payload.jti,
        userId: payload.userId,
      });
    } catch (error) {
      logger.error('Failed to revoke token', {
        tokenType,
        error: error.message,
      });
      throw new Error('Token revocation failed');
    }
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    logger.info('Revoking all tokens for user', { userId });

    try {
      // Get all user sessions
      const sessions = await this.getUserSessions(userId);

      // Revoke all sessions
      for (const sessionId of sessions) {
        await this.revokeSession(sessionId);
      }

      logger.info('All user tokens revoked successfully', { userId, sessionsCount: sessions.length });
    } catch (error) {
      logger.error('Failed to revoke all user tokens', {
        userId,
        error: error.message,
      });
      throw new Error('Failed to revoke all user tokens');
    }
  }

  async revokeSession(sessionId: string): Promise<void> {
    logger.info('Revoking session', { sessionId });

    try {
      // Get session data
      const sessionData = await this.getSessionData(sessionId);
      if (!sessionData) {
        return; // Session doesn't exist
      }

      // Blacklist access token
      if (sessionData.accessJti) {
        await this.blacklistToken(sessionData.accessJti, Date.now() + 3600000); // 1 hour buffer
      }

      // Revoke refresh token
      if (sessionData.refreshJti) {
        await this.revokeRefreshToken(sessionData.refreshJti);
      }

      // Remove session
      await this.removeSession(sessionId);

      logger.info('Session revoked successfully', { sessionId });
    } catch (error) {
      logger.error('Failed to revoke session', {
        sessionId,
        error: error.message,
      });
      throw new Error('Session revocation failed');
    }
  }

  // =============================================================================
  // REDIS OPERATIONS
  // =============================================================================

  private async storeRefreshToken(jti: string, data: RefreshTokenData): Promise<void> {
    const key = `refresh_token:${jti}`;
    const expiry = Math.floor((data.expiresAt.getTime() - Date.now()) / 1000);
    
    await this.redisService.setex(key, expiry, JSON.stringify(data));
  }

  private async getRefreshTokenData(jti: string): Promise<RefreshTokenData | null> {
    const key = `refresh_token:${jti}`;
    const data = await this.redisService.get(key);
    
    if (!data) {
      return null;
    }

    const parsed = JSON.parse(data);
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt),
      lastUsed: new Date(parsed.lastUsed),
      expiresAt: new Date(parsed.expiresAt),
    };
  }

  private async updateRefreshTokenLastUsed(jti: string): Promise<void> {
    const data = await this.getRefreshTokenData(jti);
    if (data) {
      data.lastUsed = new Date();
      await this.storeRefreshToken(jti, data);
    }
  }

  private async revokeRefreshToken(jti: string): Promise<void> {
    const key = `refresh_token:${jti}`;
    await this.redisService.del(key);
  }

  private async blacklistToken(jti: string, exp: number): Promise<void> {
    const key = `blacklist:${jti}`;
    const ttl = Math.max(0, exp - Math.floor(Date.now() / 1000));
    
    if (ttl > 0) {
      await this.redisService.setex(key, ttl, '1');
    }
  }

  private async isTokenBlacklisted(jti: string): Promise<boolean> {
    const key = `blacklist:${jti}`;
    const result = await this.redisService.get(key);
    return result !== null;
  }

  private async storeActiveSession(sessionId: string, userId: string, accessJti: string, refreshJti: string): Promise<void> {
    const sessionKey = `session:${sessionId}`;
    const userSessionsKey = `user_sessions:${userId}`;
    
    const sessionData = {
      userId,
      accessJti,
      refreshJti,
      createdAt: new Date().toISOString(),
    };

    // Store session data
    await this.redisService.setex(sessionKey, this.parseExpiry(this.refreshTokenExpiry) / 1000, JSON.stringify(sessionData));
    
    // Add to user sessions set
    await this.redisService.sadd(userSessionsKey, sessionId);
    await this.redisService.expire(userSessionsKey, this.parseExpiry(this.refreshTokenExpiry) / 1000);
  }

  private async getSessionData(sessionId: string): Promise<any> {
    const key = `session:${sessionId}`;
    const data = await this.redisService.get(key);
    return data ? JSON.parse(data) : null;
  }

  private async isSessionActive(sessionId: string): Promise<boolean> {
    const key = `session:${sessionId}`;
    const exists = await this.redisService.exists(key);
    return exists === 1;
  }

  private async removeSession(sessionId: string): Promise<void> {
    const sessionData = await this.getSessionData(sessionId);
    if (sessionData) {
      // Remove from user sessions
      const userSessionsKey = `user_sessions:${sessionData.userId}`;
      await this.redisService.srem(userSessionsKey, sessionId);
    }

    // Remove session
    const sessionKey = `session:${sessionId}`;
    await this.redisService.del(sessionKey);
  }

  private async getUserSessions(userId: string): Promise<string[]> {
    const key = `user_sessions:${userId}`;
    return await this.redisService.smembers(key);
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  private generateJTI(type: string): string {
    return `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private parseExpiry(expiry: string): number {
    // Simple parser for common formats like '15m', '1h', '7d'
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 15 * 60 * 1000; // Default 15 minutes
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 15 * 60 * 1000;
    }
  }

  // =============================================================================
  // ADMIN METHODS
  // =============================================================================

  async getTokenStats(): Promise<any> {
    // This would implement token statistics
    return {
      activeSessions: 0,
      blacklistedTokens: 0,
      refreshTokens: 0,
    };
  }

  async cleanupExpiredTokens(): Promise<void> {
    logger.info('Cleaning up expired tokens');
    // Redis automatically handles TTL, but we could implement additional cleanup here
  }
}

export default JWTService;
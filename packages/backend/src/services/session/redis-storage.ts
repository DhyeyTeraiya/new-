/**
 * Redis Session Storage Implementation
 * High-performance caching layer for session data
 */

import Redis from 'ioredis';
import { UserSession } from '@browser-ai-agent/shared';
import { SessionStorage } from './session-service';
import { Logger } from '../../utils/logger';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix: string;
  ttl: number; // Time to live in seconds
  maxRetries: number;
  retryDelayOnFailover: number;
}

export class RedisSessionStorage implements SessionStorage {
  private redis: Redis;
  private logger: Logger;
  private config: RedisConfig;
  private readonly SESSION_KEY_PREFIX: string;
  private readonly USER_SESSIONS_KEY_PREFIX: string;

  constructor(config: RedisConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.SESSION_KEY_PREFIX = `${config.keyPrefix}:session:`;
    this.USER_SESSIONS_KEY_PREFIX = `${config.keyPrefix}:user_sessions:`;

    this.redis = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db || 0,
      maxRetriesPerRequest: config.maxRetries,
      retryDelayOnFailover: config.retryDelayOnFailover,
      lazyConnect: true,
      keyPrefix: config.keyPrefix,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      this.logger.info('Redis connected successfully');
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error', error);
    });

    this.redis.on('close', () => {
      this.logger.warn('Redis connection closed');
    });

    this.redis.on('reconnecting', () => {
      this.logger.info('Redis reconnecting...');
    });
  }

  async create(session: UserSession): Promise<UserSession> {
    try {
      const sessionKey = this.getSessionKey(session.id);
      const userSessionsKey = this.getUserSessionsKey(session.userId || 'anonymous');
      
      const sessionData = JSON.stringify({
        ...session,
        createdAt: session.createdAt.toISOString(),
        lastActivity: session.lastActivity.toISOString(),
        expiresAt: session.expiresAt?.toISOString()
      });

      // Use pipeline for atomic operations
      const pipeline = this.redis.pipeline();
      
      // Store session data with TTL
      pipeline.setex(sessionKey, this.config.ttl, sessionData);
      
      // Add session ID to user's session set
      if (session.userId) {
        pipeline.sadd(userSessionsKey, session.id);
        pipeline.expire(userSessionsKey, this.config.ttl);
      }

      await pipeline.exec();

      this.logger.debug('Session created in Redis', {
        sessionId: session.id,
        userId: session.userId,
        ttl: this.config.ttl
      });

      return session;

    } catch (error) {
      this.logger.error('Failed to create session in Redis', {
        sessionId: session.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async get(sessionId: string): Promise<UserSession | null> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      const sessionData = await this.redis.get(sessionKey);

      if (!sessionData) {
        this.logger.debug('Session not found in Redis', { sessionId });
        return null;
      }

      const parsedSession = JSON.parse(sessionData);
      
      // Convert date strings back to Date objects
      const session: UserSession = {
        ...parsedSession,
        createdAt: new Date(parsedSession.createdAt),
        lastActivity: new Date(parsedSession.lastActivity),
        expiresAt: parsedSession.expiresAt ? new Date(parsedSession.expiresAt) : undefined
      };

      // Update TTL on access
      await this.redis.expire(sessionKey, this.config.ttl);

      this.logger.debug('Session retrieved from Redis', { sessionId });
      return session;

    } catch (error) {
      this.logger.error('Failed to get session from Redis', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async update(sessionId: string, updates: Partial<UserSession>): Promise<UserSession | null> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      
      // Get current session
      const currentSession = await this.get(sessionId);
      if (!currentSession) {
        this.logger.debug('Session not found for update in Redis', { sessionId });
        return null;
      }

      // Merge updates
      const updatedSession: UserSession = {
        ...currentSession,
        ...updates,
        lastActivity: new Date()
      };

      // Store updated session
      const sessionData = JSON.stringify({
        ...updatedSession,
        createdAt: updatedSession.createdAt.toISOString(),
        lastActivity: updatedSession.lastActivity.toISOString(),
        expiresAt: updatedSession.expiresAt?.toISOString()
      });

      await this.redis.setex(sessionKey, this.config.ttl, sessionData);

      this.logger.debug('Session updated in Redis', {
        sessionId,
        updateKeys: Object.keys(updates)
      });

      return updatedSession;

    } catch (error) {
      this.logger.error('Failed to update session in Redis', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async delete(sessionId: string): Promise<boolean> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      
      // Get session to find user ID for cleanup
      const session = await this.get(sessionId);
      
      const pipeline = this.redis.pipeline();
      
      // Delete session
      pipeline.del(sessionKey);
      
      // Remove from user's session set if user ID exists
      if (session?.userId) {
        const userSessionsKey = this.getUserSessionsKey(session.userId);
        pipeline.srem(userSessionsKey, sessionId);
      }

      const results = await pipeline.exec();
      const deleted = results?.[0]?.[1] as number > 0;

      if (deleted) {
        this.logger.debug('Session deleted from Redis', { sessionId });
      }

      return deleted;

    } catch (error) {
      this.logger.error('Failed to delete session from Redis', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getUserSessions(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      activeOnly?: boolean;
    }
  ): Promise<UserSession[]> {
    try {
      const userSessionsKey = this.getUserSessionsKey(userId);
      
      // Get all session IDs for the user
      const sessionIds = await this.redis.smembers(userSessionsKey);
      
      if (sessionIds.length === 0) {
        return [];
      }

      // Apply pagination
      const offset = options?.offset || 0;
      const limit = options?.limit || sessionIds.length;
      const paginatedIds = sessionIds.slice(offset, offset + limit);

      // Get all sessions in parallel
      const sessionPromises = paginatedIds.map(id => this.get(id));
      const sessions = await Promise.all(sessionPromises);

      // Filter out null sessions and apply activeOnly filter
      let validSessions = sessions.filter((session): session is UserSession => 
        session !== null
      );

      if (options?.activeOnly) {
        const now = new Date();
        validSessions = validSessions.filter(session => 
          !session.expiresAt || session.expiresAt > now
        );
      }

      // Sort by last activity (newest first)
      validSessions.sort((a, b) => 
        b.lastActivity.getTime() - a.lastActivity.getTime()
      );

      this.logger.debug('Retrieved user sessions from Redis', {
        userId,
        totalSessions: sessionIds.length,
        returnedSessions: validSessions.length,
        options
      });

      return validSessions;

    } catch (error) {
      this.logger.error('Failed to get user sessions from Redis', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async cleanup(): Promise<number> {
    try {
      this.logger.info('Starting Redis session cleanup');

      // Redis automatically handles TTL expiration, but we can clean up orphaned user session sets
      const pattern = `${this.USER_SESSIONS_KEY_PREFIX}*`;
      const userSessionKeys = await this.redis.keys(pattern);
      
      let cleanedCount = 0;

      for (const userSessionKey of userSessionKeys) {
        try {
          // Get all session IDs for this user
          const sessionIds = await this.redis.smembers(userSessionKey);
          
          // Check which sessions still exist
          const existingSessionIds: string[] = [];
          
          for (const sessionId of sessionIds) {
            const sessionKey = this.getSessionKey(sessionId);
            const exists = await this.redis.exists(sessionKey);
            
            if (exists) {
              existingSessionIds.push(sessionId);
            } else {
              cleanedCount++;
            }
          }

          // Update the user session set with only existing sessions
          if (existingSessionIds.length !== sessionIds.length) {
            const pipeline = this.redis.pipeline();
            pipeline.del(userSessionKey);
            
            if (existingSessionIds.length > 0) {
              pipeline.sadd(userSessionKey, ...existingSessionIds);
              pipeline.expire(userSessionKey, this.config.ttl);
            }
            
            await pipeline.exec();
          }

        } catch (error) {
          this.logger.warn('Error cleaning up user session set', {
            userSessionKey,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      this.logger.info('Redis session cleanup completed', { cleanedCount });
      return cleanedCount;

    } catch (error) {
      this.logger.error('Failed to cleanup sessions in Redis', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get session statistics from Redis
   */
  async getStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
    memoryUsage: number;
  }> {
    try {
      const pattern = `${this.SESSION_KEY_PREFIX}*`;
      const sessionKeys = await this.redis.keys(pattern);
      
      const totalSessions = sessionKeys.length;
      let activeSessions = 0;
      let expiredSessions = 0;

      // Check TTL for each session to determine if it's active
      for (const key of sessionKeys) {
        const ttl = await this.redis.ttl(key);
        if (ttl > 0) {
          activeSessions++;
        } else if (ttl === -2) {
          expiredSessions++;
        }
      }

      // Get memory usage
      const memoryInfo = await this.redis.memory('usage', this.config.keyPrefix);
      const memoryUsage = typeof memoryInfo === 'number' ? memoryInfo : 0;

      return {
        totalSessions,
        activeSessions,
        expiredSessions,
        memoryUsage
      };

    } catch (error) {
      this.logger.error('Failed to get Redis session stats', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        totalSessions: 0,
        activeSessions: 0,
        expiredSessions: 0,
        memoryUsage: 0
      };
    }
  }

  /**
   * Extend session TTL
   */
  async extendSession(sessionId: string, additionalSeconds: number): Promise<boolean> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      const currentTtl = await this.redis.ttl(sessionKey);
      
      if (currentTtl <= 0) {
        return false; // Session doesn't exist or already expired
      }

      const newTtl = currentTtl + additionalSeconds;
      const result = await this.redis.expire(sessionKey, newTtl);

      this.logger.debug('Session TTL extended', {
        sessionId,
        previousTtl: currentTtl,
        newTtl,
        additionalSeconds
      });

      return result === 1;

    } catch (error) {
      this.logger.error('Failed to extend session TTL', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Bulk operations for better performance
   */
  async bulkGet(sessionIds: string[]): Promise<(UserSession | null)[]> {
    try {
      if (sessionIds.length === 0) {
        return [];
      }

      const sessionKeys = sessionIds.map(id => this.getSessionKey(id));
      const sessionDataArray = await this.redis.mget(...sessionKeys);

      const sessions = sessionDataArray.map((sessionData, index) => {
        if (!sessionData) {
          return null;
        }

        try {
          const parsedSession = JSON.parse(sessionData);
          return {
            ...parsedSession,
            createdAt: new Date(parsedSession.createdAt),
            lastActivity: new Date(parsedSession.lastActivity),
            expiresAt: parsedSession.expiresAt ? new Date(parsedSession.expiresAt) : undefined
          } as UserSession;
        } catch (parseError) {
          this.logger.warn('Failed to parse session data', {
            sessionId: sessionIds[index],
            error: parseError
          });
          return null;
        }
      });

      // Update TTL for accessed sessions
      const pipeline = this.redis.pipeline();
      sessionKeys.forEach(key => {
        pipeline.expire(key, this.config.ttl);
      });
      await pipeline.exec();

      return sessions;

    } catch (error) {
      this.logger.error('Failed to bulk get sessions from Redis', {
        sessionCount: sessionIds.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Search sessions by pattern
   */
  async searchSessions(pattern: string, limit: number = 100): Promise<UserSession[]> {
    try {
      const searchPattern = `${this.SESSION_KEY_PREFIX}*${pattern}*`;
      const keys = await this.redis.keys(searchPattern);
      
      const limitedKeys = keys.slice(0, limit);
      const sessionIds = limitedKeys.map(key => 
        key.replace(this.SESSION_KEY_PREFIX, '')
      );

      return await this.bulkGet(sessionIds).then(sessions => 
        sessions.filter((session): session is UserSession => session !== null)
      );

    } catch (error) {
      this.logger.error('Failed to search sessions in Redis', {
        pattern,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Health check for Redis connection
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    latency: number;
    memoryUsage: number;
    connectedClients: number;
  }> {
    try {
      const start = Date.now();
      await this.redis.ping();
      const latency = Date.now() - start;

      const info = await this.redis.info('memory');
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const memoryUsage = memoryMatch ? parseInt(memoryMatch[1]) : 0;

      const clientsInfo = await this.redis.info('clients');
      const clientsMatch = clientsInfo.match(/connected_clients:(\d+)/);
      const connectedClients = clientsMatch ? parseInt(clientsMatch[1]) : 0;

      return {
        status: 'healthy',
        latency,
        memoryUsage,
        connectedClients
      };

    } catch (error) {
      this.logger.error('Redis health check failed', error);
      return {
        status: 'unhealthy',
        latency: -1,
        memoryUsage: 0,
        connectedClients: 0
      };
    }
  }

  /**
   * Private helper methods
   */
  private getSessionKey(sessionId: string): string {
    return `${this.SESSION_KEY_PREFIX}${sessionId}`;
  }

  private getUserSessionsKey(userId: string): string {
    return `${this.USER_SESSIONS_KEY_PREFIX}${userId}`;
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    try {
      await this.redis.quit();
      this.logger.info('Redis connection closed');
    } catch (error) {
      this.logger.error('Error closing Redis connection', error);
    }
  }
}
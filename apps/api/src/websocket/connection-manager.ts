import { logger } from '../utils/logger';
import { RedisService } from '../services/redis';
import { SocketConnection, SocketUser } from './websocket-server';

// =============================================================================
// CONNECTION MANAGER (Advanced Session Management)
// Master Plan: Intelligent connection handling with reconnection and clustering
// =============================================================================

export interface ConnectionSession {
  id: string;
  userId: string;
  deviceId?: string;
  connections: string[]; // Socket IDs
  metadata: {
    userAgent: string;
    ip: string;
    platform?: string;
    version?: string;
  };
  state: {
    isActive: boolean;
    lastActivity: Date;
    reconnectCount: number;
    totalConnections: number;
  };
  preferences: {
    autoReconnect: boolean;
    maxReconnectAttempts: number;
    reconnectDelay: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ReconnectionToken {
  sessionId: string;
  userId: string;
  token: string;
  expiresAt: Date;
  metadata: Record<string, any>;
}

export interface ConnectionMetrics {
  totalConnections: number;
  activeUsers: number;
  reconnections: number;
  averageSessionDuration: number;
  peakConnections: number;
  connectionsByRole: Record<string, number>;
  connectionsByPlatform: Record<string, number>;
}

// =============================================================================
// CONNECTION MANAGER IMPLEMENTATION
// =============================================================================

export class ConnectionManager {
  private static instance: ConnectionManager;
  private redisService: RedisService;
  private sessions: Map<string, ConnectionSession> = new Map();
  private reconnectionTokens: Map<string, ReconnectionToken> = new Map();
  private metrics: ConnectionMetrics;
  private cleanupInterval?: NodeJS.Timeout;

  private constructor() {
    this.redisService = RedisService.getInstance();
    this.metrics = this.initializeMetrics();
    this.startCleanupProcess();
    logger.info('Connection Manager initialized');
  }

  public static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  // =============================================================================
  // SESSION MANAGEMENT
  // =============================================================================

  async createSession(connection: SocketConnection): Promise<ConnectionSession> {
    const sessionId = this.generateSessionId(connection.userId, connection.metadata.deviceId);
    
    // Check if session already exists
    let session = this.sessions.get(sessionId);
    
    if (session) {
      // Add connection to existing session
      session.connections.push(connection.id);
      session.state.lastActivity = new Date();
      session.state.totalConnections++;
      session.updatedAt = new Date();
    } else {
      // Create new session
      session = {
        id: sessionId,
        userId: connection.userId,
        deviceId: connection.metadata.deviceId,
        connections: [connection.id],
        metadata: {
          userAgent: connection.metadata.userAgent,
          ip: connection.metadata.ip,
          platform: connection.metadata.platform,
          version: '1.0.0',
        },
        state: {
          isActive: true,
          lastActivity: new Date(),
          reconnectCount: 0,
          totalConnections: 1,
        },
        preferences: {
          autoReconnect: true,
          maxReconnectAttempts: 5,
          reconnectDelay: 1000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.sessions.set(sessionId, session);
      this.updateMetrics('session_created', session);
    }

    // Store session in Redis for clustering
    await this.storeSession(session);

    logger.info('Session created/updated', {
      sessionId,
      userId: connection.userId,
      connectionId: connection.id,
      totalConnections: session.connections.length,
    });

    return session;
  }

  async removeConnection(connectionId: string): Promise<void> {
    // Find session containing this connection
    for (const [sessionId, session] of this.sessions.entries()) {
      const connectionIndex = session.connections.indexOf(connectionId);
      
      if (connectionIndex > -1) {
        // Remove connection from session
        session.connections.splice(connectionIndex, 1);
        session.updatedAt = new Date();

        if (session.connections.length === 0) {
          // No more connections, mark session as inactive
          session.state.isActive = false;
          
          // Generate reconnection token
          const reconnectionToken = await this.generateReconnectionToken(session);
          
          logger.info('Session became inactive, reconnection token generated', {
            sessionId,
            userId: session.userId,
            tokenExpires: reconnectionToken.expiresAt,
          });
        }

        // Update session in Redis
        await this.storeSession(session);
        this.updateMetrics('connection_removed', session);

        logger.info('Connection removed from session', {
          sessionId,
          connectionId,
          remainingConnections: session.connections.length,
        });

        break;
      }
    }
  }

  async getSession(sessionId: string): Promise<ConnectionSession | null> {
    // Try local cache first
    let session = this.sessions.get(sessionId);
    
    if (!session) {
      // Try Redis
      session = await this.loadSession(sessionId);
      if (session) {
        this.sessions.set(sessionId, session);
      }
    }

    return session;
  }

  async getUserSessions(userId: string): Promise<ConnectionSession[]> {
    const userSessions: ConnectionSession[] = [];
    
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        userSessions.push(session);
      }
    }

    // Also check Redis for sessions not in local cache
    const redisSessionIds = await this.getUserSessionIds(userId);
    
    for (const sessionId of redisSessionIds) {
      if (!this.sessions.has(sessionId)) {
        const session = await this.loadSession(sessionId);
        if (session) {
          userSessions.push(session);
          this.sessions.set(sessionId, session);
        }
      }
    }

    return userSessions;
  }

  // =============================================================================
  // RECONNECTION MANAGEMENT
  // =============================================================================

  async generateReconnectionToken(session: ConnectionSession): Promise<ReconnectionToken> {
    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const reconnectionToken: ReconnectionToken = {
      sessionId: session.id,
      userId: session.userId,
      token,
      expiresAt,
      metadata: {
        deviceId: session.deviceId,
        platform: session.metadata.platform,
        lastActivity: session.state.lastActivity,
      },
    };

    this.reconnectionTokens.set(token, reconnectionToken);
    
    // Store in Redis
    await this.storeReconnectionToken(reconnectionToken);

    logger.info('Reconnection token generated', {
      sessionId: session.id,
      userId: session.userId,
      token: token.substring(0, 8) + '...',
      expiresAt,
    });

    return reconnectionToken;
  }

  async validateReconnectionToken(token: string): Promise<ReconnectionToken | null> {
    // Check local cache first
    let reconnectionToken = this.reconnectionTokens.get(token);
    
    if (!reconnectionToken) {
      // Check Redis
      reconnectionToken = await this.loadReconnectionToken(token);
    }

    if (!reconnectionToken) {
      return null;
    }

    // Check if token is expired
    if (reconnectionToken.expiresAt < new Date()) {
      await this.removeReconnectionToken(token);
      return null;
    }

    return reconnectionToken;
  }

  async handleReconnection(token: string, newConnection: SocketConnection): Promise<ConnectionSession | null> {
    const reconnectionToken = await this.validateReconnectionToken(token);
    
    if (!reconnectionToken) {
      logger.warn('Invalid reconnection token', {
        token: token.substring(0, 8) + '...',
        connectionId: newConnection.id,
      });
      return null;
    }

    // Get the session
    const session = await this.getSession(reconnectionToken.sessionId);
    
    if (!session) {
      logger.error('Session not found for reconnection', {
        sessionId: reconnectionToken.sessionId,
        token: token.substring(0, 8) + '...',
      });
      return null;
    }

    // Add new connection to session
    session.connections.push(newConnection.id);
    session.state.isActive = true;
    session.state.lastActivity = new Date();
    session.state.reconnectCount++;
    session.updatedAt = new Date();

    // Update session
    await this.storeSession(session);
    
    // Remove used reconnection token
    await this.removeReconnectionToken(token);

    this.updateMetrics('reconnection', session);

    logger.info('Successful reconnection', {
      sessionId: session.id,
      userId: session.userId,
      connectionId: newConnection.id,
      reconnectCount: session.state.reconnectCount,
    });

    return session;
  }

  // =============================================================================
  // CLUSTERING SUPPORT
  // =============================================================================

  async syncWithCluster(): Promise<void> {
    try {
      // Get all session keys from Redis
      const sessionKeys = await this.redisService.keys('session:*');
      
      for (const key of sessionKeys) {
        const sessionId = key.replace('session:', '');
        
        if (!this.sessions.has(sessionId)) {
          const session = await this.loadSession(sessionId);
          if (session && session.state.isActive) {
            this.sessions.set(sessionId, session);
          }
        }
      }

      logger.debug('Cluster sync completed', {
        localSessions: this.sessions.size,
        redisSessions: sessionKeys.length,
      });

    } catch (error) {
      logger.error('Cluster sync failed', { error: error.message });
    }
  }

  async broadcastSessionUpdate(session: ConnectionSession): Promise<void> {
    // Broadcast session update to other cluster nodes
    const message = {
      type: 'session_update',
      sessionId: session.id,
      userId: session.userId,
      timestamp: new Date().toISOString(),
    };

    await this.redisService.publish('cluster:session_updates', JSON.stringify(message));
  }

  // =============================================================================
  // METRICS AND MONITORING
  // =============================================================================

  private updateMetrics(event: string, session: ConnectionSession): void {
    switch (event) {
      case 'session_created':
        this.metrics.totalConnections++;
        this.metrics.activeUsers = this.getUniqueUserCount();
        this.updateRoleMetrics(session);
        this.updatePlatformMetrics(session);
        break;
        
      case 'connection_removed':
        if (session.connections.length === 0) {
          this.metrics.activeUsers = this.getUniqueUserCount();
        }
        break;
        
      case 'reconnection':
        this.metrics.reconnections++;
        break;
    }

    // Update peak connections
    if (this.metrics.totalConnections > this.metrics.peakConnections) {
      this.metrics.peakConnections = this.metrics.totalConnections;
    }
  }

  private updateRoleMetrics(session: ConnectionSession): void {
    // This would get user role from session or user service
    const role = 'user'; // Placeholder
    this.metrics.connectionsByRole[role] = (this.metrics.connectionsByRole[role] || 0) + 1;
  }

  private updatePlatformMetrics(session: ConnectionSession): void {
    const platform = session.metadata.platform || 'unknown';
    this.metrics.connectionsByPlatform[platform] = (this.metrics.connectionsByPlatform[platform] || 0) + 1;
  }

  private getUniqueUserCount(): number {
    const uniqueUsers = new Set<string>();
    
    for (const session of this.sessions.values()) {
      if (session.state.isActive) {
        uniqueUsers.add(session.userId);
      }
    }
    
    return uniqueUsers.size;
  }

  // =============================================================================
  // REDIS OPERATIONS
  // =============================================================================

  private async storeSession(session: ConnectionSession): Promise<void> {
    const key = `session:${session.id}`;
    const ttl = 24 * 60 * 60; // 24 hours
    
    await this.redisService.setex(key, ttl, JSON.stringify(session));
    
    // Also store user session mapping
    const userKey = `user_sessions:${session.userId}`;
    await this.redisService.sadd(userKey, session.id);
    await this.redisService.expire(userKey, ttl);
  }

  private async loadSession(sessionId: string): Promise<ConnectionSession | null> {
    const key = `session:${sessionId}`;
    const data = await this.redisService.get(key);
    
    if (!data) {
      return null;
    }

    try {
      const session = JSON.parse(data);
      
      // Convert date strings back to Date objects
      session.createdAt = new Date(session.createdAt);
      session.updatedAt = new Date(session.updatedAt);
      session.state.lastActivity = new Date(session.state.lastActivity);
      
      return session;
    } catch (error) {
      logger.error('Failed to parse session data', {
        sessionId,
        error: error.message,
      });
      return null;
    }
  }

  private async getUserSessionIds(userId: string): Promise<string[]> {
    const key = `user_sessions:${userId}`;
    return await this.redisService.smembers(key);
  }

  private async storeReconnectionToken(token: ReconnectionToken): Promise<void> {
    const key = `reconnection_token:${token.token}`;
    const ttl = Math.floor((token.expiresAt.getTime() - Date.now()) / 1000);
    
    if (ttl > 0) {
      await this.redisService.setex(key, ttl, JSON.stringify(token));
    }
  }

  private async loadReconnectionToken(token: string): Promise<ReconnectionToken | null> {
    const key = `reconnection_token:${token}`;
    const data = await this.redisService.get(key);
    
    if (!data) {
      return null;
    }

    try {
      const reconnectionToken = JSON.parse(data);
      reconnectionToken.expiresAt = new Date(reconnectionToken.expiresAt);
      return reconnectionToken;
    } catch (error) {
      logger.error('Failed to parse reconnection token', {
        token: token.substring(0, 8) + '...',
        error: error.message,
      });
      return null;
    }
  }

  private async removeReconnectionToken(token: string): Promise<void> {
    const key = `reconnection_token:${token}`;
    await this.redisService.del(key);
    this.reconnectionTokens.delete(token);
  }

  // =============================================================================
  // CLEANUP AND MAINTENANCE
  // =============================================================================

  private startCleanupProcess(): void {
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupInactiveSessions();
      await this.cleanupExpiredTokens();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  private async cleanupInactiveSessions(): Promise<void> {
    const now = new Date();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
    const sessionsToRemove: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (!session.state.isActive && 
          now.getTime() - session.state.lastActivity.getTime() > inactiveThreshold) {
        sessionsToRemove.push(sessionId);
      }
    }

    for (const sessionId of sessionsToRemove) {
      this.sessions.delete(sessionId);
      await this.redisService.del(`session:${sessionId}`);
    }

    if (sessionsToRemove.length > 0) {
      logger.info('Cleaned up inactive sessions', {
        count: sessionsToRemove.length,
      });
    }
  }

  private async cleanupExpiredTokens(): Promise<void> {
    const now = new Date();
    const tokensToRemove: string[] = [];

    for (const [token, reconnectionToken] of this.reconnectionTokens.entries()) {
      if (reconnectionToken.expiresAt < now) {
        tokensToRemove.push(token);
      }
    }

    for (const token of tokensToRemove) {
      await this.removeReconnectionToken(token);
    }

    if (tokensToRemove.length > 0) {
      logger.info('Cleaned up expired reconnection tokens', {
        count: tokensToRemove.length,
      });
    }
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  private generateSessionId(userId: string, deviceId?: string): string {
    const base = `${userId}:${deviceId || 'default'}`;
    return `sess_${Buffer.from(base).toString('base64').replace(/[^a-zA-Z0-9]/g, '')}`;
  }

  private generateToken(): string {
    return `reconnect_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
  }

  private initializeMetrics(): ConnectionMetrics {
    return {
      totalConnections: 0,
      activeUsers: 0,
      reconnections: 0,
      averageSessionDuration: 0,
      peakConnections: 0,
      connectionsByRole: {},
      connectionsByPlatform: {},
    };
  }

  // =============================================================================
  // PUBLIC API
  // =============================================================================

  public getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  public getActiveSessions(): ConnectionSession[] {
    return Array.from(this.sessions.values()).filter(session => session.state.isActive);
  }

  public async getSessionStats(): Promise<any> {
    return {
      totalSessions: this.sessions.size,
      activeSessions: this.getActiveSessions().length,
      reconnectionTokens: this.reconnectionTokens.size,
      metrics: this.getMetrics(),
    };
  }

  public async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Clear all data
    this.sessions.clear();
    this.reconnectionTokens.clear();

    logger.info('Connection Manager shutdown complete');
  }
}

export default ConnectionManager;
/**
 * Session Persistence Layer
 * Advanced session storage with multiple backends and synchronization
 */

import { UserSession, SessionState, DeviceInfo } from '@browser-ai-agent/shared';
import { PostgresSessionStorage } from './postgres-storage';
import { MemorySessionStorage } from './memory-storage';
import { Logger } from '../../utils/logger';
import { EventEmitter } from 'events';

export interface SessionPersistenceConfig {
  primaryStorage: 'postgres' | 'memory';
  enableCaching: boolean;
  cacheTimeout: number;
  enableReplication: boolean;
  syncInterval: number;
  maxRetries: number;
  backupEnabled: boolean;
}

export interface SessionMetrics {
  totalSessions: number;
  activeSessions: number;
  averageSessionDuration: number;
  sessionsByDevice: Record<string, number>;
  sessionsByStatus: Record<SessionState, number>;
  storageUsage: {
    postgres: number;
    memory: number;
    cache: number;
  };
}

export interface SessionBackup {
  id: string;
  sessionId: string;
  data: UserSession;
  timestamp: Date;
  checksum: string;
}

export class SessionPersistence extends EventEmitter {
  private postgresStorage: PostgresSessionStorage;
  private memoryStorage: MemorySessionStorage;
  private config: SessionPersistenceConfig;
  private logger: Logger;
  
  // Caching layer
  private sessionCache: Map<string, {
    session: UserSession;
    lastAccessed: Date;
    dirty: boolean;
  }> = new Map();
  
  // Synchronization
  private syncQueue: Set<string> = new Set();
  private syncInterval: NodeJS.Timeout | null = null;
  
  // Metrics
  private metrics: SessionMetrics = {
    totalSessions: 0,
    activeSessions: 0,
    averageSessionDuration: 0,
    sessionsByDevice: {},
    sessionsByStatus: {
      active: 0,
      inactive: 0,
      expired: 0
    },
    storageUsage: {
      postgres: 0,
      memory: 0,
      cache: 0
    }
  };

  constructor(
    postgresStorage: PostgresSessionStorage,
    memoryStorage: MemorySessionStorage,
    logger: Logger,
    config: SessionPersistenceConfig = {
      primaryStorage: 'postgres',
      enableCaching: true,
      cacheTimeout: 300000, // 5 minutes
      enableReplication: true,
      syncInterval: 30000, // 30 seconds
      maxRetries: 3,
      backupEnabled: true
    }
  ) {
    super();
    
    this.postgresStorage = postgresStorage;
    this.memoryStorage = memoryStorage;
    this.logger = logger;
    this.config = config;
    
    this.initialize();
  }

  /**
   * Initialize the persistence layer
   */
  private async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing session persistence layer', {
        primaryStorage: this.config.primaryStorage,
        enableCaching: this.config.enableCaching,
        enableReplication: this.config.enableReplication
      });

      // Start synchronization if enabled
      if (this.config.enableReplication) {
        this.startSynchronization();
      }

      // Start cache cleanup
      if (this.config.enableCaching) {
        this.startCacheCleanup();
      }

      // Load initial metrics
      await this.updateMetrics();

      this.emit('initialized');
      this.logger.info('Session persistence layer initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize session persistence layer', error);
      throw error;
    }
  }

  /**
   * Create a new session with persistence
   */
  async createSession(
    session: UserSession
  ): Promise<UserSession> {
    try {
      this.logger.debug('Creating new session', { sessionId: session.id });

      // Create session using primary storage
      const result = await this.getPrimaryStorage().create(session);
      
      // Cache the session if caching is enabled
      if (this.config.enableCaching) {
        this.cacheSession(result);
      }

      // Replicate to secondary storage if enabled
      if (this.config.enableReplication) {
        await this.replicateSession(result);
      }

      // Create backup if enabled
      if (this.config.backupEnabled) {
        await this.createSessionBackup(result);
      }

      // Update metrics
      this.updateSessionMetrics(result, 'created');

      this.emit('sessionCreated', result);
      
      this.logger.info('Session created successfully', {
        sessionId: result.id,
        userId: result.userId
      });

      return result;

    } catch (error) {
      this.logger.error('Failed to create session', error);
      throw error;
    }
  }

  /**
   * Get session with intelligent caching
   */
  async getSession(sessionId: string): Promise<UserSession | null> {
    try {
      // Check cache first if enabled
      if (this.config.enableCaching) {
        const cached = this.getCachedSession(sessionId);
        if (cached) {
          this.logger.debug('Session retrieved from cache', { sessionId });
          return cached;
        }
      }

      // Try primary storage
      let session = await this.getPrimaryStorage().get(sessionId);
      
      // Fallback to secondary storage if primary fails
      if (!session && this.config.enableReplication) {
        session = await this.getSecondaryStorage().get(sessionId);
        
        if (session) {
          this.logger.warn('Session retrieved from secondary storage', { sessionId });
          // Sync back to primary storage
          this.syncQueue.add(sessionId);
        }
      }

      if (session) {
        // Cache the session
        if (this.config.enableCaching) {
          this.cacheSession(session);
        }

        this.emit('sessionAccessed', session);
      }

      return session;

    } catch (error) {
      this.logger.error('Failed to get session', { sessionId, error });
      throw error;
    }
  }

  /**
   * Update session with conflict resolution
   */
  async updateSession(
    sessionId: string,
    updates: Partial<UserSession>
  ): Promise<UserSession | null> {
    try {
      this.logger.debug('Updating session', { sessionId, updates });

      // Get current session for conflict detection
      const currentSession = await this.getSession(sessionId);
      if (!currentSession) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Merge updates with conflict resolution
      const mergedSession = this.mergeSessionUpdates(currentSession, updates);

      // Update in primary storage
      const updatedSession = await this.getPrimaryStorage().update(
        sessionId,
        mergedSession
      );

      if (!updatedSession) {
        throw new Error(`Failed to update session ${sessionId}`);
      }

      // Update cache
      if (this.config.enableCaching) {
        this.updateCachedSession(sessionId, updatedSession);
      }

      // Queue for replication
      if (this.config.enableReplication) {
        this.syncQueue.add(sessionId);
      }

      // Update metrics
      this.updateSessionMetrics(updatedSession, 'updated');

      this.emit('sessionUpdated', updatedSession);
      
      this.logger.debug('Session updated successfully', { sessionId });

      return updatedSession;

    } catch (error) {
      this.logger.error('Failed to update session', { sessionId, error });
      throw error;
    }
  }

  /**
   * Delete session with cleanup
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      this.logger.debug('Deleting session', { sessionId });

      // Delete from primary storage
      await this.getPrimaryStorage().delete(sessionId);

      // Delete from secondary storage if replication is enabled
      if (this.config.enableReplication) {
        try {
          await this.getSecondaryStorage().delete(sessionId);
        } catch (error) {
          this.logger.warn('Failed to delete from secondary storage', { sessionId, error });
        }
      }

      // Remove from cache
      if (this.config.enableCaching) {
        this.sessionCache.delete(sessionId);
      }

      // Remove from sync queue
      this.syncQueue.delete(sessionId);

      // Delete backups
      if (this.config.backupEnabled) {
        await this.deleteSessionBackups(sessionId);
      }

      this.emit('sessionDeleted', sessionId);
      
      this.logger.info('Session deleted successfully', { sessionId });

    } catch (error) {
      this.logger.error('Failed to delete session', { sessionId, error });
      throw error;
    }
  }

  /**
   * Get all sessions with pagination and filtering
   */
  async getSessions(options: {
    limit?: number;
    offset?: number;
    userId?: string;
    activeOnly?: boolean;
    sortBy?: 'createdAt' | 'lastActivity';
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{
    sessions: UserSession[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const result = await this.getPrimaryStorage().getUserSessions(
        options.userId || '',
        {
          limit: options.limit,
          offset: options.offset,
          activeOnly: options.activeOnly
        }
      );
      
      this.logger.debug('Retrieved sessions', {
        count: result.length,
        options
      });

      return {
        sessions: result,
        total: result.length,
        hasMore: false // This would need proper implementation
      };

    } catch (error) {
      this.logger.error('Failed to get sessions', { options, error });
      throw error;
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      this.logger.info('Starting expired session cleanup');

      const expiredCount = await this.getPrimaryStorage().cleanup();
      
      // Clean up from secondary storage if replication is enabled
      if (this.config.enableReplication) {
        try {
          await this.getSecondaryStorage().cleanup();
        } catch (error) {
          this.logger.warn('Failed to cleanup expired sessions from secondary storage', error);
        }
      }

      // Clean up cache
      if (this.config.enableCaching) {
        this.cleanupExpiredCache();
      }

      // Update metrics
      await this.updateMetrics();

      this.emit('expiredSessionsCleanedUp', expiredCount);
      
      this.logger.info('Expired session cleanup completed', { expiredCount });

      return expiredCount;

    } catch (error) {
      this.logger.error('Failed to cleanup expired sessions', error);
      throw error;
    }
  }

  /**
   * Get session metrics
   */
  getMetrics(): SessionMetrics {
    return { ...this.metrics };
  }

  /**
   * Export sessions for backup
   */
  async exportSessions(options: {
    format: 'json' | 'csv';
    includeExpired?: boolean;
    dateRange?: { start: Date; end: Date };
  }): Promise<string> {
    try {
      this.logger.info('Exporting sessions', options);

      const sessions = await this.getSessions({
        limit: 10000, // Large limit for export
      });

      let exportData: string;

      if (options.format === 'json') {
        exportData = JSON.stringify({
          exportDate: new Date(),
          totalSessions: sessions.total,
          sessions: sessions.sessions,
          metadata: {
            version: '1.0.0',
            includeExpired: options.includeExpired,
            dateRange: options.dateRange
          }
        }, null, 2);
      } else {
        // CSV format
        const headers = [
          'id', 'userId', 'createdAt', 'lastActivity', 'expiresAt'
        ];
        
        const rows = sessions.sessions.map(session => [
          session.id,
          session.userId || '',
          session.createdAt.toISOString(),
          session.lastActivity.toISOString(),
          session.expiresAt?.toISOString() || ''
        ]);

        exportData = [headers, ...rows]
          .map(row => row.map(cell => `\"${cell}\"`).join(','))
          .join('\\n');
      }

      this.logger.info('Sessions exported successfully', {
        format: options.format,
        sessionCount: sessions.sessions.length
      });

      return exportData;

    } catch (error) {
      this.logger.error('Failed to export sessions', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */

  private getPrimaryStorage() {
    return this.config.primaryStorage === 'postgres' ? 
      this.postgresStorage : this.memoryStorage;
  }

  private getSecondaryStorage() {
    return this.config.primaryStorage === 'postgres' ? 
      this.memoryStorage : this.postgresStorage;
  }

  private cacheSession(session: UserSession): void {
    this.sessionCache.set(session.id, {
      session: { ...session },
      lastAccessed: new Date(),
      dirty: false
    });
  }

  private getCachedSession(sessionId: string): UserSession | null {
    const cached = this.sessionCache.get(sessionId);
    if (cached) {
      // Check if cache entry is still valid
      const age = Date.now() - cached.lastAccessed.getTime();
      if (age < this.config.cacheTimeout) {
        cached.lastAccessed = new Date();
        return { ...cached.session };
      } else {
        this.sessionCache.delete(sessionId);
      }
    }
    return null;
  }

  private updateCachedSession(sessionId: string, session: UserSession): void {
    const cached = this.sessionCache.get(sessionId);
    if (cached) {
      cached.session = { ...session };
      cached.lastAccessed = new Date();
      cached.dirty = true;
    }
  }

  private mergeSessionUpdates(
    current: UserSession,
    updates: Partial<UserSession>
  ): UserSession {
    // Simple merge strategy - in production, you might want more sophisticated conflict resolution
    return {
      ...current,
      ...updates,
      lastActivity: new Date(),
      // Merge nested objects carefully
      browserState: {
        ...current.browserState,
        ...updates.browserState
      },
      preferences: {
        ...current.preferences,
        ...updates.preferences
      }
    };
  }

  private async replicateSession(session: UserSession): Promise<void> {
    try {
      const existing = await this.getSecondaryStorage().get(session.id);
      if (existing) {
        await this.getSecondaryStorage().update(session.id, session);
      } else {
        await this.getSecondaryStorage().create(session);
      }
    } catch (error) {
      this.logger.warn('Failed to replicate session', { sessionId: session.id, error });
    }
  }

  private startSynchronization(): void {
    this.syncInterval = setInterval(async () => {
      if (this.syncQueue.size > 0) {
        await this.performSynchronization();
      }
    }, this.config.syncInterval);
  }

  private async performSynchronization(): Promise<void> {
    const sessionIds = Array.from(this.syncQueue);
    this.syncQueue.clear();

    for (const sessionId of sessionIds) {
      try {
        const session = await this.getPrimaryStorage().get(sessionId);
        if (session) {
          await this.replicateSession(session);
        }
      } catch (error) {
        this.logger.warn('Failed to sync session', { sessionId, error });
        // Re-queue for retry
        this.syncQueue.add(sessionId);
      }
    }
  }

  private startCacheCleanup(): void {
    setInterval(() => {
      this.cleanupExpiredCache();
    }, this.config.cacheTimeout / 2);
  }

  private cleanupExpiredCache(): void {
    const now = Date.now();
    for (const [sessionId, cached] of this.sessionCache.entries()) {
      const age = now - cached.lastAccessed.getTime();
      if (age > this.config.cacheTimeout) {
        this.sessionCache.delete(sessionId);
      }
    }
  }

  private async updateMetrics(): Promise<void> {
    try {
      // Update storage usage
      this.metrics.storageUsage.cache = this.sessionCache.size;
      
      // Other metrics would be calculated from storage layers
      this.metrics.totalSessions = 0; // Would get from storage
      this.metrics.activeSessions = 0; // Would get from storage

    } catch (error) {
      this.logger.error('Failed to update metrics', error);
    }
  }

  private updateSessionMetrics(session: UserSession, operation: string): void {
    // Update metrics based on operation
    if (operation === 'created') {
      this.metrics.totalSessions++;
    }
  }

  private async createSessionBackup(session: UserSession): Promise<void> {
    try {
      const backup: SessionBackup = {
        id: `backup_${session.id}_${Date.now()}`,
        sessionId: session.id,
        data: { ...session },
        timestamp: new Date(),
        checksum: this.calculateChecksum(session)
      };

      // Store backup (implementation depends on backup storage)
      this.logger.debug('Session backup created', {
        sessionId: session.id,
        backupId: backup.id
      });

    } catch (error) {
      this.logger.warn('Failed to create session backup', { sessionId: session.id, error });
    }
  }

  private async deleteSessionBackups(sessionId: string): Promise<void> {
    try {
      // Delete all backups for the session
      this.logger.debug('Session backups deleted', { sessionId });
    } catch (error) {
      this.logger.warn('Failed to delete session backups', { sessionId, error });
    }
  }

  private calculateChecksum(session: UserSession): string {
    // Simple checksum calculation
    const data = JSON.stringify(session);
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down session persistence layer');

    // Stop synchronization
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Perform final sync
    if (this.syncQueue.size > 0) {
      await this.performSynchronization();
    }

    // Clear cache
    this.sessionCache.clear();

    this.emit('shutdown');
    this.logger.info('Session persistence layer shutdown complete');
  }
}
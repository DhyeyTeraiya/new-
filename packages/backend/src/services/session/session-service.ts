import { 
  UserSession, 
  SessionCreateRequest, 
  DeviceInfo,
  UserPreferences 
} from '@browser-ai-agent/shared';
import { Logger } from 'winston';
import { createLogger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { SessionPersistence } from './session-persistence';
import { SessionSyncService } from './session-sync';
import { SessionAnalyticsService } from './session-analytics';
import { SessionExportService } from './session-export';
import { RedisSessionStorage } from './redis-storage';
import { EventEmitter } from 'events';

export interface SessionServiceConfig {
  defaultSessionTimeout: number;
  maxSessionsPerUser: number;
  cleanupInterval: number;
}

export interface SessionStorage {
  create(session: UserSession): Promise<UserSession>;
  get(sessionId: string): Promise<UserSession | null>;
  update(sessionId: string, updates: Partial<UserSession>): Promise<UserSession | null>;
  delete(sessionId: string): Promise<boolean>;
  getUserSessions(userId: string, options?: {
    limit?: number;
    offset?: number;
    activeOnly?: boolean;
  }): Promise<UserSession[]>;
  cleanup(): Promise<number>;
}

export class SessionService extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: SessionServiceConfig;
  private readonly storage: SessionStorage;
  private readonly cleanupTimer: NodeJS.Timeout;
  
  // Enhanced services
  private readonly persistence: SessionPersistence;
  private readonly syncService: SessionSyncService;
  private readonly analytics: SessionAnalyticsService;
  private readonly exportService: SessionExportService;
  private readonly redisStorage?: RedisSessionStorage;

  constructor(
    config: SessionServiceConfig, 
    storage: SessionStorage,
    persistence: SessionPersistence,
    syncService: SessionSyncService,
    analytics: SessionAnalyticsService,
    exportService: SessionExportService,
    redisStorage?: RedisSessionStorage
  ) {
    super();
    
    this.logger = createLogger('SessionService');
    this.config = config;
    this.storage = storage;
    this.persistence = persistence;
    this.syncService = syncService;
    this.analytics = analytics;
    this.exportService = exportService;
    this.redisStorage = redisStorage;

    // Start cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, config.cleanupInterval);

    this.setupEventHandlers();

    this.logger.info('Enhanced session service initialized', {
      defaultTimeout: config.defaultSessionTimeout,
      maxSessionsPerUser: config.maxSessionsPerUser,
      hasRedis: !!redisStorage,
      hasPersistence: !!persistence,
      hasSync: !!syncService
    });
  }

  /**
   * Create a new session
   */
  async createSession(request: SessionCreateRequest): Promise<UserSession> {
    const userId = request.userId || `anonymous-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.info('Creating session', {
      userId,
      deviceType: request.deviceInfo.type,
    });

    // Check session limit for user
    const existingSessions = await this.storage.getUserSessions(userId, { activeOnly: true });
    if (existingSessions.length >= this.config.maxSessionsPerUser) {
      // Clean up oldest session
      const oldestSession = existingSessions.sort((a, b) => 
        a.createdAt.getTime() - b.createdAt.getTime()
      )[0];
      
      await this.storage.delete(oldestSession.id);
      this.logger.info('Cleaned up oldest session due to limit', {
        userId,
        deletedSessionId: oldestSession.id,
      });
    }

    const now = new Date();
    const session: UserSession = {
      id: uuidv4(),
      userId,
      browserState: {
        currentTab: {
          id: 'initial-tab',
          url: 'about:blank',
          title: 'New Tab',
          active: true,
          status: 'complete',
        },
        tabs: [],
        window: {
          id: 'initial-window',
          width: request.deviceInfo.screenResolution.split('x')[0] ? 
            parseInt(request.deviceInfo.screenResolution.split('x')[0]) : 1920,
          height: request.deviceInfo.screenResolution.split('x')[1] ? 
            parseInt(request.deviceInfo.screenResolution.split('x')[1]) : 1080,
          left: 0,
          top: 0,
          focused: true,
          state: 'normal',
        },
      },
      conversationHistory: [],
      preferences: this.mergeWithDefaults(request.preferences),
      metadata: {
        source: 'extension',
        userAgent: `${request.deviceInfo.browser}/${request.deviceInfo.browserVersion}`,
        ipAddress: '0.0.0.0', // This would be set by the API layer
        device: request.deviceInfo,
      },
      createdAt: now,
      lastActivity: now,
      expiresAt: new Date(now.getTime() + this.config.defaultSessionTimeout),
    };

    const createdSession = await this.storage.create(session);
    
    this.logger.info('Session created successfully', {
      sessionId: createdSession.id,
      userId: createdSession.userId,
      expiresAt: createdSession.expiresAt,
    });

    return createdSession;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<UserSession | null> {
    this.logger.debug('Fetching session', { sessionId });

    const session = await this.storage.get(sessionId);
    
    if (!session) {
      this.logger.debug('Session not found', { sessionId });
      return null;
    }

    // Check if session is expired
    if (session.expiresAt < new Date()) {
      this.logger.info('Session expired, cleaning up', {
        sessionId,
        expiresAt: session.expiresAt,
      });
      
      await this.storage.delete(sessionId);
      return null;
    }

    // Update last activity
    await this.updateLastActivity(sessionId);

    return session;
  }

  /**
   * Update session
   */
  async updateSession(
    sessionId: string, 
    updates: Partial<UserSession>
  ): Promise<UserSession | null> {
    this.logger.debug('Updating session', {
      sessionId,
      updateKeys: Object.keys(updates),
    });

    // Update last activity
    updates.lastActivity = new Date();

    const updatedSession = await this.storage.update(sessionId, updates);
    
    if (updatedSession) {
      this.logger.debug('Session updated successfully', { sessionId });
    } else {
      this.logger.warn('Session not found for update', { sessionId });
    }

    return updatedSession;
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    this.logger.info('Deleting session', { sessionId });

    const deleted = await this.storage.delete(sessionId);
    
    if (deleted) {
      this.logger.info('Session deleted successfully', { sessionId });
    } else {
      this.logger.warn('Session not found for deletion', { sessionId });
    }

    return deleted;
  }

  /**
   * Extend session expiry
   */
  async extendSession(sessionId: string, extendByMinutes: number): Promise<UserSession | null> {
    this.logger.info('Extending session', {
      sessionId,
      extendByMinutes,
    });

    const session = await this.storage.get(sessionId);
    if (!session) {
      return null;
    }

    const newExpiryTime = new Date(session.expiresAt.getTime() + (extendByMinutes * 60 * 1000));
    
    return await this.storage.update(sessionId, {
      expiresAt: newExpiryTime,
      lastActivity: new Date(),
    });
  }

  /**
   * Get user sessions
   */
  async getUserSessions(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      activeOnly?: boolean;
    }
  ): Promise<UserSession[]> {
    this.logger.debug('Fetching user sessions', {
      userId,
      options,
    });

    return await this.storage.getUserSessions(userId, options);
  }

  /**
   * Update last activity timestamp
   */
  async updateLastActivity(sessionId: string): Promise<void> {
    await this.storage.update(sessionId, {
      lastActivity: new Date(),
    });
  }

  /**
   * Cleanup expired sessions
   */
  async cleanup(): Promise<number> {
    this.logger.debug('Running session cleanup');

    const cleanedCount = await this.storage.cleanup();
    
    if (cleanedCount > 0) {
      this.logger.info('Session cleanup completed', {
        cleanedSessions: cleanedCount,
      });
    }

    return cleanedCount;
  }

  /**
   * Get session statistics
   */
  async getStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
  }> {
    // This would need to be implemented in the storage layer
    // For now, return placeholder values
    return {
      totalSessions: 0,
      activeSessions: 0,
      expiredSessions: 0,
    };
  }

  /**
   * Get session analytics
   */
  async getSessionAnalytics(sessionId: string): Promise<any> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      return await this.analytics.analyzeSession(session);

    } catch (error) {
      this.logger.error('Failed to get session analytics', { sessionId, error });
      throw error;
    }
  }

  /**
   * Export session data
   */
  async exportSessionData(
    sessionIds: string[],
    options: any
  ): Promise<any> {
    try {
      const sessions: UserSession[] = [];
      
      for (const sessionId of sessionIds) {
        const session = await this.getSession(sessionId);
        if (session) {
          sessions.push(session);
        }
      }

      return await this.exportService.exportSessions(sessions, options);

    } catch (error) {
      this.logger.error('Failed to export session data', { sessionIds, error });
      throw error;
    }
  }

  /**
   * Import session data
   */
  async importSessionData(filePath: string, options: any): Promise<any> {
    try {
      return await this.exportService.importSessions(filePath, options);

    } catch (error) {
      this.logger.error('Failed to import session data', { filePath, error });
      throw error;
    }
  }

  /**
   * Synchronize session across devices
   */
  async synchronizeSession(
    sessionId: string,
    deviceId: string
  ): Promise<any> {
    try {
      return await this.syncService.synchronizeSession(sessionId, deviceId);

    } catch (error) {
      this.logger.error('Failed to synchronize session', { sessionId, deviceId, error });
      throw error;
    }
  }

  /**
   * Register device for sync
   */
  async registerDeviceForSync(deviceId: string, deviceInfo: DeviceInfo): Promise<void> {
    try {
      await this.syncService.registerDevice(deviceId, deviceInfo);

    } catch (error) {
      this.logger.error('Failed to register device for sync', { deviceId, error });
      throw error;
    }
  }

  /**
   * Get aggregated analytics
   */
  async getAggregatedAnalytics(query: any = {}): Promise<any> {
    try {
      return await this.analytics.getAggregatedAnalytics(query);

    } catch (error) {
      this.logger.error('Failed to get aggregated analytics', { query, error });
      throw error;
    }
  }

  /**
   * Get session metrics from persistence layer
   */
  getSessionMetrics(): any {
    return this.persistence.getMetrics();
  }

  /**
   * Get sync statistics
   */
  getSyncStats(): any {
    return this.syncService.getSyncStats();
  }

  /**
   * Health check for all session components
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: {
      storage: boolean;
      persistence: boolean;
      sync: boolean;
      analytics: boolean;
      redis?: boolean;
    };
    metrics: any;
  }> {
    const components = {
      storage: true,
      persistence: true,
      sync: true,
      analytics: true,
      redis: undefined as boolean | undefined
    };

    try {
      // Test storage
      await this.storage.get('health-check');
    } catch {
      components.storage = false;
    }

    // Test Redis if available
    if (this.redisStorage) {
      try {
        const redisHealth = await this.redisStorage.healthCheck();
        components.redis = redisHealth.status === 'healthy';
      } catch {
        components.redis = false;
      }
    }

    const healthyComponents = Object.values(components).filter(Boolean).length;
    const totalComponents = Object.values(components).filter(c => c !== undefined).length;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (healthyComponents === totalComponents) {
      status = 'healthy';
    } else if (healthyComponents >= totalComponents / 2) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      components,
      metrics: {
        sessionMetrics: this.getSessionMetrics(),
        syncStats: this.getSyncStats()
      }
    };
  }

  /**
   * Setup event handlers for enhanced services
   */
  private setupEventHandlers(): void {
    // Listen to persistence events
    this.persistence.on('sessionCreated', (session) => {
      this.emit('sessionCreated', session);
    });

    this.persistence.on('sessionUpdated', (session) => {
      this.emit('sessionUpdated', session);
    });

    this.persistence.on('sessionDeleted', (sessionId) => {
      this.emit('sessionDeleted', sessionId);
    });

    // Listen to sync events
    this.syncService.on('device_registered', (data) => {
      this.emit('deviceRegistered', data);
    });

    this.syncService.on('sync_events_broadcast', (data) => {
      this.emit('syncEventsBroadcast', data);
    });

    this.syncService.on('conflicts_resolved', (data) => {
      this.emit('conflictsResolved', data);
    });
  }

  /**
   * Shutdown service
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down enhanced session service');

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Shutdown enhanced services
    await Promise.all([
      this.persistence.shutdown(),
      this.syncService.shutdown(),
      this.redisStorage?.disconnect()
    ]);

    // Remove all listeners
    this.removeAllListeners();
    
    this.logger.info('Enhanced session service shutdown complete');
  }

  /**
   * Private helper methods
   */
  private mergeWithDefaults(preferences?: Partial<UserPreferences>): UserPreferences {
    const defaults: UserPreferences = {
      theme: 'light',
      language: 'en',
      automation: {
        autoConfirmLowRisk: false,
        showActionPreviews: true,
        defaultTimeout: 5000,
        takeScreenshots: true,
        highlightElements: true,
      },
      privacy: {
        storeHistory: true,
        shareAnalytics: false,
        dataRetentionDays: 30,
      },
      notifications: {
        desktop: true,
        browser: true,
        actionCompletion: true,
        errors: true,
      },
      ai: {
        responseStyle: 'conversational',
        explainActions: true,
        confidenceThreshold: 0.7,
        modelPreferences: {
          chat: 'primary',
          reasoning: 'complex',
          vision: 'vision',
          fast: 'primary',
        },
      },
    };

    if (!preferences) {
      return defaults;
    }

    return {
      theme: preferences.theme || defaults.theme,
      language: preferences.language || defaults.language,
      automation: {
        ...defaults.automation,
        ...preferences.automation,
      },
      privacy: {
        ...defaults.privacy,
        ...preferences.privacy,
      },
      notifications: {
        ...defaults.notifications,
        ...preferences.notifications,
      },
      ai: {
        ...defaults.ai,
        ...preferences.ai,
        modelPreferences: {
          ...defaults.ai.modelPreferences,
          ...preferences.ai?.modelPreferences,
        },
      },
    };
  }
}
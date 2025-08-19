/**
 * Enhanced Session Manager
 * Advanced session management with persistence, synchronization, and caching
 */

import { UserSession, DeviceInfo, SessionState } from '@browser-ai-agent/shared';
import { PostgresStorage } from './postgres-storage';
import { MemoryStorage } from './memory-storage';
import { Logger } from '../../utils/logger';
import { EventEmitter } from 'events';

export interface SessionConfig {
  maxSessions: number;
  sessionTimeout: number; // in milliseconds
  cleanupInterval: number; // in milliseconds
  enableRedisCache: boolean;
  enableCrossDeviceSync: boolean;
  maxSessionHistory: number;
}

export interface SessionMetrics {
  totalSessions: number;
  activeSessions: number;
  averageSessionDuration: number;
  sessionsCreatedToday: number;
  topDeviceTypes: Array<{ type: string; count: number }>;
  topBrowsers: Array<{ browser: string; count: number }>;
}

export interface SessionSyncData {
  sessionId: string;
  lastSyncTime: Date;
  changes: Array<{
    type: 'browser_state' | 'preferences' | 'conversation_history';
    data: any;
    timestamp: Date;
  }>;
}

export class EnhancedSessionManager extends EventEmitter {
  private postgresStorage: PostgresStorage;
  private memoryStorage: MemoryStorage;
  private logger: Logger;
  private config: SessionConfig;
  
  // Active session tracking
  private activeSessions: Map<string, {
    session: UserSession;
    lastActivity: Date;
    deviceConnections: Set<string>;
  }> = new Map();

  // Session synchronization
  private syncQueue: Map<string, SessionSyncData> = new Map();
  private syncInterval: NodeJS.Timeout | null = null;
  
  // Cleanup and maintenance
  private cleanupInterval: NodeJS.Timeout | null = null;
  private metricsCache: SessionMetrics | null = null;
  private metricsCacheExpiry: Date | null = null;

  constructor(
    postgresStorage: PostgresStorage,
    memoryStorage: MemoryStorage,
    logger: Logger,
    config: SessionConfig = {
      maxSessions: 10000,
      sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
      cleanupInterval: 60 * 60 * 1000, // 1 hour
      enableRedisCache: true,
      enableCrossDeviceSync: true,
      maxSessionHistory: 100
    }
  ) {
    super();
    
    this.postgresStorage = postgresStorage;
    this.memoryStorage = memoryStorage;
    this.logger = logger;
    this.config = config;

    this.startBackgroundTasks();
  }

  /**
   * Create new session with enhanced features
   */
  async createSession(
    deviceInfo: DeviceInfo,
    preferences?: any,
    userId?: string
  ): Promise<{ session: UserSession; token: string }> {
    try {
      this.logger.info('Creating enhanced session', {
        deviceType: deviceInfo.type,
        browser: deviceInfo.browser,
        userId
      });

      // Check session limits
      await this.enforceSessionLimits(userId);

      // Create base session
      const sessionId = this.generateSessionId();
      const token = this.generateToken();

      const session: UserSession = {
        id: sessionId,
        userId,
        deviceInfo,
        preferences: {
          theme: 'auto',
          language: 'en',
          notifications: true,
          autoSave: true,
          ...preferences
        },
        browserState: {
          currentTab: null,
          openTabs: [],
          history: [],
          bookmarks: []
        },
        conversationHistory: [],
        createdAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
        metadata: {
          version: '1.0.0',
          features: ['ai-chat', 'automation', 'data-extraction'],
          experiments: []
        }
      };

      // Store in both memory and database
      await this.memoryStorage.createSession(session, token);
      await this.postgresStorage.createSession(session, token);

      // Track active session
      this.activeSessions.set(sessionId, {
        session,
        lastActivity: new Date(),
        deviceConnections: new Set([this.generateConnectionId(deviceInfo)])
      });

      // Emit session created event
      this.emit('session_created', { session, token });

      this.logger.info('Enhanced session created successfully', {
        sessionId,
        userId,
        deviceType: deviceInfo.type
      });

      return { session, token };

    } catch (error) {
      this.logger.error('Error creating enhanced session', error);
      throw error;
    }
  }

  /**
   * Get session with caching and fallback
   */
  async getSession(sessionId: string): Promise<UserSession | null> {
    try {
      // Try memory first (fastest)
      let session = await this.memoryStorage.getSession(sessionId);
      
      if (session) {
        this.updateLastActivity(sessionId);
        return session;
      }

      // Fallback to database
      session = await this.postgresStorage.getSession(sessionId);
      
      if (session) {
        // Cache in memory for future requests
        await this.memoryStorage.updateSession(sessionId, session);
        this.updateLastActivity(sessionId);
        
        return session;
      }

      return null;

    } catch (error) {
      this.logger.error('Error getting session', error);
      return null;
    }
  }

  /**
   * Update session with synchronization
   */
  async updateSession(
    sessionId: string, 
    updates: Partial<UserSession>,
    syncAcrossDevices: boolean = true
  ): Promise<UserSession | null> {
    try {
      // Get current session
      const currentSession = await this.getSession(sessionId);
      if (!currentSession) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Merge updates
      const updatedSession: UserSession = {
        ...currentSession,
        ...updates,
        lastActivity: new Date()
      };

      // Update in memory and database
      await this.memoryStorage.updateSession(sessionId, updatedSession);
      await this.postgresStorage.updateSession(sessionId, updatedSession);

      // Update active session tracking
      const activeSession = this.activeSessions.get(sessionId);
      if (activeSession) {
        activeSession.session = updatedSession;
        activeSession.lastActivity = new Date();
      }

      // Queue for cross-device sync if enabled
      if (syncAcrossDevices && this.config.enableCrossDeviceSync) {
        this.queueForSync(sessionId, updates);
      }

      // Emit session updated event
      this.emit('session_updated', { sessionId, updates });

      this.logger.debug('Session updated successfully', {
        sessionId,
        updatedFields: Object.keys(updates)
      });

      return updatedSession;

    } catch (error) {
      this.logger.error('Error updating session', error);
      throw error;
    }
  }

  /**
   * Delete session with cleanup
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      this.logger.info('Deleting session', { sessionId });

      // Remove from active sessions
      this.activeSessions.delete(sessionId);

      // Remove from sync queue
      this.syncQueue.delete(sessionId);

      // Delete from storage
      await this.memoryStorage.deleteSession(sessionId);
      await this.postgresStorage.deleteSession(sessionId);

      // Emit session deleted event
      this.emit('session_deleted', { sessionId });

      this.logger.info('Session deleted successfully', { sessionId });

    } catch (error) {
      this.logger.error('Error deleting session', error);
      throw error;
    }
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId: string): Promise<UserSession[]> {
    try {
      const sessions = await this.postgresStorage.getUserSessions(userId);
      
      // Update last activity for active sessions
      sessions.forEach(session => {
        if (this.activeSessions.has(session.id)) {
          this.updateLastActivity(session.id);
        }
      });

      return sessions;

    } catch (error) {
      this.logger.error('Error getting user sessions', error);
      return [];
    }
  }

  /**
   * Synchronize session across devices
   */
  async synchronizeSession(sessionId: string, deviceId: string): Promise<SessionSyncData | null> {
    try {
      if (!this.config.enableCrossDeviceSync) {
        return null;
      }

      const syncData = this.syncQueue.get(sessionId);
      if (!syncData) {
        return null;
      }

      // Filter changes since last sync for this device
      const lastSyncTime = await this.getLastSyncTime(sessionId, deviceId);
      const relevantChanges = syncData.changes.filter(change => 
        change.timestamp > lastSyncTime
      );

      if (relevantChanges.length === 0) {
        return null;
      }

      // Update last sync time
      await this.updateLastSyncTime(sessionId, deviceId, new Date());

      return {
        sessionId,
        lastSyncTime: new Date(),
        changes: relevantChanges
      };

    } catch (error) {
      this.logger.error('Error synchronizing session', error);
      return null;
    }
  }

  /**
   * Get session metrics and analytics
   */
  async getSessionMetrics(forceRefresh: boolean = false): Promise<SessionMetrics> {
    try {
      // Return cached metrics if available and not expired
      if (!forceRefresh && this.metricsCache && this.metricsCacheExpiry && 
          new Date() < this.metricsCacheExpiry) {
        return this.metricsCache;
      }

      this.logger.debug('Calculating session metrics');

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Get metrics from database
      const [
        totalSessions,
        activeSessions,
        sessionsToday,
        deviceStats,
        browserStats,
        avgDuration
      ] = await Promise.all([
        this.postgresStorage.getTotalSessionCount(),
        this.getActiveSessionCount(),
        this.postgresStorage.getSessionCountSince(todayStart),
        this.postgresStorage.getDeviceTypeStats(),
        this.postgresStorage.getBrowserStats(),
        this.postgresStorage.getAverageSessionDuration()
      ]);

      const metrics: SessionMetrics = {
        totalSessions,
        activeSessions,
        averageSessionDuration: avgDuration,
        sessionsCreatedToday: sessionsToday,
        topDeviceTypes: deviceStats.slice(0, 5),
        topBrowsers: browserStats.slice(0, 5)
      };

      // Cache metrics for 5 minutes
      this.metricsCache = metrics;
      this.metricsCacheExpiry = new Date(Date.now() + 5 * 60 * 1000);

      return metrics;

    } catch (error) {
      this.logger.error('Error calculating session metrics', error);
      throw error;
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<{
    cleaned: number;
    errors: number;
  }> {
    try {
      this.logger.info('Starting session cleanup');

      const cutoffTime = new Date(Date.now() - this.config.sessionTimeout);
      let cleaned = 0;
      let errors = 0;

      // Get expired sessions
      const expiredSessions = await this.postgresStorage.getExpiredSessions(cutoffTime);

      for (const session of expiredSessions) {
        try {
          await this.deleteSession(session.id);
          cleaned++;
        } catch (error) {
          this.logger.error('Error cleaning up session', {
            sessionId: session.id,
            error
          });
          errors++;
        }
      }

      // Clean up active sessions map
      for (const [sessionId, activeSession] of this.activeSessions.entries()) {
        if (activeSession.lastActivity < cutoffTime) {
          this.activeSessions.delete(sessionId);
        }
      }

      // Clean up sync queue
      for (const [sessionId, syncData] of this.syncQueue.entries()) {
        if (syncData.lastSyncTime < cutoffTime) {
          this.syncQueue.delete(sessionId);
        }
      }

      this.logger.info('Session cleanup completed', {
        cleaned,
        errors,
        remainingActive: this.activeSessions.size
      });

      // Emit cleanup event
      this.emit('cleanup_completed', { cleaned, errors });

      return { cleaned, errors };

    } catch (error) {
      this.logger.error('Error during session cleanup', error);
      throw error;
    }
  }

  /**
   * Export session data for backup
   */
  async exportSessionData(
    sessionId: string,
    includeHistory: boolean = true
  ): Promise<{
    session: UserSession;
    conversationHistory?: any[];
    automationHistory?: any[];
    exportedAt: Date;
  }> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const exportData: any = {
        session,
        exportedAt: new Date()
      };

      if (includeHistory) {
        // Get conversation history
        exportData.conversationHistory = session.conversationHistory;

        // Get automation history from database
        exportData.automationHistory = await this.postgresStorage.getAutomationHistory(sessionId);
      }

      this.logger.info('Session data exported', {
        sessionId,
        includeHistory,
        conversationCount: exportData.conversationHistory?.length || 0
      });

      return exportData;

    } catch (error) {
      this.logger.error('Error exporting session data', error);
      throw error;
    }
  }

  /**
   * Import session data from backup
   */
  async importSessionData(
    data: any,
    overwriteExisting: boolean = false
  ): Promise<UserSession> {
    try {
      const { session, conversationHistory, automationHistory } = data;

      this.logger.info('Importing session data', {
        sessionId: session.id,
        overwriteExisting,
        hasConversationHistory: !!conversationHistory,
        hasAutomationHistory: !!automationHistory
      });

      // Check if session already exists
      const existingSession = await this.getSession(session.id);
      if (existingSession && !overwriteExisting) {
        throw new Error(`Session ${session.id} already exists`);
      }

      // Import session
      const importedSession: UserSession = {
        ...session,
        lastActivity: new Date(),
        conversationHistory: conversationHistory || []
      };

      // Store in database and memory
      if (existingSession) {
        await this.updateSession(session.id, importedSession, false);
      } else {
        const token = this.generateToken();
        await this.memoryStorage.createSession(importedSession, token);
        await this.postgresStorage.createSession(importedSession, token);
      }

      // Import automation history if provided
      if (automationHistory && automationHistory.length > 0) {
        await this.postgresStorage.importAutomationHistory(session.id, automationHistory);
      }

      this.logger.info('Session data imported successfully', {
        sessionId: session.id
      });

      return importedSession;

    } catch (error) {
      this.logger.error('Error importing session data', error);
      throw error;
    }
  }

  /**
   * Get session analytics
   */
  async getSessionAnalytics(
    sessionId: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<{
    sessionDuration: number;
    pageViews: number;
    automationCount: number;
    messageCount: number;
    deviceSwitches: number;
    mostVisitedDomains: string[];
    activityTimeline: Array<{
      timestamp: Date;
      activity: string;
      details?: any;
    }>;
  }> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const analytics = await this.postgresStorage.getSessionAnalytics(sessionId, timeRange);

      this.logger.debug('Session analytics calculated', {
        sessionId,
        duration: analytics.sessionDuration,
        pageViews: analytics.pageViews
      });

      return analytics;

    } catch (error) {
      this.logger.error('Error getting session analytics', error);
      throw error;
    }
  }

  /**
   * Merge sessions (for cross-device scenarios)
   */
  async mergeSessions(
    primarySessionId: string,
    secondarySessionId: string
  ): Promise<UserSession> {
    try {
      this.logger.info('Merging sessions', {
        primarySessionId,
        secondarySessionId
      });

      const [primarySession, secondarySession] = await Promise.all([
        this.getSession(primarySessionId),
        this.getSession(secondarySessionId)
      ]);

      if (!primarySession || !secondarySession) {
        throw new Error('One or both sessions not found');
      }

      // Merge conversation histories
      const mergedHistory = [
        ...primarySession.conversationHistory,
        ...secondarySession.conversationHistory
      ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Merge browser states
      const mergedBrowserState = {
        currentTab: primarySession.browserState.currentTab || secondarySession.browserState.currentTab,
        openTabs: [
          ...primarySession.browserState.openTabs,
          ...secondarySession.browserState.openTabs
        ],
        history: [
          ...primarySession.browserState.history,
          ...secondarySession.browserState.history
        ].slice(-this.config.maxSessionHistory),
        bookmarks: [
          ...primarySession.browserState.bookmarks,
          ...secondarySession.browserState.bookmarks
        ]
      };

      // Update primary session
      const mergedSession = await this.updateSession(primarySessionId, {
        conversationHistory: mergedHistory,
        browserState: mergedBrowserState,
        lastActivity: new Date()
      }, false);

      // Delete secondary session
      await this.deleteSession(secondarySessionId);

      this.logger.info('Sessions merged successfully', {
        primarySessionId,
        secondarySessionId,
        mergedHistoryCount: mergedHistory.length
      });

      return mergedSession!;

    } catch (error) {
      this.logger.error('Error merging sessions', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */

  private startBackgroundTasks(): void {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions().catch(error => {
        this.logger.error('Cleanup task failed', error);
      });
    }, this.config.cleanupInterval);

    // Start sync interval if cross-device sync is enabled
    if (this.config.enableCrossDeviceSync) {
      this.syncInterval = setInterval(() => {
        this.processSyncQueue().catch(error => {
          this.logger.error('Sync task failed', error);
        });
      }, 30000); // Sync every 30 seconds
    }
  }

  private async enforceSessionLimits(userId?: string): Promise<void> {
    if (userId) {
      const userSessions = await this.getUserSessions(userId);
      if (userSessions.length >= this.config.maxSessions) {
        // Delete oldest inactive session
        const oldestSession = userSessions
          .filter(s => !s.isActive)
          .sort((a, b) => a.lastActivity.getTime() - b.lastActivity.getTime())[0];

        if (oldestSession) {
          await this.deleteSession(oldestSession.id);
        }
      }
    }
  }

  private updateLastActivity(sessionId: string): void {
    const activeSession = this.activeSessions.get(sessionId);
    if (activeSession) {
      activeSession.lastActivity = new Date();
    }
  }

  private queueForSync(sessionId: string, changes: any): void {
    if (!this.syncQueue.has(sessionId)) {
      this.syncQueue.set(sessionId, {
        sessionId,
        lastSyncTime: new Date(),
        changes: []
      });
    }

    const syncData = this.syncQueue.get(sessionId)!;
    syncData.changes.push({
      type: this.inferChangeType(changes),
      data: changes,
      timestamp: new Date()
    });

    // Limit sync queue size
    if (syncData.changes.length > 50) {
      syncData.changes = syncData.changes.slice(-50);
    }
  }

  private inferChangeType(changes: any): 'browser_state' | 'preferences' | 'conversation_history' {
    if (changes.browserState) return 'browser_state';
    if (changes.preferences) return 'preferences';
    if (changes.conversationHistory) return 'conversation_history';
    return 'browser_state'; // Default
  }

  private async processSyncQueue(): Promise<void> {
    if (this.syncQueue.size === 0) return;

    this.logger.debug('Processing sync queue', {
      queueSize: this.syncQueue.size
    });

    const syncPromises = Array.from(this.syncQueue.entries()).map(
      async ([sessionId, syncData]) => {
        try {
          // Broadcast sync data to connected devices
          this.emit('session_sync', syncData);
          
          // Update last sync time
          syncData.lastSyncTime = new Date();
          
          // Clear old changes (keep only last 10)
          syncData.changes = syncData.changes.slice(-10);

        } catch (error) {
          this.logger.error('Error processing sync for session', {
            sessionId,
            error
          });
        }
      }
    );

    await Promise.allSettled(syncPromises);
  }

  private getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  private async getLastSyncTime(sessionId: string, deviceId: string): Promise<Date> {
    // This would be stored in database
    // For now, return a default
    return new Date(Date.now() - 60000); // 1 minute ago
  }

  private async updateLastSyncTime(sessionId: string, deviceId: string, time: Date): Promise<void> {
    // This would update the database
    // For now, just log
    this.logger.debug('Updated last sync time', {
      sessionId,
      deviceId,
      time
    });
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
  }

  private generateToken(): string {
    return `token_${Date.now()}_${Math.random().toString(36).substr(2, 32)}`;
  }

  private generateConnectionId(deviceInfo: DeviceInfo): string {
    return `${deviceInfo.type}_${deviceInfo.browser}_${Date.now()}`;
  }

  /**
   * Health check for session management
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: {
      memoryStorage: boolean;
      postgresStorage: boolean;
      activeSessionTracking: boolean;
      syncQueue: boolean;
    };
    metrics: {
      activeSessions: number;
      syncQueueSize: number;
      memoryUsage?: number;
    };
  }> {
    const components = {
      memoryStorage: false,
      postgresStorage: false,
      activeSessionTracking: true,
      syncQueue: true
    };

    try {
      // Test memory storage
      const testSession = await this.memoryStorage.getSession('health-check');
      components.memoryStorage = true;
    } catch {
      components.memoryStorage = false;
    }

    try {
      // Test postgres storage
      const testSession = await this.postgresStorage.getSession('health-check');
      components.postgresStorage = true;
    } catch {
      components.postgresStorage = false;
    }

    const healthyComponents = Object.values(components).filter(Boolean).length;
    const totalComponents = Object.values(components).length;

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
        activeSessions: this.activeSessions.size,
        syncQueueSize: this.syncQueue.size
      }
    };
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down enhanced session manager');

    // Clear intervals
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Process remaining sync queue
    await this.processSyncQueue();

    // Clear active sessions
    this.activeSessions.clear();
    this.syncQueue.clear();

    // Remove all listeners
    this.removeAllListeners();

    this.logger.info('Enhanced session manager shutdown complete');
  }
}
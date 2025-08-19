import { 
  UserSession,
  WebSocketMessage,
  SessionUpdatePayload 
} from '@browser-ai-agent/shared';
import { ConnectionManager } from './connection-manager';
import { MessageBroker } from './message-broker';
import { SessionService } from '../session';
import { Logger } from 'winston';
import { createLogger } from '../../utils/logger';

export interface WebSocketSessionManagerConfig {
  syncInterval: number;
  enableAutoSync: boolean;
  maxSyncRetries: number;
}

export class WebSocketSessionManager {
  private readonly logger: Logger;
  private readonly config: WebSocketSessionManagerConfig;
  private readonly connectionManager: ConnectionManager;
  private readonly messageBroker: MessageBroker;
  private readonly sessionService: SessionService;
  private readonly sessionStates: Map<string, UserSession>;
  private syncTimer?: NodeJS.Timeout;

  constructor(
    connectionManager: ConnectionManager,
    messageBroker: MessageBroker,
    sessionService: SessionService,
    config: WebSocketSessionManagerConfig
  ) {
    this.logger = createLogger('WebSocketSessionManager');
    this.config = config;
    this.connectionManager = connectionManager;
    this.messageBroker = messageBroker;
    this.sessionService = sessionService;
    this.sessionStates = new Map();

    this.setupMessageHandlers();

    if (config.enableAutoSync) {
      this.startAutoSync();
    }

    this.logger.info('WebSocket Session Manager initialized', {
      syncInterval: config.syncInterval,
      enableAutoSync: config.enableAutoSync,
    });
  }

  /**
   * Setup message handlers for session-related messages
   */
  private setupMessageHandlers(): void {
    // Handle session update requests
    this.messageBroker.onMessage('session_update', async (payload: SessionUpdatePayload) => {
      await this.handleSessionUpdate(payload);
    });

    // Handle page change notifications
    this.messageBroker.onMessage('page_change', async (payload: any, message: WebSocketMessage) => {
      await this.handlePageChange(message.sessionId, payload);
    });
  }

  /**
   * Initialize session state for WebSocket connection
   */
  async initializeSession(sessionId: string): Promise<UserSession | null> {
    try {
      this.logger.debug('Initializing WebSocket session', { sessionId });

      // Get session from service
      const session = await this.sessionService.getSession(sessionId);
      if (!session) {
        this.logger.warn('Session not found for WebSocket initialization', { sessionId });
        return null;
      }

      // Store in local state
      this.sessionStates.set(sessionId, { ...session });

      // Notify connections about session initialization
      await this.messageBroker.sendToSession(sessionId, 'session_update', {
        updates: session,
        updateType: 'full',
      });

      this.logger.info('WebSocket session initialized', {
        sessionId,
        userId: session.userId,
      });

      return session;
    } catch (error) {
      this.logger.error('Failed to initialize WebSocket session', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Update session state
   */
  async updateSession(
    sessionId: string,
    updates: Partial<UserSession>,
    broadcast: boolean = true
  ): Promise<UserSession | null> {
    try {
      this.logger.debug('Updating WebSocket session', {
        sessionId,
        updateKeys: Object.keys(updates),
        broadcast,
      });

      // Get current session state
      let currentSession = this.sessionStates.get(sessionId);
      if (!currentSession) {
        // Try to load from service
        currentSession = await this.sessionService.getSession(sessionId);
        if (!currentSession) {
          this.logger.warn('Session not found for update', { sessionId });
          return null;
        }
      }

      // Merge updates
      const updatedSession = this.mergeSessionUpdates(currentSession, updates);

      // Update in service
      const savedSession = await this.sessionService.updateSession(sessionId, updates);
      if (!savedSession) {
        this.logger.error('Failed to save session updates', { sessionId });
        return null;
      }

      // Update local state
      this.sessionStates.set(sessionId, savedSession);

      // Broadcast update if requested
      if (broadcast) {
        await this.messageBroker.sendToSession(sessionId, 'session_update', {
          updates,
          updateType: this.determineUpdateType(updates),
        });
      }

      this.logger.debug('WebSocket session updated successfully', {
        sessionId,
        updateKeys: Object.keys(updates),
      });

      return savedSession;
    } catch (error) {
      this.logger.error('Failed to update WebSocket session', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Update browser state for session
   */
  async updateBrowserState(
    sessionId: string,
    browserState: Partial<UserSession['browserState']>
  ): Promise<boolean> {
    const currentSession = this.sessionStates.get(sessionId);
    if (!currentSession) {
      this.logger.warn('Session not found for browser state update', { sessionId });
      return false;
    }

    const updatedBrowserState = {
      ...currentSession.browserState,
      ...browserState,
    };

    const success = await this.updateSession(sessionId, {
      browserState: updatedBrowserState,
      lastActivity: new Date(),
    });

    return !!success;
  }

  /**
   * Update user preferences
   */
  async updatePreferences(
    sessionId: string,
    preferences: Partial<UserSession['preferences']>
  ): Promise<boolean> {
    const currentSession = this.sessionStates.get(sessionId);
    if (!currentSession) {
      this.logger.warn('Session not found for preferences update', { sessionId });
      return false;
    }

    const updatedPreferences = this.mergePreferences(
      currentSession.preferences,
      preferences
    );

    const success = await this.updateSession(sessionId, {
      preferences: updatedPreferences,
      lastActivity: new Date(),
    });

    return !!success;
  }

  /**
   * Add message to conversation history
   */
  async addConversationMessage(
    sessionId: string,
    message: any
  ): Promise<boolean> {
    const currentSession = this.sessionStates.get(sessionId);
    if (!currentSession) {
      this.logger.warn('Session not found for conversation update', { sessionId });
      return false;
    }

    const updatedHistory = [...currentSession.conversationHistory, message];

    // Limit conversation history size
    const maxHistorySize = 100;
    if (updatedHistory.length > maxHistorySize) {
      updatedHistory.splice(0, updatedHistory.length - maxHistorySize);
    }

    const success = await this.updateSession(sessionId, {
      conversationHistory: updatedHistory,
      lastActivity: new Date(),
    }, false); // Don't broadcast conversation updates

    return !!success;
  }

  /**
   * Get session state
   */
  getSessionState(sessionId: string): UserSession | null {
    return this.sessionStates.get(sessionId) || null;
  }

  /**
   * Remove session from WebSocket management
   */
  async removeSession(sessionId: string): Promise<void> {
    this.logger.info('Removing WebSocket session', { sessionId });

    // Remove from local state
    this.sessionStates.delete(sessionId);

    // Notify connections
    await this.messageBroker.sendToSession(sessionId, 'session_update', {
      updates: { deleted: true },
      updateType: 'full',
    });
  }

  /**
   * Sync session states with persistent storage
   */
  async syncSessions(): Promise<void> {
    this.logger.debug('Syncing WebSocket sessions with storage');

    const syncPromises: Promise<void>[] = [];

    for (const [sessionId, sessionState] of this.sessionStates) {
      syncPromises.push(this.syncSingleSession(sessionId, sessionState));
    }

    await Promise.allSettled(syncPromises);
  }

  /**
   * Get session statistics
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    sessionsByUser: Record<string, number>;
    oldestSession: Date | null;
  } {
    const sessionsByUser: Record<string, number> = {};
    let oldestTime = Infinity;
    let activeSessions = 0;

    for (const session of this.sessionStates.values()) {
      // Count sessions by user
      sessionsByUser[session.userId] = (sessionsByUser[session.userId] || 0) + 1;

      // Check if session is active (not expired)
      if (session.expiresAt > new Date()) {
        activeSessions++;
      }

      // Track oldest session
      const sessionTime = session.createdAt.getTime();
      if (sessionTime < oldestTime) {
        oldestTime = sessionTime;
      }
    }

    return {
      totalSessions: this.sessionStates.size,
      activeSessions,
      sessionsByUser,
      oldestSession: oldestTime === Infinity ? null : new Date(oldestTime),
    };
  }

  /**
   * Cleanup expired sessions
   */
  async cleanup(): Promise<number> {
    const now = new Date();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.sessionStates) {
      if (session.expiresAt < now) {
        expiredSessions.push(sessionId);
      }
    }

    // Remove expired sessions
    for (const sessionId of expiredSessions) {
      await this.removeSession(sessionId);
    }

    if (expiredSessions.length > 0) {
      this.logger.info('Cleaned up expired WebSocket sessions', {
        cleanedCount: expiredSessions.length,
      });
    }

    return expiredSessions.length;
  }

  /**
   * Shutdown session manager
   */
  shutdown(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.sessionStates.clear();

    this.logger.info('WebSocket Session Manager shutdown');
  }

  /**
   * Private helper methods
   */
  private async handleSessionUpdate(payload: SessionUpdatePayload): Promise<void> {
    // This would handle incoming session update requests from clients
    // For now, we'll just log it
    this.logger.debug('Received session update request', {
      updateType: payload.updateType,
      updateKeys: Object.keys(payload.updates),
    });
  }

  private async handlePageChange(sessionId: string, payload: any): Promise<void> {
    // Update browser state with new page context
    if (payload.newContext) {
      await this.updateBrowserState(sessionId, {
        pageContext: payload.newContext,
        currentTab: {
          id: 'current-tab',
          url: payload.newContext.url,
          title: payload.newContext.title,
          active: true,
          status: 'complete',
        },
      });
    }
  }

  private mergeSessionUpdates(
    currentSession: UserSession,
    updates: Partial<UserSession>
  ): UserSession {
    const merged = { ...currentSession };

    // Deep merge specific objects
    if (updates.browserState) {
      merged.browserState = {
        ...merged.browserState,
        ...updates.browserState,
      };
    }

    if (updates.preferences) {
      merged.preferences = this.mergePreferences(merged.preferences, updates.preferences);
    }

    if (updates.metadata) {
      merged.metadata = {
        ...merged.metadata,
        ...updates.metadata,
      };
    }

    // Direct assignment for other fields
    Object.keys(updates).forEach(key => {
      if (key !== 'browserState' && key !== 'preferences' && key !== 'metadata') {
        (merged as any)[key] = (updates as any)[key];
      }
    });

    return merged;
  }

  private mergePreferences(
    current: UserSession['preferences'],
    updates: Partial<UserSession['preferences']>
  ): UserSession['preferences'] {
    return {
      theme: updates.theme || current.theme,
      language: updates.language || current.language,
      automation: {
        ...current.automation,
        ...updates.automation,
      },
      privacy: {
        ...current.privacy,
        ...updates.privacy,
      },
      notifications: {
        ...current.notifications,
        ...updates.notifications,
      },
      ai: {
        ...current.ai,
        ...updates.ai,
        modelPreferences: {
          ...current.ai.modelPreferences,
          ...updates.ai?.modelPreferences,
        },
      },
    };
  }

  private determineUpdateType(updates: Partial<UserSession>): 'preferences' | 'state' | 'metadata' | 'full' {
    const keys = Object.keys(updates);
    
    if (keys.length === 1) {
      if (keys[0] === 'preferences') return 'preferences';
      if (keys[0] === 'browserState') return 'state';
      if (keys[0] === 'metadata') return 'metadata';
    }

    return 'full';
  }

  private async syncSingleSession(sessionId: string, sessionState: UserSession): Promise<void> {
    try {
      // Get latest from storage
      const storageSession = await this.sessionService.getSession(sessionId);
      if (!storageSession) {
        // Session was deleted, remove from local state
        this.sessionStates.delete(sessionId);
        return;
      }

      // Check if local state is newer
      if (sessionState.lastActivity > storageSession.lastActivity) {
        // Update storage with local state
        await this.sessionService.updateSession(sessionId, {
          browserState: sessionState.browserState,
          conversationHistory: sessionState.conversationHistory,
          preferences: sessionState.preferences,
          lastActivity: sessionState.lastActivity,
        });
      } else if (storageSession.lastActivity > sessionState.lastActivity) {
        // Update local state with storage
        this.sessionStates.set(sessionId, storageSession);
      }
    } catch (error) {
      this.logger.error('Failed to sync session', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private startAutoSync(): void {
    this.syncTimer = setInterval(() => {
      this.syncSessions().catch(error => {
        this.logger.error('Auto-sync failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }, this.config.syncInterval);
  }
}
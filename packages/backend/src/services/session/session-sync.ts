/**
 * Session Synchronization Service
 * Handles cross-device session synchronization and conflict resolution
 */

import { UserSession, DeviceInfo } from '@browser-ai-agent/shared';
import { Logger } from '../../utils/logger';
import { EventEmitter } from 'events';

export interface SyncConfig {
  syncInterval: number; // milliseconds
  conflictResolution: 'last-write-wins' | 'merge' | 'manual';
  maxSyncHistory: number;
  enableRealTimeSync: boolean;
  syncTimeout: number;
}

export interface SyncEvent {
  id: string;
  sessionId: string;
  deviceId: string;
  timestamp: Date;
  type: 'create' | 'update' | 'delete';
  data: Partial<UserSession>;
  version: number;
}

export interface SyncConflict {
  sessionId: string;
  conflictType: 'concurrent_update' | 'version_mismatch' | 'device_conflict';
  localVersion: number;
  remoteVersion: number;
  localData: Partial<UserSession>;
  remoteData: Partial<UserSession>;
  timestamp: Date;
}

export interface DeviceSync {
  deviceId: string;
  lastSyncTime: Date;
  syncVersion: number;
  pendingEvents: SyncEvent[];
  conflictCount: number;
}

export class SessionSyncService extends EventEmitter {
  private logger: Logger;
  private config: SyncConfig;
  
  // Device tracking
  private connectedDevices: Map<string, DeviceSync> = new Map();
  private deviceSessions: Map<string, Set<string>> = new Map(); // deviceId -> sessionIds
  
  // Sync state
  private syncQueue: Map<string, SyncEvent[]> = new Map(); // sessionId -> events
  private syncHistory: Map<string, SyncEvent[]> = new Map(); // sessionId -> history
  private conflicts: Map<string, SyncConflict[]> = new Map(); // sessionId -> conflicts
  
  // Timers
  private syncInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    logger: Logger,
    config: SyncConfig = {
      syncInterval: 5000, // 5 seconds
      conflictResolution: 'last-write-wins',
      maxSyncHistory: 1000,
      enableRealTimeSync: true,
      syncTimeout: 30000 // 30 seconds
    }
  ) {
    super();
    this.logger = logger;
    this.config = config;
    
    this.startSyncProcess();
  }

  /**
   * Register a device for synchronization
   */
  async registerDevice(deviceId: string, deviceInfo: DeviceInfo): Promise<void> {
    try {
      this.logger.info('Registering device for sync', {
        deviceId,
        deviceType: deviceInfo.type,
        browser: deviceInfo.browser
      });

      const deviceSync: DeviceSync = {
        deviceId,
        lastSyncTime: new Date(),
        syncVersion: 0,
        pendingEvents: [],
        conflictCount: 0
      };

      this.connectedDevices.set(deviceId, deviceSync);
      this.deviceSessions.set(deviceId, new Set());

      this.emit('device_registered', { deviceId, deviceInfo });

    } catch (error) {
      this.logger.error('Failed to register device', { deviceId, error });
      throw error;
    }
  }

  /**
   * Unregister a device
   */
  async unregisterDevice(deviceId: string): Promise<void> {
    try {
      this.logger.info('Unregistering device from sync', { deviceId });

      this.connectedDevices.delete(deviceId);
      this.deviceSessions.delete(deviceId);

      // Clean up pending events for this device
      for (const [sessionId, events] of this.syncQueue.entries()) {
        const filteredEvents = events.filter(event => event.deviceId !== deviceId);
        if (filteredEvents.length !== events.length) {
          this.syncQueue.set(sessionId, filteredEvents);
        }
      }

      this.emit('device_unregistered', { deviceId });

    } catch (error) {
      this.logger.error('Failed to unregister device', { deviceId, error });
      throw error;
    }
  }

  /**
   * Track session for a device
   */
  async trackSession(deviceId: string, sessionId: string): Promise<void> {
    try {
      const deviceSessions = this.deviceSessions.get(deviceId);
      if (deviceSessions) {
        deviceSessions.add(sessionId);
        
        this.logger.debug('Session tracked for device', {
          deviceId,
          sessionId,
          totalSessions: deviceSessions.size
        });
      }

    } catch (error) {
      this.logger.error('Failed to track session', { deviceId, sessionId, error });
    }
  }

  /**
   * Untrack session for a device
   */
  async untrackSession(deviceId: string, sessionId: string): Promise<void> {
    try {
      const deviceSessions = this.deviceSessions.get(deviceId);
      if (deviceSessions) {
        deviceSessions.delete(sessionId);
        
        this.logger.debug('Session untracked for device', {
          deviceId,
          sessionId,
          remainingSessions: deviceSessions.size
        });
      }

    } catch (error) {
      this.logger.error('Failed to untrack session', { deviceId, sessionId, error });
    }
  }

  /**
   * Queue a sync event
   */
  async queueSyncEvent(
    sessionId: string,
    deviceId: string,
    type: 'create' | 'update' | 'delete',
    data: Partial<UserSession>,
    version: number = 1
  ): Promise<void> {
    try {
      const syncEvent: SyncEvent = {
        id: this.generateEventId(),
        sessionId,
        deviceId,
        timestamp: new Date(),
        type,
        data,
        version
      };

      // Add to sync queue
      if (!this.syncQueue.has(sessionId)) {
        this.syncQueue.set(sessionId, []);
      }
      this.syncQueue.get(sessionId)!.push(syncEvent);

      // Add to sync history
      if (!this.syncHistory.has(sessionId)) {
        this.syncHistory.set(sessionId, []);
      }
      const history = this.syncHistory.get(sessionId)!;
      history.push(syncEvent);

      // Limit history size
      if (history.length > this.config.maxSyncHistory) {
        history.splice(0, history.length - this.config.maxSyncHistory);
      }

      // Update device sync info
      const deviceSync = this.connectedDevices.get(deviceId);
      if (deviceSync) {
        deviceSync.pendingEvents.push(syncEvent);
        deviceSync.syncVersion = Math.max(deviceSync.syncVersion, version);
      }

      this.logger.debug('Sync event queued', {
        eventId: syncEvent.id,
        sessionId,
        deviceId,
        type,
        version
      });

      // Trigger immediate sync if real-time sync is enabled
      if (this.config.enableRealTimeSync) {
        await this.processSyncQueue();
      }

      this.emit('sync_event_queued', syncEvent);

    } catch (error) {
      this.logger.error('Failed to queue sync event', {
        sessionId,
        deviceId,
        type,
        error
      });
      throw error;
    }
  }

  /**
   * Get pending sync events for a device
   */
  async getPendingSyncEvents(
    deviceId: string,
    sessionId?: string,
    since?: Date
  ): Promise<SyncEvent[]> {
    try {
      const deviceSync = this.connectedDevices.get(deviceId);
      if (!deviceSync) {
        return [];
      }

      let events = deviceSync.pendingEvents;

      // Filter by session if specified
      if (sessionId) {
        events = events.filter(event => event.sessionId === sessionId);
      }

      // Filter by timestamp if specified
      if (since) {
        events = events.filter(event => event.timestamp > since);
      }

      this.logger.debug('Retrieved pending sync events', {
        deviceId,
        sessionId,
        since,
        eventCount: events.length
      });

      return events;

    } catch (error) {
      this.logger.error('Failed to get pending sync events', {
        deviceId,
        sessionId,
        error
      });
      return [];
    }
  }

  /**
   * Apply sync events to a session
   */
  async applySyncEvents(
    sessionId: string,
    events: SyncEvent[],
    currentSession: UserSession
  ): Promise<{
    updatedSession: UserSession;
    conflicts: SyncConflict[];
  }> {
    try {
      this.logger.debug('Applying sync events', {
        sessionId,
        eventCount: events.length
      });

      let updatedSession = { ...currentSession };
      const conflicts: SyncConflict[] = [];

      // Sort events by timestamp
      const sortedEvents = events.sort((a, b) => 
        a.timestamp.getTime() - b.timestamp.getTime()
      );

      for (const event of sortedEvents) {
        try {
          const result = await this.applySingleEvent(updatedSession, event);
          updatedSession = result.session;
          
          if (result.conflict) {
            conflicts.push(result.conflict);
          }

        } catch (error) {
          this.logger.warn('Failed to apply sync event', {
            eventId: event.id,
            sessionId,
            error
          });
        }
      }

      // Store conflicts if any
      if (conflicts.length > 0) {
        if (!this.conflicts.has(sessionId)) {
          this.conflicts.set(sessionId, []);
        }
        this.conflicts.get(sessionId)!.push(...conflicts);
      }

      this.logger.debug('Sync events applied', {
        sessionId,
        appliedEvents: events.length,
        conflictCount: conflicts.length
      });

      return { updatedSession, conflicts };

    } catch (error) {
      this.logger.error('Failed to apply sync events', { sessionId, error });
      throw error;
    }
  }

  /**
   * Resolve sync conflicts
   */
  async resolveConflicts(
    sessionId: string,
    resolution: 'accept_local' | 'accept_remote' | 'merge'
  ): Promise<UserSession | null> {
    try {
      const conflicts = this.conflicts.get(sessionId);
      if (!conflicts || conflicts.length === 0) {
        return null;
      }

      this.logger.info('Resolving sync conflicts', {
        sessionId,
        conflictCount: conflicts.length,
        resolution
      });

      let resolvedSession: UserSession | null = null;

      for (const conflict of conflicts) {
        switch (resolution) {
          case 'accept_local':
            // Keep local data, ignore remote
            break;
            
          case 'accept_remote':
            // Apply remote data
            if (resolvedSession) {
              resolvedSession = this.mergeSessionData(resolvedSession, conflict.remoteData);
            }
            break;
            
          case 'merge':
            // Intelligent merge
            if (resolvedSession) {
              resolvedSession = this.intelligentMerge(
                resolvedSession,
                conflict.localData,
                conflict.remoteData
              );
            }
            break;
        }
      }

      // Clear resolved conflicts
      this.conflicts.delete(sessionId);

      this.emit('conflicts_resolved', {
        sessionId,
        conflictCount: conflicts.length,
        resolution
      });

      return resolvedSession;

    } catch (error) {
      this.logger.error('Failed to resolve conflicts', { sessionId, error });
      throw error;
    }
  }

  /**
   * Get sync statistics
   */
  getSyncStats(): {
    connectedDevices: number;
    totalSessions: number;
    pendingEvents: number;
    totalConflicts: number;
    syncQueueSize: number;
  } {
    const pendingEvents = Array.from(this.connectedDevices.values())
      .reduce((total, device) => total + device.pendingEvents.length, 0);

    const totalConflicts = Array.from(this.conflicts.values())
      .reduce((total, conflicts) => total + conflicts.length, 0);

    const syncQueueSize = Array.from(this.syncQueue.values())
      .reduce((total, events) => total + events.length, 0);

    const totalSessions = Array.from(this.deviceSessions.values())
      .reduce((total, sessions) => total + sessions.size, 0);

    return {
      connectedDevices: this.connectedDevices.size,
      totalSessions,
      pendingEvents,
      totalConflicts,
      syncQueueSize
    };
  }

  /**
   * Private helper methods
   */

  private startSyncProcess(): void {
    // Start sync interval
    this.syncInterval = setInterval(async () => {
      try {
        await this.processSyncQueue();
      } catch (error) {
        this.logger.error('Sync process failed', error);
      }
    }, this.config.syncInterval);

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldData();
    }, 60000); // Clean up every minute

    this.logger.info('Sync process started', {
      syncInterval: this.config.syncInterval,
      conflictResolution: this.config.conflictResolution
    });
  }

  private async processSyncQueue(): Promise<void> {
    if (this.syncQueue.size === 0) {
      return;
    }

    this.logger.debug('Processing sync queue', {
      queueSize: this.syncQueue.size
    });

    const processPromises = Array.from(this.syncQueue.entries()).map(
      async ([sessionId, events]) => {
        try {
          await this.broadcastSyncEvents(sessionId, events);
          
          // Clear processed events
          this.syncQueue.delete(sessionId);
          
        } catch (error) {
          this.logger.error('Failed to process sync events for session', {
            sessionId,
            eventCount: events.length,
            error
          });
        }
      }
    );

    await Promise.allSettled(processPromises);
  }

  private async broadcastSyncEvents(sessionId: string, events: SyncEvent[]): Promise<void> {
    // Find all devices that have this session
    const targetDevices: string[] = [];
    
    for (const [deviceId, sessions] of this.deviceSessions.entries()) {
      if (sessions.has(sessionId)) {
        targetDevices.push(deviceId);
      }
    }

    if (targetDevices.length === 0) {
      return;
    }

    this.logger.debug('Broadcasting sync events', {
      sessionId,
      eventCount: events.length,
      targetDevices: targetDevices.length
    });

    // Emit sync events for each target device
    for (const deviceId of targetDevices) {
      // Filter out events that originated from this device
      const relevantEvents = events.filter(event => event.deviceId !== deviceId);
      
      if (relevantEvents.length > 0) {
        this.emit('sync_events_broadcast', {
          deviceId,
          sessionId,
          events: relevantEvents
        });
      }
    }
  }

  private async applySingleEvent(
    session: UserSession,
    event: SyncEvent
  ): Promise<{
    session: UserSession;
    conflict?: SyncConflict;
  }> {
    let updatedSession = { ...session };
    let conflict: SyncConflict | undefined;

    switch (event.type) {
      case 'create':
        // For create events, merge the data
        updatedSession = this.mergeSessionData(updatedSession, event.data);
        break;

      case 'update':
        // Check for conflicts
        if (this.hasConflict(session, event)) {
          conflict = this.createConflict(session, event);
          
          // Apply conflict resolution strategy
          switch (this.config.conflictResolution) {
            case 'last-write-wins':
              updatedSession = this.mergeSessionData(updatedSession, event.data);
              break;
            case 'merge':
              updatedSession = this.intelligentMerge(updatedSession, {}, event.data);
              break;
            case 'manual':
              // Don't apply changes, let user resolve manually
              break;
          }
        } else {
          updatedSession = this.mergeSessionData(updatedSession, event.data);
        }
        break;

      case 'delete':
        // Mark session for deletion (actual deletion handled elsewhere)
        updatedSession.metadata = {
          ...updatedSession.metadata,
          markedForDeletion: true,
          deletionTimestamp: event.timestamp
        };
        break;
    }

    return { session: updatedSession, conflict };
  }

  private hasConflict(session: UserSession, event: SyncEvent): boolean {
    // Simple conflict detection based on last activity time
    const sessionLastActivity = session.lastActivity.getTime();
    const eventTimestamp = event.timestamp.getTime();
    
    // If the session was modified after the event timestamp, there's a potential conflict
    return sessionLastActivity > eventTimestamp;
  }

  private createConflict(session: UserSession, event: SyncEvent): SyncConflict {
    return {
      sessionId: session.id,
      conflictType: 'concurrent_update',
      localVersion: 1, // This would be tracked properly in a real implementation
      remoteVersion: event.version,
      localData: { lastActivity: session.lastActivity },
      remoteData: event.data,
      timestamp: new Date()
    };
  }

  private mergeSessionData(
    session: UserSession,
    updates: Partial<UserSession>
  ): UserSession {
    return {
      ...session,
      ...updates,
      lastActivity: new Date(),
      // Merge nested objects carefully
      browserState: {
        ...session.browserState,
        ...updates.browserState
      },
      preferences: {
        ...session.preferences,
        ...updates.preferences
      },
      metadata: {
        ...session.metadata,
        ...updates.metadata
      }
    };
  }

  private intelligentMerge(
    session: UserSession,
    localData: Partial<UserSession>,
    remoteData: Partial<UserSession>
  ): UserSession {
    // Intelligent merge strategy
    const merged = { ...session };

    // For arrays, merge and deduplicate
    if (localData.conversationHistory || remoteData.conversationHistory) {
      const localHistory = localData.conversationHistory || [];
      const remoteHistory = remoteData.conversationHistory || [];
      
      // Merge and sort by timestamp
      const allMessages = [...localHistory, ...remoteHistory];
      const uniqueMessages = allMessages.filter((message, index, array) => 
        array.findIndex(m => m.id === message.id) === index
      );
      
      merged.conversationHistory = uniqueMessages.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    }

    // For preferences, merge with remote taking precedence for newer changes
    if (localData.preferences || remoteData.preferences) {
      merged.preferences = {
        ...merged.preferences,
        ...localData.preferences,
        ...remoteData.preferences
      };
    }

    // Update last activity to the most recent
    const localActivity = localData.lastActivity?.getTime() || 0;
    const remoteActivity = remoteData.lastActivity?.getTime() || 0;
    merged.lastActivity = new Date(Math.max(localActivity, remoteActivity));

    return merged;
  }

  private cleanupOldData(): void {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    // Clean up old sync history
    for (const [sessionId, history] of this.syncHistory.entries()) {
      const filteredHistory = history.filter(event => event.timestamp > cutoffTime);
      if (filteredHistory.length !== history.length) {
        this.syncHistory.set(sessionId, filteredHistory);
      }
    }

    // Clean up old conflicts
    for (const [sessionId, conflicts] of this.conflicts.entries()) {
      const filteredConflicts = conflicts.filter(conflict => conflict.timestamp > cutoffTime);
      if (filteredConflicts.length !== conflicts.length) {
        this.conflicts.set(sessionId, filteredConflicts);
      }
    }

    // Clean up pending events for disconnected devices
    for (const [deviceId, deviceSync] of this.connectedDevices.entries()) {
      const filteredEvents = deviceSync.pendingEvents.filter(
        event => event.timestamp > cutoffTime
      );
      deviceSync.pendingEvents = filteredEvents;
    }
  }

  private generateEventId(): string {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
  }

  /**
   * Shutdown the sync service
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down session sync service');

    // Clear intervals
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Process remaining sync queue
    await this.processSyncQueue();

    // Clear all data
    this.connectedDevices.clear();
    this.deviceSessions.clear();
    this.syncQueue.clear();
    this.syncHistory.clear();
    this.conflicts.clear();

    // Remove all listeners
    this.removeAllListeners();

    this.logger.info('Session sync service shutdown complete');
  }
}
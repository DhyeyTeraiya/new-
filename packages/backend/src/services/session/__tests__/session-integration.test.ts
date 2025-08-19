/**
 * Session Management Integration Tests
 * Tests the complete session management system with all components
 */

import { SessionService } from '../session-service';
import { SessionPersistence } from '../session-persistence';
import { SessionSyncService } from '../session-sync';
import { SessionAnalyticsService } from '../session-analytics';
import { SessionExportService } from '../session-export';
import { PostgresSessionStorage } from '../postgres-storage';
import { MemorySessionStorage } from '../memory-storage';
import { RedisSessionStorage } from '../redis-storage';
import { UserSession, DeviceInfo, SessionCreateRequest } from '@browser-ai-agent/shared';

describe('Session Management Integration', () => {
  let sessionService: SessionService;
  let persistence: SessionPersistence;
  let syncService: SessionSyncService;
  let analytics: SessionAnalyticsService;
  let exportService: SessionExportService;
  let postgresStorage: jest.Mocked<PostgresSessionStorage>;
  let memoryStorage: MemorySessionStorage;
  let redisStorage: jest.Mocked<RedisSessionStorage>;
  let logger: any;

  const mockDeviceInfo: DeviceInfo = {
    type: 'desktop',
    browser: 'chrome',
    browserVersion: '120.0.0',
    os: 'Windows',
    osVersion: '11',
    screenResolution: '1920x1080',
    userAgent: 'Mozilla/5.0...'
  };

  const mockSessionRequest: SessionCreateRequest = {
    userId: 'test-user-1',
    deviceInfo: mockDeviceInfo,
    preferences: {
      theme: 'dark',
      language: 'en'
    }
  };

  beforeEach(async () => {
    logger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    // Create mock storage implementations
    postgresStorage = {
      create: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      getUserSessions: jest.fn(),
      cleanup: jest.fn(),
      getStats: jest.fn()
    } as any;

    memoryStorage = new MemorySessionStorage();

    redisStorage = {
      create: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      getUserSessions: jest.fn(),
      cleanup: jest.fn(),
      healthCheck: jest.fn(),
      disconnect: jest.fn()
    } as any;

    // Create service instances
    persistence = new SessionPersistence(
      postgresStorage,
      memoryStorage,
      logger,
      {
        primaryStorage: 'postgres',
        enableCaching: true,
        cacheTimeout: 300000,
        enableReplication: true,
        syncInterval: 30000,
        maxRetries: 3,
        backupEnabled: true
      }
    );

    syncService = new SessionSyncService(logger, {
      syncInterval: 5000,
      conflictResolution: 'last-write-wins',
      maxSyncHistory: 1000,
      enableRealTimeSync: true,
      syncTimeout: 30000
    });

    analytics = new SessionAnalyticsService(logger);
    exportService = new SessionExportService(logger, './test-exports');

    sessionService = new SessionService(
      {
        defaultSessionTimeout: 3600000, // 1 hour
        maxSessionsPerUser: 10,
        cleanupInterval: 300000 // 5 minutes
      },
      memoryStorage,
      persistence,
      syncService,
      analytics,
      exportService,
      redisStorage
    );
  });

  afterEach(async () => {
    await sessionService.shutdown();
  });

  describe('complete session lifecycle', () => {
    it('should create, update, and delete a session with all components', async () => {
      // Mock storage responses
      const mockSession: UserSession = {
        id: 'test-session-1',
        userId: 'test-user-1',
        createdAt: new Date(),
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        conversationHistory: [],
        preferences: mockSessionRequest.preferences,
        metadata: {},
        browserState: {
          currentTab: null,
          openTabs: [],
          history: [],
          bookmarks: []
        },
        deviceInfo: mockDeviceInfo
      };

      postgresStorage.create.mockResolvedValue(mockSession);
      postgresStorage.get.mockResolvedValue(mockSession);
      postgresStorage.update.mockResolvedValue(mockSession);
      postgresStorage.delete.mockResolvedValue(true);

      // Create session
      const createdSession = await sessionService.createSession(mockSessionRequest);
      expect(createdSession).toBeDefined();
      expect(createdSession.id).toBeDefined();
      expect(createdSession.userId).toBe('test-user-1');

      // Get session
      const retrievedSession = await sessionService.getSession(createdSession.id);
      expect(retrievedSession).toBeDefined();
      expect(retrievedSession!.id).toBe(createdSession.id);

      // Update session
      const updates = { 
        lastActivity: new Date(),
        preferences: { theme: 'light', language: 'en' }
      };
      const updatedSession = await sessionService.updateSession(createdSession.id, updates);
      expect(updatedSession).toBeDefined();
      expect(updatedSession!.preferences.theme).toBe('light');

      // Delete session
      const deleted = await sessionService.deleteSession(createdSession.id);
      expect(deleted).toBe(true);
    });

    it('should handle session analytics throughout lifecycle', async () => {
      const mockSession: UserSession = {
        id: 'analytics-session',
        userId: 'analytics-user',
        createdAt: new Date(),
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        conversationHistory: [
          {
            id: 'msg-1',
            type: 'user',
            content: 'Hello',
            timestamp: new Date(),
            actions: []
          }
        ],
        preferences: {},
        metadata: {},
        browserState: {
          currentTab: null,
          openTabs: [],
          history: [
            { url: 'https://example.com', title: 'Example', visitedAt: new Date() }
          ],
          bookmarks: []
        },
        deviceInfo: mockDeviceInfo
      };

      postgresStorage.create.mockResolvedValue(mockSession);
      postgresStorage.get.mockResolvedValue(mockSession);

      // Create session
      await sessionService.createSession(mockSessionRequest);

      // Get analytics
      const sessionAnalytics = await sessionService.getSessionAnalytics('analytics-session');
      expect(sessionAnalytics).toBeDefined();
      expect(sessionAnalytics).toHaveProperty('duration');
      expect(sessionAnalytics).toHaveProperty('messageCount');
      expect(sessionAnalytics).toHaveProperty('pageViews');

      // Get aggregated analytics
      const aggregatedAnalytics = await sessionService.getAggregatedAnalytics();
      expect(aggregatedAnalytics).toBeDefined();
      expect(aggregatedAnalytics).toHaveProperty('totalSessions');
      expect(aggregatedAnalytics).toHaveProperty('totalUsers');
    });

    it('should handle cross-device synchronization', async () => {
      const mockSession: UserSession = {
        id: 'sync-session',
        userId: 'sync-user',
        createdAt: new Date(),
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        conversationHistory: [],
        preferences: {},
        metadata: {},
        browserState: {
          currentTab: null,
          openTabs: [],
          history: [],
          bookmarks: []
        },
        deviceInfo: mockDeviceInfo
      };

      postgresStorage.create.mockResolvedValue(mockSession);
      postgresStorage.get.mockResolvedValue(mockSession);

      // Register devices for sync
      await sessionService.registerDeviceForSync('device-1', mockDeviceInfo);
      await sessionService.registerDeviceForSync('device-2', {
        ...mockDeviceInfo,
        type: 'mobile'
      });

      // Create session
      await sessionService.createSession(mockSessionRequest);

      // Simulate session update from device-1
      await sessionService.updateSession('sync-session', {
        lastActivity: new Date(),
        preferences: { theme: 'dark' }
      });

      // Check sync stats
      const syncStats = sessionService.getSyncStats();
      expect(syncStats).toBeDefined();
      expect(syncStats.connectedDevices).toBe(2);

      // Synchronize session to device-2
      const syncData = await sessionService.synchronizeSession('sync-session', 'device-2');
      expect(syncData).toBeDefined();
    });

    it('should handle session export and import', async () => {
      const mockSessions: UserSession[] = [
        {
          id: 'export-session-1',
          userId: 'export-user',
          createdAt: new Date(),
          lastActivity: new Date(),
          expiresAt: new Date(Date.now() + 3600000),
          conversationHistory: [],
          preferences: {},
          metadata: {},
          browserState: {
            currentTab: null,
            openTabs: [],
            history: [],
            bookmarks: []
          },
          deviceInfo: mockDeviceInfo
        },
        {
          id: 'export-session-2',
          userId: 'export-user',
          createdAt: new Date(),
          lastActivity: new Date(),
          expiresAt: new Date(Date.now() + 3600000),
          conversationHistory: [],
          preferences: {},
          metadata: {},
          browserState: {
            currentTab: null,
            openTabs: [],
            history: [],
            bookmarks: []
          },
          deviceInfo: mockDeviceInfo
        }
      ];

      postgresStorage.getUserSessions.mockResolvedValue(mockSessions);

      // Export sessions
      const exportResult = await sessionService.exportSessionData(
        ['export-session-1', 'export-session-2'],
        {
          format: 'json',
          compression: 'none',
          includeHistory: true,
          includePreferences: true,
          includeMetadata: true
        }
      );

      expect(exportResult).toBeDefined();
      expect(exportResult).toHaveProperty('exportId');
      expect(exportResult).toHaveProperty('sessionCount', 2);

      // Import sessions (mock file path)
      const importResult = await sessionService.importSessionData(
        '/mock/export/file.json',
        {
          format: 'json',
          compression: 'none',
          overwriteExisting: false,
          validateData: true,
          batchSize: 100
        }
      );

      expect(importResult).toBeDefined();
      expect(importResult).toHaveProperty('importId');
    });
  });

  describe('error handling and resilience', () => {
    it('should handle storage failures gracefully', async () => {
      // Mock primary storage failure
      postgresStorage.create.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        sessionService.createSession(mockSessionRequest)
      ).rejects.toThrow('Database connection failed');

      // Verify error was logged
      expect(logger.error).toHaveBeenCalled();
    });

    it('should fallback to secondary storage when primary fails', async () => {
      const mockSession: UserSession = {
        id: 'fallback-session',
        userId: 'fallback-user',
        createdAt: new Date(),
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        conversationHistory: [],
        preferences: {},
        metadata: {},
        browserState: {
          currentTab: null,
          openTabs: [],
          history: [],
          bookmarks: []
        },
        deviceInfo: mockDeviceInfo
      };

      // Primary storage fails, secondary succeeds
      postgresStorage.get.mockRejectedValue(new Error('Primary storage error'));
      await memoryStorage.create(mockSession);

      // Should still be able to get session from memory storage
      const retrievedSession = await sessionService.getSession('fallback-session');
      expect(retrievedSession).toBeDefined();
      expect(retrievedSession!.id).toBe('fallback-session');
    });

    it('should handle sync conflicts appropriately', async () => {
      const mockSession: UserSession = {
        id: 'conflict-session',
        userId: 'conflict-user',
        createdAt: new Date(),
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        conversationHistory: [],
        preferences: {},
        metadata: {},
        browserState: {
          currentTab: null,
          openTabs: [],
          history: [],
          bookmarks: []
        },
        deviceInfo: mockDeviceInfo
      };

      postgresStorage.create.mockResolvedValue(mockSession);
      postgresStorage.get.mockResolvedValue(mockSession);

      // Register devices
      await sessionService.registerDeviceForSync('device-1', mockDeviceInfo);
      await sessionService.registerDeviceForSync('device-2', mockDeviceInfo);

      // Create session
      await sessionService.createSession(mockSessionRequest);

      // Simulate concurrent updates from different devices
      // This would create sync conflicts that need to be resolved
      const syncStats = sessionService.getSyncStats();
      expect(syncStats).toBeDefined();
    });
  });

  describe('performance and scalability', () => {
    it('should handle multiple concurrent session operations', async () => {
      const mockSession: UserSession = {
        id: 'concurrent-session',
        userId: 'concurrent-user',
        createdAt: new Date(),
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        conversationHistory: [],
        preferences: {},
        metadata: {},
        browserState: {
          currentTab: null,
          openTabs: [],
          history: [],
          bookmarks: []
        },
        deviceInfo: mockDeviceInfo
      };

      postgresStorage.create.mockResolvedValue(mockSession);
      postgresStorage.get.mockResolvedValue(mockSession);
      postgresStorage.update.mockResolvedValue(mockSession);

      // Create multiple sessions concurrently
      const sessionPromises = Array.from({ length: 10 }, (_, i) => 
        sessionService.createSession({
          ...mockSessionRequest,
          userId: `concurrent-user-${i}`
        })
      );

      const sessions = await Promise.all(sessionPromises);
      expect(sessions).toHaveLength(10);
      sessions.forEach(session => {
        expect(session).toBeDefined();
        expect(session.id).toBeDefined();
      });
    });

    it('should efficiently clean up expired sessions', async () => {
      postgresStorage.cleanup.mockResolvedValue(5);

      const cleanedCount = await sessionService.cleanup();
      expect(cleanedCount).toBe(5);
      expect(postgresStorage.cleanup).toHaveBeenCalled();
    });

    it('should provide comprehensive health check', async () => {
      redisStorage.healthCheck.mockResolvedValue({
        status: 'healthy',
        latency: 10,
        memoryUsage: 1024,
        connectedClients: 5
      });

      const healthCheck = await sessionService.healthCheck();
      
      expect(healthCheck).toBeDefined();
      expect(healthCheck).toHaveProperty('status');
      expect(healthCheck).toHaveProperty('components');
      expect(healthCheck).toHaveProperty('metrics');
      expect(healthCheck.components).toHaveProperty('storage');
      expect(healthCheck.components).toHaveProperty('persistence');
      expect(healthCheck.components).toHaveProperty('sync');
      expect(healthCheck.components).toHaveProperty('analytics');
    });
  });

  describe('event handling', () => {
    it('should emit events for session lifecycle operations', async () => {
      const mockSession: UserSession = {
        id: 'event-session',
        userId: 'event-user',
        createdAt: new Date(),
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        conversationHistory: [],
        preferences: {},
        metadata: {},
        browserState: {
          currentTab: null,
          openTabs: [],
          history: [],
          bookmarks: []
        },
        deviceInfo: mockDeviceInfo
      };

      postgresStorage.create.mockResolvedValue(mockSession);
      postgresStorage.get.mockResolvedValue(mockSession);
      postgresStorage.update.mockResolvedValue(mockSession);
      postgresStorage.delete.mockResolvedValue(true);

      // Set up event listeners
      const sessionCreatedSpy = jest.fn();
      const sessionUpdatedSpy = jest.fn();
      const sessionDeletedSpy = jest.fn();

      sessionService.on('sessionCreated', sessionCreatedSpy);
      sessionService.on('sessionUpdated', sessionUpdatedSpy);
      sessionService.on('sessionDeleted', sessionDeletedSpy);

      // Perform operations
      const session = await sessionService.createSession(mockSessionRequest);
      await sessionService.updateSession(session.id, { lastActivity: new Date() });
      await sessionService.deleteSession(session.id);

      // Verify events were emitted
      expect(sessionCreatedSpy).toHaveBeenCalled();
      expect(sessionUpdatedSpy).toHaveBeenCalled();
      expect(sessionDeletedSpy).toHaveBeenCalled();
    });

    it('should emit sync-related events', async () => {
      const deviceRegisteredSpy = jest.fn();
      const syncEventsBroadcastSpy = jest.fn();

      sessionService.on('deviceRegistered', deviceRegisteredSpy);
      sessionService.on('syncEventsBroadcast', syncEventsBroadcastSpy);

      await sessionService.registerDeviceForSync('event-device', mockDeviceInfo);

      expect(deviceRegisteredSpy).toHaveBeenCalledWith({
        deviceId: 'event-device',
        deviceInfo: mockDeviceInfo
      });
    });
  });

  describe('metrics and monitoring', () => {
    it('should provide comprehensive session metrics', () => {
      const metrics = sessionService.getSessionMetrics();
      
      expect(metrics).toBeDefined();
      expect(metrics).toHaveProperty('totalSessions');
      expect(metrics).toHaveProperty('activeSessions');
      expect(metrics).toHaveProperty('storageUsage');
    });

    it('should provide sync statistics', () => {
      const syncStats = sessionService.getSyncStats();
      
      expect(syncStats).toBeDefined();
      expect(syncStats).toHaveProperty('connectedDevices');
      expect(syncStats).toHaveProperty('totalSessions');
      expect(syncStats).toHaveProperty('pendingEvents');
    });
  });
});
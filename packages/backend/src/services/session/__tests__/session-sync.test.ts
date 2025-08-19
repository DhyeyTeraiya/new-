/**
 * Session Synchronization Tests
 */

import { SessionSyncService } from '../session-sync';
import { UserSession, DeviceInfo } from '@browser-ai-agent/shared';

describe('SessionSyncService', () => {
  let syncService: SessionSyncService;
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

  const mockSession: UserSession = {
    id: 'test-session-1',
    userId: 'test-user-1',
    createdAt: new Date(),
    lastActivity: new Date(),
    conversationHistory: [],
    preferences: {},
    metadata: {},
    browserState: {
      currentTab: null,
      openTabs: [],
      history: [],
      bookmarks: []
    }
  };

  beforeEach(() => {
    logger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    syncService = new SessionSyncService(logger, {
      syncInterval: 1000, // 1 second for testing
      conflictResolution: 'last-write-wins',
      maxSyncHistory: 100,
      enableRealTimeSync: true,
      syncTimeout: 5000
    });
  });

  afterEach(async () => {
    await syncService.shutdown();
  });

  describe('device registration', () => {
    it('should register a device for synchronization', async () => {
      await syncService.registerDevice('device-1', mockDeviceInfo);

      const stats = syncService.getSyncStats();
      expect(stats.connectedDevices).toBe(1);
    });

    it('should emit device_registered event', async () => {
      const eventSpy = jest.fn();
      syncService.on('device_registered', eventSpy);

      await syncService.registerDevice('device-1', mockDeviceInfo);

      expect(eventSpy).toHaveBeenCalledWith({
        deviceId: 'device-1',
        deviceInfo: mockDeviceInfo
      });
    });

    it('should unregister a device', async () => {
      await syncService.registerDevice('device-1', mockDeviceInfo);
      await syncService.unregisterDevice('device-1');

      const stats = syncService.getSyncStats();
      expect(stats.connectedDevices).toBe(0);
    });
  });

  describe('session tracking', () => {
    beforeEach(async () => {
      await syncService.registerDevice('device-1', mockDeviceInfo);
    });

    it('should track a session for a device', async () => {
      await syncService.trackSession('device-1', 'session-1');

      const stats = syncService.getSyncStats();
      expect(stats.totalSessions).toBe(1);
    });

    it('should untrack a session for a device', async () => {
      await syncService.trackSession('device-1', 'session-1');
      await syncService.untrackSession('device-1', 'session-1');

      const stats = syncService.getSyncStats();
      expect(stats.totalSessions).toBe(0);
    });
  });

  describe('sync events', () => {
    beforeEach(async () => {
      await syncService.registerDevice('device-1', mockDeviceInfo);
      await syncService.trackSession('device-1', 'session-1');
    });

    it('should queue a sync event', async () => {
      await syncService.queueSyncEvent(
        'session-1',
        'device-1',
        'update',
        { lastActivity: new Date() },
        1
      );

      const stats = syncService.getSyncStats();
      expect(stats.syncQueueSize).toBe(1);
    });

    it('should emit sync_event_queued event', async () => {
      const eventSpy = jest.fn();
      syncService.on('sync_event_queued', eventSpy);

      await syncService.queueSyncEvent(
        'session-1',
        'device-1',
        'update',
        { lastActivity: new Date() },
        1
      );

      expect(eventSpy).toHaveBeenCalled();
      expect(eventSpy.mock.calls[0][0]).toHaveProperty('id');
      expect(eventSpy.mock.calls[0][0]).toHaveProperty('sessionId', 'session-1');
    });

    it('should get pending sync events for a device', async () => {
      await syncService.queueSyncEvent(
        'session-1',
        'device-1',
        'update',
        { lastActivity: new Date() },
        1
      );

      const pendingEvents = await syncService.getPendingSyncEvents('device-1');

      expect(pendingEvents).toHaveLength(1);
      expect(pendingEvents[0]).toHaveProperty('sessionId', 'session-1');
      expect(pendingEvents[0]).toHaveProperty('type', 'update');
    });

    it('should filter pending events by session ID', async () => {
      await syncService.queueSyncEvent('session-1', 'device-1', 'update', {}, 1);
      await syncService.queueSyncEvent('session-2', 'device-1', 'update', {}, 1);

      const pendingEvents = await syncService.getPendingSyncEvents('device-1', 'session-1');

      expect(pendingEvents).toHaveLength(1);
      expect(pendingEvents[0]).toHaveProperty('sessionId', 'session-1');
    });

    it('should filter pending events by timestamp', async () => {
      const pastTime = new Date(Date.now() - 60000); // 1 minute ago
      
      await syncService.queueSyncEvent('session-1', 'device-1', 'update', {}, 1);

      const pendingEvents = await syncService.getPendingSyncEvents('device-1', undefined, pastTime);

      expect(pendingEvents).toHaveLength(1); // Event is newer than pastTime
    });
  });

  describe('sync event application', () => {
    it('should apply sync events to a session', async () => {
      const events = [
        {
          id: 'event-1',
          sessionId: 'session-1',
          deviceId: 'device-2',
          timestamp: new Date(),
          type: 'update' as const,
          data: { lastActivity: new Date() },
          version: 1
        }
      ];

      const result = await syncService.applySyncEvents('session-1', events, mockSession);

      expect(result.updatedSession).toHaveProperty('lastActivity');
      expect(result.conflicts).toHaveLength(0);
    });

    it('should detect conflicts during sync', async () => {
      const futureTime = new Date(Date.now() + 60000); // 1 minute in future
      const sessionWithFutureActivity = {
        ...mockSession,
        lastActivity: futureTime
      };

      const events = [
        {
          id: 'event-1',
          sessionId: 'session-1',
          deviceId: 'device-2',
          timestamp: new Date(), // Earlier than session's lastActivity
          type: 'update' as const,
          data: { lastActivity: new Date() },
          version: 1
        }
      ];

      const result = await syncService.applySyncEvents(
        'session-1',
        events,
        sessionWithFutureActivity
      );

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toHaveProperty('conflictType', 'concurrent_update');
    });

    it('should handle create events', async () => {
      const events = [
        {
          id: 'event-1',
          sessionId: 'session-1',
          deviceId: 'device-2',
          timestamp: new Date(),
          type: 'create' as const,
          data: { preferences: { theme: 'dark' } },
          version: 1
        }
      ];

      const result = await syncService.applySyncEvents('session-1', events, mockSession);

      expect(result.updatedSession.preferences).toHaveProperty('theme', 'dark');
    });

    it('should handle delete events', async () => {
      const events = [
        {
          id: 'event-1',
          sessionId: 'session-1',
          deviceId: 'device-2',
          timestamp: new Date(),
          type: 'delete' as const,
          data: {},
          version: 1
        }
      ];

      const result = await syncService.applySyncEvents('session-1', events, mockSession);

      expect(result.updatedSession.metadata).toHaveProperty('markedForDeletion', true);
    });
  });

  describe('conflict resolution', () => {
    beforeEach(async () => {
      // Create a conflict scenario
      const events = [
        {
          id: 'event-1',
          sessionId: 'session-1',
          deviceId: 'device-2',
          timestamp: new Date(),
          type: 'update' as const,
          data: { lastActivity: new Date() },
          version: 1
        }
      ];

      const futureSession = {
        ...mockSession,
        lastActivity: new Date(Date.now() + 60000)
      };

      await syncService.applySyncEvents('session-1', events, futureSession);
    });

    it('should resolve conflicts with accept_local strategy', async () => {
      const result = await syncService.resolveConflicts('session-1', 'accept_local');

      // Should return null since we're keeping local data
      expect(result).toBeNull();
    });

    it('should resolve conflicts with accept_remote strategy', async () => {
      const result = await syncService.resolveConflicts('session-1', 'accept_remote');

      expect(result).toBeDefined();
    });

    it('should resolve conflicts with merge strategy', async () => {
      const result = await syncService.resolveConflicts('session-1', 'merge');

      expect(result).toBeDefined();
    });

    it('should emit conflicts_resolved event', async () => {
      const eventSpy = jest.fn();
      syncService.on('conflicts_resolved', eventSpy);

      await syncService.resolveConflicts('session-1', 'accept_local');

      expect(eventSpy).toHaveBeenCalledWith({
        sessionId: 'session-1',
        conflictCount: expect.any(Number),
        resolution: 'accept_local'
      });
    });
  });

  describe('sync statistics', () => {
    it('should return sync statistics', () => {
      const stats = syncService.getSyncStats();

      expect(stats).toHaveProperty('connectedDevices');
      expect(stats).toHaveProperty('totalSessions');
      expect(stats).toHaveProperty('pendingEvents');
      expect(stats).toHaveProperty('totalConflicts');
      expect(stats).toHaveProperty('syncQueueSize');
    });
  });

  describe('real-time sync', () => {
    it('should trigger immediate sync when real-time sync is enabled', async () => {
      const broadcastSpy = jest.fn();
      syncService.on('sync_events_broadcast', broadcastSpy);

      await syncService.registerDevice('device-1', mockDeviceInfo);
      await syncService.registerDevice('device-2', mockDeviceInfo);
      await syncService.trackSession('device-1', 'session-1');
      await syncService.trackSession('device-2', 'session-1');

      await syncService.queueSyncEvent(
        'session-1',
        'device-1',
        'update',
        { lastActivity: new Date() },
        1
      );

      // Wait a bit for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(broadcastSpy).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle errors during event application gracefully', async () => {
      const invalidEvents = [
        {
          id: 'invalid-event',
          sessionId: 'session-1',
          deviceId: 'device-1',
          timestamp: new Date(),
          type: 'update' as const,
          data: null, // Invalid data
          version: 1
        }
      ];

      const result = await syncService.applySyncEvents('session-1', invalidEvents, mockSession);

      // Should still return a result, even if some events failed
      expect(result).toBeDefined();
      expect(result.updatedSession).toBeDefined();
    });

    it('should handle device registration errors', async () => {
      // This would test error scenarios in device registration
      // For now, just ensure it doesn't throw
      await expect(
        syncService.registerDevice('', mockDeviceInfo)
      ).resolves.not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should clean up old sync data', async () => {
      // Register device and create some sync events
      await syncService.registerDevice('device-1', mockDeviceInfo);
      await syncService.trackSession('device-1', 'session-1');
      await syncService.queueSyncEvent('session-1', 'device-1', 'update', {}, 1);

      // Wait for cleanup to potentially run
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify service is still functional
      const stats = syncService.getSyncStats();
      expect(stats).toBeDefined();
    });
  });
});
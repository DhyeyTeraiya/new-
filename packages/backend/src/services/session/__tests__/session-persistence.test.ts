/**
 * Session Persistence Tests
 */

import { SessionPersistence } from '../session-persistence';
import { PostgresSessionStorage } from '../postgres-storage';
import { MemorySessionStorage } from '../memory-storage';
import { UserSession } from '@browser-ai-agent/shared';
import { createLogger } from '../../../utils/logger';

describe('SessionPersistence', () => {
  let persistence: SessionPersistence;
  let postgresStorage: jest.Mocked<PostgresSessionStorage>;
  let memoryStorage: jest.Mocked<MemorySessionStorage>;
  let logger: any;

  const mockSession: UserSession = {
    id: 'test-session-1',
    userId: 'test-user-1',
    createdAt: new Date(),
    lastActivity: new Date(),
    expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
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
    // Mock storage implementations
    postgresStorage = {
      create: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      getUserSessions: jest.fn(),
      cleanup: jest.fn()
    } as any;

    memoryStorage = {
      create: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      getUserSessions: jest.fn(),
      cleanup: jest.fn()
    } as any;

    logger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

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
  });

  afterEach(async () => {
    await persistence.shutdown();
  });

  describe('createSession', () => {
    it('should create session in primary storage', async () => {
      postgresStorage.create.mockResolvedValue(mockSession);

      const result = await persistence.createSession(mockSession);

      expect(postgresStorage.create).toHaveBeenCalledWith(mockSession);
      expect(result).toEqual(mockSession);
    });

    it('should replicate to secondary storage when replication is enabled', async () => {
      postgresStorage.create.mockResolvedValue(mockSession);
      memoryStorage.get.mockResolvedValue(null);
      memoryStorage.create.mockResolvedValue(mockSession);

      await persistence.createSession(mockSession);

      expect(memoryStorage.create).toHaveBeenCalledWith(mockSession);
    });

    it('should emit sessionCreated event', async () => {
      postgresStorage.create.mockResolvedValue(mockSession);
      
      const eventSpy = jest.fn();
      persistence.on('sessionCreated', eventSpy);

      await persistence.createSession(mockSession);

      expect(eventSpy).toHaveBeenCalledWith(mockSession);
    });
  });

  describe('getSession', () => {
    it('should get session from primary storage', async () => {
      postgresStorage.get.mockResolvedValue(mockSession);

      const result = await persistence.getSession('test-session-1');

      expect(postgresStorage.get).toHaveBeenCalledWith('test-session-1');
      expect(result).toEqual(mockSession);
    });

    it('should fallback to secondary storage if primary fails', async () => {
      postgresStorage.get.mockResolvedValue(null);
      memoryStorage.get.mockResolvedValue(mockSession);

      const result = await persistence.getSession('test-session-1');

      expect(postgresStorage.get).toHaveBeenCalledWith('test-session-1');
      expect(memoryStorage.get).toHaveBeenCalledWith('test-session-1');
      expect(result).toEqual(mockSession);
    });

    it('should return null if session not found in any storage', async () => {
      postgresStorage.get.mockResolvedValue(null);
      memoryStorage.get.mockResolvedValue(null);

      const result = await persistence.getSession('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateSession', () => {
    it('should update session in primary storage', async () => {
      const updates = { lastActivity: new Date() };
      const updatedSession = { ...mockSession, ...updates };

      postgresStorage.get.mockResolvedValue(mockSession);
      postgresStorage.update.mockResolvedValue(updatedSession);

      const result = await persistence.updateSession('test-session-1', updates);

      expect(postgresStorage.update).toHaveBeenCalled();
      expect(result).toEqual(updatedSession);
    });

    it('should throw error if session not found', async () => {
      postgresStorage.get.mockResolvedValue(null);
      memoryStorage.get.mockResolvedValue(null);

      await expect(
        persistence.updateSession('non-existent', {})
      ).rejects.toThrow('Session non-existent not found');
    });

    it('should emit sessionUpdated event', async () => {
      const updates = { lastActivity: new Date() };
      const updatedSession = { ...mockSession, ...updates };

      postgresStorage.get.mockResolvedValue(mockSession);
      postgresStorage.update.mockResolvedValue(updatedSession);

      const eventSpy = jest.fn();
      persistence.on('sessionUpdated', eventSpy);

      await persistence.updateSession('test-session-1', updates);

      expect(eventSpy).toHaveBeenCalledWith(updatedSession);
    });
  });

  describe('deleteSession', () => {
    it('should delete session from both storages', async () => {
      postgresStorage.delete.mockResolvedValue(true);
      memoryStorage.delete.mockResolvedValue(true);

      await persistence.deleteSession('test-session-1');

      expect(postgresStorage.delete).toHaveBeenCalledWith('test-session-1');
      expect(memoryStorage.delete).toHaveBeenCalledWith('test-session-1');
    });

    it('should emit sessionDeleted event', async () => {
      postgresStorage.delete.mockResolvedValue(true);
      
      const eventSpy = jest.fn();
      persistence.on('sessionDeleted', eventSpy);

      await persistence.deleteSession('test-session-1');

      expect(eventSpy).toHaveBeenCalledWith('test-session-1');
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should cleanup expired sessions from both storages', async () => {
      postgresStorage.cleanup.mockResolvedValue(5);
      memoryStorage.cleanup.mockResolvedValue(3);

      const result = await persistence.cleanupExpiredSessions();

      expect(postgresStorage.cleanup).toHaveBeenCalled();
      expect(memoryStorage.cleanup).toHaveBeenCalled();
      expect(result).toBe(5); // Returns primary storage cleanup count
    });

    it('should emit expiredSessionsCleanedUp event', async () => {
      postgresStorage.cleanup.mockResolvedValue(5);
      
      const eventSpy = jest.fn();
      persistence.on('expiredSessionsCleanedUp', eventSpy);

      await persistence.cleanupExpiredSessions();

      expect(eventSpy).toHaveBeenCalledWith(5);
    });
  });

  describe('exportSessions', () => {
    it('should export sessions in JSON format', async () => {
      const sessions = [mockSession];
      postgresStorage.getUserSessions.mockResolvedValue(sessions);

      const result = await persistence.exportSessions({
        format: 'json',
        includeExpired: false
      });

      expect(result).toContain(mockSession.id);
      expect(result).toContain('exportDate');
    });

    it('should export sessions in CSV format', async () => {
      const sessions = [mockSession];
      postgresStorage.getUserSessions.mockResolvedValue(sessions);

      const result = await persistence.exportSessions({
        format: 'csv',
        includeExpired: false
      });

      expect(result).toContain('id,userId,createdAt');
      expect(result).toContain(mockSession.id);
    });
  });

  describe('metrics', () => {
    it('should return session metrics', () => {
      const metrics = persistence.getMetrics();

      expect(metrics).toHaveProperty('totalSessions');
      expect(metrics).toHaveProperty('activeSessions');
      expect(metrics).toHaveProperty('storageUsage');
    });
  });

  describe('caching', () => {
    it('should cache sessions when caching is enabled', async () => {
      postgresStorage.get.mockResolvedValue(mockSession);

      // First call should hit storage
      await persistence.getSession('test-session-1');
      expect(postgresStorage.get).toHaveBeenCalledTimes(1);

      // Second call should hit cache (within cache timeout)
      await persistence.getSession('test-session-1');
      expect(postgresStorage.get).toHaveBeenCalledTimes(1); // Still 1, not called again
    });
  });

  describe('error handling', () => {
    it('should handle storage errors gracefully', async () => {
      postgresStorage.create.mockRejectedValue(new Error('Storage error'));

      await expect(
        persistence.createSession(mockSession)
      ).rejects.toThrow('Storage error');
    });

    it('should continue with secondary storage if primary fails', async () => {
      postgresStorage.get.mockRejectedValue(new Error('Primary storage error'));
      memoryStorage.get.mockResolvedValue(mockSession);

      const result = await persistence.getSession('test-session-1');

      expect(result).toEqual(mockSession);
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
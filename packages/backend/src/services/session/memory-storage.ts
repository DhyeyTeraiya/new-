import { UserSession } from '@browser-ai-agent/shared';
import { SessionStorage } from './session-service';
import { Logger } from 'winston';
import { createLogger } from '../../utils/logger';

/**
 * In-memory session storage implementation
 * Suitable for development and testing
 */
export class MemorySessionStorage implements SessionStorage {
  private readonly logger: Logger;
  private readonly sessions: Map<string, UserSession>;

  constructor() {
    this.logger = createLogger('MemorySessionStorage');
    this.sessions = new Map();
  }

  async create(session: UserSession): Promise<UserSession> {
    this.sessions.set(session.id, { ...session });
    
    this.logger.debug('Session created in memory', {
      sessionId: session.id,
      userId: session.userId,
    });

    return { ...session };
  }

  async get(sessionId: string): Promise<UserSession | null> {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      this.logger.debug('Session not found in memory', { sessionId });
      return null;
    }

    return { ...session };
  }

  async update(sessionId: string, updates: Partial<UserSession>): Promise<UserSession | null> {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      this.logger.debug('Session not found for update', { sessionId });
      return null;
    }

    // Deep merge updates
    const updatedSession = this.deepMerge(session, updates);
    this.sessions.set(sessionId, updatedSession);

    this.logger.debug('Session updated in memory', {
      sessionId,
      updateKeys: Object.keys(updates),
    });

    return { ...updatedSession };
  }

  async delete(sessionId: string): Promise<boolean> {
    const deleted = this.sessions.delete(sessionId);
    
    if (deleted) {
      this.logger.debug('Session deleted from memory', { sessionId });
    }

    return deleted;
  }

  async getUserSessions(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      activeOnly?: boolean;
    }
  ): Promise<UserSession[]> {
    const allSessions = Array.from(this.sessions.values())
      .filter(session => session.userId === userId);

    let filteredSessions = allSessions;

    // Filter active sessions only
    if (options?.activeOnly) {
      const now = new Date();
      filteredSessions = allSessions.filter(session => session.expiresAt > now);
    }

    // Sort by creation date (newest first)
    filteredSessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply pagination
    const offset = options?.offset || 0;
    const limit = options?.limit || filteredSessions.length;
    
    return filteredSessions
      .slice(offset, offset + limit)
      .map(session => ({ ...session }));
  }

  async cleanup(): Promise<number> {
    const now = new Date();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt < now) {
        this.sessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug('Cleaned up expired sessions from memory', {
        cleanedCount,
        remainingSessions: this.sessions.size,
      });
    }

    return cleanedCount;
  }

  /**
   * Get storage statistics
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
  } {
    const now = new Date();
    const allSessions = Array.from(this.sessions.values());
    
    const activeSessions = allSessions.filter(session => session.expiresAt > now);
    const expiredSessions = allSessions.filter(session => session.expiresAt <= now);

    return {
      totalSessions: allSessions.length,
      activeSessions: activeSessions.length,
      expiredSessions: expiredSessions.length,
    };
  }

  /**
   * Clear all sessions (for testing)
   */
  clear(): void {
    this.sessions.clear();
    this.logger.debug('All sessions cleared from memory');
  }

  /**
   * Deep merge utility
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
          result[key] = this.deepMerge(target[key], source[key]);
        } else {
          result[key] = { ...source[key] };
        }
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }
}
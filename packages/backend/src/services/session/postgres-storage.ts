import { Pool } from 'pg';
import { UserSession } from '@browser-ai-agent/shared';
import { SessionStorage } from './session-service';
import { Logger } from 'winston';
import { createLogger } from '../../utils/logger';

/**
 * PostgreSQL session storage implementation
 * Production-ready with persistence
 */
export class PostgresSessionStorage implements SessionStorage {
  private readonly logger: Logger;
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.logger = createLogger('PostgresSessionStorage');
    this.pool = pool;
  }

  async create(session: UserSession): Promise<UserSession> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        INSERT INTO sessions (
          id, user_id, browser_state, conversation_history, 
          preferences, metadata, created_at, last_activity, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const values = [
        session.id,
        session.userId,
        JSON.stringify(session.browserState),
        JSON.stringify(session.conversationHistory),
        JSON.stringify(session.preferences),
        JSON.stringify(session.metadata),
        session.createdAt,
        session.lastActivity,
        session.expiresAt,
      ];

      const result = await client.query(query, values);
      const row = result.rows[0];

      this.logger.debug('Session created in PostgreSQL', {
        sessionId: session.id,
        userId: session.userId,
      });

      return this.mapRowToSession(row);
    } catch (error) {
      this.logger.error('Failed to create session in PostgreSQL', {
        sessionId: session.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async get(sessionId: string): Promise<UserSession | null> {
    const client = await this.pool.connect();
    
    try {
      const query = 'SELECT * FROM sessions WHERE id = $1';
      const result = await client.query(query, [sessionId]);

      if (result.rows.length === 0) {
        this.logger.debug('Session not found in PostgreSQL', { sessionId });
        return null;
      }

      return this.mapRowToSession(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to get session from PostgreSQL', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async update(sessionId: string, updates: Partial<UserSession>): Promise<UserSession | null> {
    const client = await this.pool.connect();
    
    try {
      // Build dynamic update query
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.browserState !== undefined) {
        updateFields.push(`browser_state = $${paramIndex++}`);
        values.push(JSON.stringify(updates.browserState));
      }

      if (updates.conversationHistory !== undefined) {
        updateFields.push(`conversation_history = $${paramIndex++}`);
        values.push(JSON.stringify(updates.conversationHistory));
      }

      if (updates.preferences !== undefined) {
        updateFields.push(`preferences = $${paramIndex++}`);
        values.push(JSON.stringify(updates.preferences));
      }

      if (updates.metadata !== undefined) {
        updateFields.push(`metadata = $${paramIndex++}`);
        values.push(JSON.stringify(updates.metadata));
      }

      if (updates.lastActivity !== undefined) {
        updateFields.push(`last_activity = $${paramIndex++}`);
        values.push(updates.lastActivity);
      }

      if (updates.expiresAt !== undefined) {
        updateFields.push(`expires_at = $${paramIndex++}`);
        values.push(updates.expiresAt);
      }

      if (updateFields.length === 0) {
        // No updates to apply
        return await this.get(sessionId);
      }

      values.push(sessionId); // For WHERE clause

      const query = `
        UPDATE sessions 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await client.query(query, values);

      if (result.rows.length === 0) {
        this.logger.debug('Session not found for update', { sessionId });
        return null;
      }

      this.logger.debug('Session updated in PostgreSQL', {
        sessionId,
        updateFields: updateFields.length,
      });

      return this.mapRowToSession(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to update session in PostgreSQL', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(sessionId: string): Promise<boolean> {
    const client = await this.pool.connect();
    
    try {
      const query = 'DELETE FROM sessions WHERE id = $1';
      const result = await client.query(query, [sessionId]);

      const deleted = result.rowCount > 0;
      
      if (deleted) {
        this.logger.debug('Session deleted from PostgreSQL', { sessionId });
      }

      return deleted;
    } catch (error) {
      this.logger.error('Failed to delete session from PostgreSQL', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async getUserSessions(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      activeOnly?: boolean;
    }
  ): Promise<UserSession[]> {
    const client = await this.pool.connect();
    
    try {
      let query = 'SELECT * FROM sessions WHERE user_id = $1';
      const values: any[] = [userId];
      let paramIndex = 2;

      // Filter active sessions only
      if (options?.activeOnly) {
        query += ` AND expires_at > $${paramIndex++}`;
        values.push(new Date());
      }

      // Order by creation date (newest first)
      query += ' ORDER BY created_at DESC';

      // Apply pagination
      if (options?.limit !== undefined) {
        query += ` LIMIT $${paramIndex++}`;
        values.push(options.limit);
      }

      if (options?.offset !== undefined) {
        query += ` OFFSET $${paramIndex++}`;
        values.push(options.offset);
      }

      const result = await client.query(query, values);

      return result.rows.map(row => this.mapRowToSession(row));
    } catch (error) {
      this.logger.error('Failed to get user sessions from PostgreSQL', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async cleanup(): Promise<number> {
    const client = await this.pool.connect();
    
    try {
      const query = 'DELETE FROM sessions WHERE expires_at < $1';
      const result = await client.query(query, [new Date()]);

      const cleanedCount = result.rowCount || 0;

      if (cleanedCount > 0) {
        this.logger.debug('Cleaned up expired sessions from PostgreSQL', {
          cleanedCount,
        });
      }

      return cleanedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup sessions in PostgreSQL', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
  }> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT 
          COUNT(*) as total_sessions,
          COUNT(CASE WHEN expires_at > NOW() THEN 1 END) as active_sessions,
          COUNT(CASE WHEN expires_at <= NOW() THEN 1 END) as expired_sessions
        FROM sessions
      `;

      const result = await client.query(query);
      const row = result.rows[0];

      return {
        totalSessions: parseInt(row.total_sessions),
        activeSessions: parseInt(row.active_sessions),
        expiredSessions: parseInt(row.expired_sessions),
      };
    } catch (error) {
      this.logger.error('Failed to get session stats from PostgreSQL', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Map database row to UserSession object
   */
  private mapRowToSession(row: any): UserSession {
    return {
      id: row.id,
      userId: row.user_id,
      browserState: row.browser_state,
      conversationHistory: row.conversation_history || [],
      preferences: row.preferences,
      metadata: row.metadata,
      createdAt: row.created_at,
      lastActivity: row.last_activity,
      expiresAt: row.expires_at,
    };
  }
}
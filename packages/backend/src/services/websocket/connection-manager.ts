import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { 
  WebSocketMessage, 
  WebSocketMessageType,
  ConnectionInfo,
  ClientInfo 
} from '@browser-ai-agent/shared';
import { AuthMiddleware } from '../../middleware/auth';
import { Logger } from 'winston';
import { createLogger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface ConnectionManagerConfig {
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
  heartbeatInterval: number;
  connectionTimeout: number;
  maxConnections: number;
  enableCompression: boolean;
}

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  sessionId?: string;
  connectionId?: string;
  clientInfo?: ClientInfo;
}

export class ConnectionManager {
  private readonly logger: Logger;
  private readonly config: ConnectionManagerConfig;
  private readonly authMiddleware: AuthMiddleware;
  private io: SocketIOServer;
  private connections: Map<string, ConnectionInfo>;
  private userConnections: Map<string, Set<string>>; // userId -> connectionIds
  private sessionConnections: Map<string, Set<string>>; // sessionId -> connectionIds
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(
    httpServer: HTTPServer,
    config: ConnectionManagerConfig,
    authMiddleware: AuthMiddleware
  ) {
    this.logger = createLogger('ConnectionManager');
    this.config = config;
    this.authMiddleware = authMiddleware;
    this.connections = new Map();
    this.userConnections = new Map();
    this.sessionConnections = new Map();

    // Initialize Socket.IO server
    this.io = new SocketIOServer(httpServer, {
      cors: config.cors,
      compression: config.enableCompression,
      pingTimeout: config.connectionTimeout,
      pingInterval: config.heartbeatInterval,
      transports: ['websocket', 'polling'],
    });

    this.setupEventHandlers();
    this.startHeartbeat();

    this.logger.info('WebSocket Connection Manager initialized', {
      maxConnections: config.maxConnections,
      heartbeatInterval: config.heartbeatInterval,
    });
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupEventHandlers(): void {
    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        await this.authenticateSocket(socket);
        next();
      } catch (error) {
        this.logger.warn('Socket authentication failed', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        next(new Error('Authentication failed'));
      }
    });

    // Connection handler
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      this.handleConnection(socket);
    });
  }

  /**
   * Authenticate socket connection
   */
  private async authenticateSocket(socket: AuthenticatedSocket): Promise<void> {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    
    if (!token) {
      // Allow anonymous connections if configured
      socket.userId = `anonymous-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      socket.sessionId = socket.handshake.query?.sessionId as string;
      return;
    }

    try {
      const decoded = this.authMiddleware.verifyToken(token as string);
      socket.userId = decoded.userId;
      socket.sessionId = decoded.sessionId || socket.handshake.query?.sessionId as string;
    } catch (error) {
      throw new Error('Invalid authentication token');
    }
  }

  /**
   * Handle new socket connection
   */
  private handleConnection(socket: AuthenticatedSocket): void {
    // Check connection limit
    if (this.connections.size >= this.config.maxConnections) {
      this.logger.warn('Connection limit exceeded', {
        currentConnections: this.connections.size,
        maxConnections: this.config.maxConnections,
      });
      socket.emit('error', { code: 'CONNECTION_LIMIT_EXCEEDED', message: 'Too many connections' });
      socket.disconnect();
      return;
    }

    // Generate connection ID and extract client info
    socket.connectionId = uuidv4();
    socket.clientInfo = this.extractClientInfo(socket);

    // Create connection info
    const connectionInfo: ConnectionInfo = {
      id: socket.connectionId,
      sessionId: socket.sessionId || '',
      userId: socket.userId || '',
      connectedAt: new Date(),
      lastActivity: new Date(),
      clientInfo: socket.clientInfo,
    };

    // Store connection
    this.connections.set(socket.connectionId, connectionInfo);
    this.addUserConnection(socket.userId!, socket.connectionId);
    
    if (socket.sessionId) {
      this.addSessionConnection(socket.sessionId, socket.connectionId);
    }

    this.logger.info('WebSocket connection established', {
      connectionId: socket.connectionId,
      userId: socket.userId,
      sessionId: socket.sessionId,
      clientType: socket.clientInfo.type,
      totalConnections: this.connections.size,
    });

    // Setup socket event handlers
    this.setupSocketHandlers(socket);

    // Send connection confirmation
    socket.emit('connection_status', {
      status: 'connected',
      connectionId: socket.connectionId,
      message: 'WebSocket connection established',
    });
  }

  /**
   * Setup individual socket event handlers
   */
  private setupSocketHandlers(socket: AuthenticatedSocket): void {
    // Handle incoming messages
    socket.on('message', (data: WebSocketMessage) => {
      this.handleMessage(socket, data);
    });

    // Handle ping/pong for heartbeat
    socket.on('ping', () => {
      this.updateLastActivity(socket.connectionId!);
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, reason);
    });

    // Handle errors
    socket.on('error', (error) => {
      this.logger.error('Socket error', {
        connectionId: socket.connectionId,
        userId: socket.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });

    // Join session room if session ID is provided
    if (socket.sessionId) {
      socket.join(`session:${socket.sessionId}`);
    }

    // Join user room
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(socket: AuthenticatedSocket, data: WebSocketMessage): void {
    this.updateLastActivity(socket.connectionId!);

    this.logger.debug('WebSocket message received', {
      connectionId: socket.connectionId,
      messageType: data.type,
      messageId: data.id,
    });

    // Validate message structure
    if (!this.isValidMessage(data)) {
      socket.emit('error', {
        code: 'INVALID_MESSAGE',
        message: 'Invalid message format',
      });
      return;
    }

    // Emit message to other handlers
    this.io.emit('internal_message', {
      socket,
      message: data,
      connectionInfo: this.connections.get(socket.connectionId!),
    });
  }

  /**
   * Handle socket disconnection
   */
  private handleDisconnection(socket: AuthenticatedSocket, reason: string): void {
    this.logger.info('WebSocket connection closed', {
      connectionId: socket.connectionId,
      userId: socket.userId,
      sessionId: socket.sessionId,
      reason,
      totalConnections: this.connections.size - 1,
    });

    // Clean up connection tracking
    if (socket.connectionId) {
      this.connections.delete(socket.connectionId);
      this.removeUserConnection(socket.userId!, socket.connectionId);
      
      if (socket.sessionId) {
        this.removeSessionConnection(socket.sessionId, socket.connectionId);
      }
    }
  }

  /**
   * Send message to specific connection
   */
  sendToConnection(connectionId: string, message: WebSocketMessage): boolean {
    const socket = this.getSocketByConnectionId(connectionId);
    if (!socket) {
      this.logger.warn('Connection not found for message', { connectionId });
      return false;
    }

    socket.emit('message', message);
    this.updateLastActivity(connectionId);
    return true;
  }

  /**
   * Send message to all connections of a user
   */
  sendToUser(userId: string, message: WebSocketMessage): number {
    const connectionIds = this.userConnections.get(userId);
    if (!connectionIds || connectionIds.size === 0) {
      this.logger.debug('No connections found for user', { userId });
      return 0;
    }

    let sentCount = 0;
    for (const connectionId of connectionIds) {
      if (this.sendToConnection(connectionId, message)) {
        sentCount++;
      }
    }

    this.logger.debug('Message sent to user connections', {
      userId,
      sentCount,
      totalConnections: connectionIds.size,
    });

    return sentCount;
  }

  /**
   * Send message to all connections of a session
   */
  sendToSession(sessionId: string, message: WebSocketMessage): number {
    const connectionIds = this.sessionConnections.get(sessionId);
    if (!connectionIds || connectionIds.size === 0) {
      this.logger.debug('No connections found for session', { sessionId });
      return 0;
    }

    let sentCount = 0;
    for (const connectionId of connectionIds) {
      if (this.sendToConnection(connectionId, message)) {
        sentCount++;
      }
    }

    this.logger.debug('Message sent to session connections', {
      sessionId,
      sentCount,
      totalConnections: connectionIds.size,
    });

    return sentCount;
  }

  /**
   * Broadcast message to all connections
   */
  broadcast(message: WebSocketMessage, excludeConnectionId?: string): number {
    let sentCount = 0;

    for (const [connectionId] of this.connections) {
      if (connectionId !== excludeConnectionId) {
        if (this.sendToConnection(connectionId, message)) {
          sentCount++;
        }
      }
    }

    this.logger.debug('Message broadcasted', {
      sentCount,
      totalConnections: this.connections.size,
      excluded: excludeConnectionId,
    });

    return sentCount;
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalConnections: number;
    connectionsByType: Record<string, number>;
    connectionsByUser: number;
    connectionsBySession: number;
    oldestConnection: Date | null;
  } {
    const connectionsByType: Record<string, number> = {};
    let oldestTime = Infinity;

    for (const connection of this.connections.values()) {
      const type = connection.clientInfo.type;
      connectionsByType[type] = (connectionsByType[type] || 0) + 1;

      const connectionTime = connection.connectedAt.getTime();
      if (connectionTime < oldestTime) {
        oldestTime = connectionTime;
      }
    }

    return {
      totalConnections: this.connections.size,
      connectionsByType,
      connectionsByUser: this.userConnections.size,
      connectionsBySession: this.sessionConnections.size,
      oldestConnection: oldestTime === Infinity ? null : new Date(oldestTime),
    };
  }

  /**
   * Get connections for a user
   */
  getUserConnections(userId: string): ConnectionInfo[] {
    const connectionIds = this.userConnections.get(userId);
    if (!connectionIds) {
      return [];
    }

    const connections: ConnectionInfo[] = [];
    for (const connectionId of connectionIds) {
      const connection = this.connections.get(connectionId);
      if (connection) {
        connections.push(connection);
      }
    }

    return connections;
  }

  /**
   * Get connections for a session
   */
  getSessionConnections(sessionId: string): ConnectionInfo[] {
    const connectionIds = this.sessionConnections.get(sessionId);
    if (!connectionIds) {
      return [];
    }

    const connections: ConnectionInfo[] = [];
    for (const connectionId of connectionIds) {
      const connection = this.connections.get(connectionId);
      if (connection) {
        connections.push(connection);
      }
    }

    return connections;
  }

  /**
   * Disconnect user connections
   */
  disconnectUser(userId: string, reason: string = 'Server disconnect'): number {
    const connectionIds = this.userConnections.get(userId);
    if (!connectionIds) {
      return 0;
    }

    let disconnectedCount = 0;
    for (const connectionId of connectionIds) {
      const socket = this.getSocketByConnectionId(connectionId);
      if (socket) {
        socket.disconnect(true);
        disconnectedCount++;
      }
    }

    this.logger.info('User connections disconnected', {
      userId,
      disconnectedCount,
      reason,
    });

    return disconnectedCount;
  }

  /**
   * Shutdown connection manager
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down WebSocket Connection Manager');

    // Stop heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // Disconnect all clients
    this.io.emit('connection_status', {
      status: 'disconnected',
      message: 'Server shutting down',
    });

    // Close server
    await new Promise<void>((resolve) => {
      this.io.close(() => {
        this.logger.info('WebSocket server closed');
        resolve();
      });
    });

    // Clear connection tracking
    this.connections.clear();
    this.userConnections.clear();
    this.sessionConnections.clear();
  }

  /**
   * Private helper methods
   */
  private extractClientInfo(socket: AuthenticatedSocket): ClientInfo {
    const userAgent = socket.handshake.headers['user-agent'] || '';
    const clientType = socket.handshake.query?.clientType as string || 'web';
    const clientVersion = socket.handshake.query?.clientVersion as string || '1.0.0';

    return {
      userAgent,
      ipAddress: socket.handshake.address,
      type: clientType as 'extension' | 'web' | 'mobile',
      version: clientVersion,
    };
  }

  private addUserConnection(userId: string, connectionId: string): void {
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(connectionId);
  }

  private removeUserConnection(userId: string, connectionId: string): void {
    const connections = this.userConnections.get(userId);
    if (connections) {
      connections.delete(connectionId);
      if (connections.size === 0) {
        this.userConnections.delete(userId);
      }
    }
  }

  private addSessionConnection(sessionId: string, connectionId: string): void {
    if (!this.sessionConnections.has(sessionId)) {
      this.sessionConnections.set(sessionId, new Set());
    }
    this.sessionConnections.get(sessionId)!.add(connectionId);
  }

  private removeSessionConnection(sessionId: string, connectionId: string): void {
    const connections = this.sessionConnections.get(sessionId);
    if (connections) {
      connections.delete(connectionId);
      if (connections.size === 0) {
        this.sessionConnections.delete(sessionId);
      }
    }
  }

  private getSocketByConnectionId(connectionId: string): AuthenticatedSocket | null {
    for (const [, socket] of this.io.sockets.sockets) {
      if ((socket as AuthenticatedSocket).connectionId === connectionId) {
        return socket as AuthenticatedSocket;
      }
    }
    return null;
  }

  private updateLastActivity(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastActivity = new Date();
    }
  }

  private isValidMessage(data: any): data is WebSocketMessage {
    return (
      data &&
      typeof data.id === 'string' &&
      typeof data.type === 'string' &&
      data.payload !== undefined &&
      typeof data.sessionId === 'string' &&
      data.timestamp instanceof Date || typeof data.timestamp === 'string'
    );
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const timeoutThreshold = now - (this.config.connectionTimeout * 2);

      // Check for stale connections
      for (const [connectionId, connection] of this.connections) {
        if (connection.lastActivity.getTime() < timeoutThreshold) {
          this.logger.warn('Stale connection detected', {
            connectionId,
            lastActivity: connection.lastActivity,
          });

          const socket = this.getSocketByConnectionId(connectionId);
          if (socket) {
            socket.disconnect(true);
          }
        }
      }
    }, this.config.heartbeatInterval);
  }
}
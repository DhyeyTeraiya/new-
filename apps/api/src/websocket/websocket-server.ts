import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { logger } from '../utils/logger';
import JWTService from '../auth/jwt-service';
import AuthorizationService from '../auth/authorization-service';
import { RedisService } from '../services/redis';

// =============================================================================
// REAL-TIME WEBSOCKET SERVER (Superior to Basic Socket.io)
// Master Plan: Enterprise-grade WebSocket with authentication and room management
// =============================================================================

export interface SocketUser {
  id: string;
  email: string;
  role: string;
  permissions: string[];
  sessionId: string;
  connectedAt: Date;
  lastActivity: Date;
}

export interface SocketConnection {
  id: string;
  userId: string;
  user: SocketUser;
  rooms: Set<string>;
  metadata: {
    ip: string;
    userAgent: string;
    deviceId?: string;
    platform?: string;
  };
  isAuthenticated: boolean;
  connectedAt: Date;
  lastPing: Date;
}

export interface WebSocketMessage {
  type: string;
  event: string;
  data: any;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
  requestId?: string;
}

export interface RoomInfo {
  id: string;
  name: string;
  type: 'user' | 'task' | 'workflow' | 'admin' | 'broadcast';
  members: Set<string>;
  permissions: string[];
  metadata: Record<string, any>;
  createdAt: Date;
  lastActivity: Date;
}

// =============================================================================
// WEBSOCKET SERVER IMPLEMENTATION
// =============================================================================

export class WebSocketServer {
  private io: SocketIOServer;
  private jwtService: JWTService;
  private authService: AuthorizationService;
  private redisService: RedisService;
  private connections: Map<string, SocketConnection> = new Map();
  private rooms: Map<string, RoomInfo> = new Map();
  private messageQueue: WebSocketMessage[] = [];
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(httpServer: HTTPServer) {
    this.jwtService = JWTService.getInstance();
    this.authService = AuthorizationService.getInstance();
    this.redisService = RedisService.getInstance();

    // Initialize Socket.io with advanced configuration
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
      upgradeTimeout: 10000,
      maxHttpBufferSize: 1e6, // 1MB
      allowEIO3: true,
      compression: true,
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    this.startHeartbeat();
    this.initializeDefaultRooms();

    logger.info('WebSocket Server initialized');
  }

  // =============================================================================
  // MIDDLEWARE SETUP
  // =============================================================================

  private setupMiddleware(): void {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Validate JWT token
        const validation = await this.jwtService.validateAccessToken(token);
        
        if (!validation.valid || !validation.payload) {
          return next(new Error(validation.error || 'Invalid token'));
        }

        const payload = validation.payload;

        // Create socket user
        const socketUser: SocketUser = {
          id: payload.userId,
          email: payload.email,
          role: payload.role,
          permissions: payload.permissions,
          sessionId: payload.sessionId,
          connectedAt: new Date(),
          lastActivity: new Date(),
        };

        // Attach user to socket
        (socket as any).user = socketUser;

        logger.info('Socket authenticated', {
          socketId: socket.id,
          userId: socketUser.id,
          sessionId: socketUser.sessionId,
        });

        next();
      } catch (error) {
        logger.error('Socket authentication failed', {
          socketId: socket.id,
          error: error.message,
        });
        next(new Error('Authentication failed'));
      }
    });

    // Rate limiting middleware
    this.io.use(async (socket, next) => {
      const userId = (socket as any).user?.id;
      
      if (userId) {
        const connectionCount = await this.getUserConnectionCount(userId);
        
        if (connectionCount >= 5) { // Max 5 connections per user
          return next(new Error('Too many connections'));
        }
      }

      next();
    });

    logger.info('WebSocket middleware configured');
  }

  // =============================================================================
  // EVENT HANDLERS
  // =============================================================================

  private setupEventHandlers(): void {
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    logger.info('WebSocket event handlers configured');
  }

  private async handleConnection(socket: any): Promise<void> {
    const user = socket.user as SocketUser;
    const connectionId = socket.id;

    try {
      // Create connection record
      const connection: SocketConnection = {
        id: connectionId,
        userId: user.id,
        user,
        rooms: new Set(),
        metadata: {
          ip: socket.handshake.address,
          userAgent: socket.handshake.headers['user-agent'],
          deviceId: socket.handshake.query.deviceId,
          platform: socket.handshake.query.platform,
        },
        isAuthenticated: true,
        connectedAt: new Date(),
        lastPing: new Date(),
      };

      this.connections.set(connectionId, connection);

      // Join user-specific room
      const userRoom = `user:${user.id}`;
      await socket.join(userRoom);
      connection.rooms.add(userRoom);

      // Join role-based room
      const roleRoom = `role:${user.role}`;
      await socket.join(roleRoom);
      connection.rooms.add(roleRoom);

      // Store connection in Redis for clustering
      await this.storeConnection(connection);

      logger.info('Socket connected', {
        socketId: connectionId,
        userId: user.id,
        userRoom,
        roleRoom,
        totalConnections: this.connections.size,
      });

      // Send welcome message
      socket.emit('connected', {
        message: 'Connected successfully',
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        server: {
          timestamp: new Date().toISOString(),
          version: '1.0.0',
        },
      });

      // Setup socket event handlers
      this.setupSocketEvents(socket, connection);

    } catch (error) {
      logger.error('Connection setup failed', {
        socketId: connectionId,
        userId: user.id,
        error: error.message,
      });
      socket.disconnect(true);
    }
  }

  private setupSocketEvents(socket: any, connection: SocketConnection): void {
    // Heartbeat/ping handler
    socket.on('ping', () => {
      connection.lastPing = new Date();
      connection.user.lastActivity = new Date();
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    // Join room handler
    socket.on('join_room', async (data: { room: string; password?: string }) => {
      await this.handleJoinRoom(socket, connection, data);
    });

    // Leave room handler
    socket.on('leave_room', async (data: { room: string }) => {
      await this.handleLeaveRoom(socket, connection, data);
    });

    // Task subscription handler
    socket.on('subscribe_task', async (data: { taskId: string }) => {
      await this.handleTaskSubscription(socket, connection, data);
    });

    // Workflow subscription handler
    socket.on('subscribe_workflow', async (data: { workflowId: string }) => {
      await this.handleWorkflowSubscription(socket, connection, data);
    });

    // Agent communication handler
    socket.on('agent_message', async (data: any) => {
      await this.handleAgentMessage(socket, connection, data);
    });

    // Custom message handler
    socket.on('message', async (data: any) => {
      await this.handleCustomMessage(socket, connection, data);
    });

    // Disconnect handler
    socket.on('disconnect', (reason: string) => {
      this.handleDisconnection(socket, connection, reason);
    });

    // Error handler
    socket.on('error', (error: Error) => {
      logger.error('Socket error', {
        socketId: socket.id,
        userId: connection.userId,
        error: error.message,
      });
    });
  }

  // =============================================================================
  // ROOM MANAGEMENT
  // =============================================================================

  private async handleJoinRoom(socket: any, connection: SocketConnection, data: { room: string; password?: string }): Promise<void> {
    const { room, password } = data;

    try {
      // Check if user has permission to join room
      const hasPermission = await this.checkRoomPermission(connection.user, room, 'join');
      
      if (!hasPermission) {
        socket.emit('room_error', {
          error: 'Permission denied',
          message: `You don't have permission to join room: ${room}`,
        });
        return;
      }

      // Validate room password if required
      const roomInfo = this.rooms.get(room);
      if (roomInfo?.metadata.password && roomInfo.metadata.password !== password) {
        socket.emit('room_error', {
          error: 'Invalid password',
          message: 'Room password is incorrect',
        });
        return;
      }

      // Join the room
      await socket.join(room);
      connection.rooms.add(room);

      // Update room info
      if (roomInfo) {
        roomInfo.members.add(connection.id);
        roomInfo.lastActivity = new Date();
      }

      logger.info('User joined room', {
        socketId: socket.id,
        userId: connection.userId,
        room,
      });

      socket.emit('room_joined', {
        room,
        message: `Joined room: ${room}`,
        members: roomInfo ? roomInfo.members.size : 1,
      });

      // Notify other room members
      socket.to(room).emit('user_joined_room', {
        room,
        user: {
          id: connection.user.id,
          email: connection.user.email,
        },
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error('Join room failed', {
        socketId: socket.id,
        userId: connection.userId,
        room,
        error: error.message,
      });

      socket.emit('room_error', {
        error: 'Join failed',
        message: 'Failed to join room',
      });
    }
  }

  private async handleLeaveRoom(socket: any, connection: SocketConnection, data: { room: string }): Promise<void> {
    const { room } = data;

    try {
      await socket.leave(room);
      connection.rooms.delete(room);

      // Update room info
      const roomInfo = this.rooms.get(room);
      if (roomInfo) {
        roomInfo.members.delete(connection.id);
        roomInfo.lastActivity = new Date();
      }

      logger.info('User left room', {
        socketId: socket.id,
        userId: connection.userId,
        room,
      });

      socket.emit('room_left', {
        room,
        message: `Left room: ${room}`,
      });

      // Notify other room members
      socket.to(room).emit('user_left_room', {
        room,
        user: {
          id: connection.user.id,
          email: connection.user.email,
        },
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error('Leave room failed', {
        socketId: socket.id,
        userId: connection.userId,
        room,
        error: error.message,
      });
    }
  }

  // =============================================================================
  // SUBSCRIPTION HANDLERS
  // =============================================================================

  private async handleTaskSubscription(socket: any, connection: SocketConnection, data: { taskId: string }): Promise<void> {
    const { taskId } = data;

    try {
      // Check if user has permission to subscribe to task
      const hasPermission = await this.authService.hasPermission(
        connection.userId,
        'automation',
        'read'
      );

      if (!hasPermission) {
        socket.emit('subscription_error', {
          error: 'Permission denied',
          message: 'You don\'t have permission to subscribe to tasks',
        });
        return;
      }

      const taskRoom = `task:${taskId}`;
      await socket.join(taskRoom);
      connection.rooms.add(taskRoom);

      logger.info('User subscribed to task', {
        socketId: socket.id,
        userId: connection.userId,
        taskId,
      });

      socket.emit('task_subscribed', {
        taskId,
        message: `Subscribed to task updates: ${taskId}`,
      });

    } catch (error) {
      logger.error('Task subscription failed', {
        socketId: socket.id,
        userId: connection.userId,
        taskId,
        error: error.message,
      });

      socket.emit('subscription_error', {
        error: 'Subscription failed',
        message: 'Failed to subscribe to task',
      });
    }
  }

  private async handleWorkflowSubscription(socket: any, connection: SocketConnection, data: { workflowId: string }): Promise<void> {
    const { workflowId } = data;

    try {
      // Check if user has permission to subscribe to workflow
      const hasPermission = await this.authService.hasPermission(
        connection.userId,
        'workflow',
        'read'
      );

      if (!hasPermission) {
        socket.emit('subscription_error', {
          error: 'Permission denied',
          message: 'You don\'t have permission to subscribe to workflows',
        });
        return;
      }

      const workflowRoom = `workflow:${workflowId}`;
      await socket.join(workflowRoom);
      connection.rooms.add(workflowRoom);

      logger.info('User subscribed to workflow', {
        socketId: socket.id,
        userId: connection.userId,
        workflowId,
      });

      socket.emit('workflow_subscribed', {
        workflowId,
        message: `Subscribed to workflow updates: ${workflowId}`,
      });

    } catch (error) {
      logger.error('Workflow subscription failed', {
        socketId: socket.id,
        userId: connection.userId,
        workflowId,
        error: error.message,
      });

      socket.emit('subscription_error', {
        error: 'Subscription failed',
        message: 'Failed to subscribe to workflow',
      });
    }
  }

  // =============================================================================
  // MESSAGE HANDLERS
  // =============================================================================

  private async handleAgentMessage(socket: any, connection: SocketConnection, data: any): Promise<void> {
    try {
      // Validate agent message
      if (!data.type || !data.payload) {
        socket.emit('message_error', {
          error: 'Invalid message',
          message: 'Agent message must have type and payload',
        });
        return;
      }

      // Check permissions for agent communication
      const hasPermission = await this.authService.hasPermission(
        connection.userId,
        'agent',
        'communicate'
      );

      if (!hasPermission) {
        socket.emit('message_error', {
          error: 'Permission denied',
          message: 'You don\'t have permission for agent communication',
        });
        return;
      }

      const message: WebSocketMessage = {
        type: 'agent',
        event: data.type,
        data: data.payload,
        timestamp: new Date(),
        userId: connection.userId,
        sessionId: connection.user.sessionId,
        requestId: data.requestId,
      };

      // Route message to appropriate handlers
      await this.routeAgentMessage(message);

      logger.info('Agent message processed', {
        socketId: socket.id,
        userId: connection.userId,
        messageType: data.type,
      });

    } catch (error) {
      logger.error('Agent message handling failed', {
        socketId: socket.id,
        userId: connection.userId,
        error: error.message,
      });

      socket.emit('message_error', {
        error: 'Message processing failed',
        message: 'Failed to process agent message',
      });
    }
  }

  private async handleCustomMessage(socket: any, connection: SocketConnection, data: any): Promise<void> {
    try {
      const message: WebSocketMessage = {
        type: 'custom',
        event: data.event || 'message',
        data: data.payload || data,
        timestamp: new Date(),
        userId: connection.userId,
        sessionId: connection.user.sessionId,
        requestId: data.requestId,
      };

      // Add to message queue for processing
      this.messageQueue.push(message);

      // Process message queue if needed
      if (this.messageQueue.length > 100) {
        await this.processMessageQueue();
      }

      logger.debug('Custom message received', {
        socketId: socket.id,
        userId: connection.userId,
        event: message.event,
      });

    } catch (error) {
      logger.error('Custom message handling failed', {
        socketId: socket.id,
        userId: connection.userId,
        error: error.message,
      });
    }
  }

  // =============================================================================
  // DISCONNECTION HANDLING
  // =============================================================================

  private async handleDisconnection(socket: any, connection: SocketConnection, reason: string): Promise<void> {
    try {
      // Remove from all rooms
      for (const room of connection.rooms) {
        const roomInfo = this.rooms.get(room);
        if (roomInfo) {
          roomInfo.members.delete(connection.id);
        }
      }

      // Remove connection
      this.connections.delete(connection.id);

      // Remove from Redis
      await this.removeConnection(connection.id);

      logger.info('Socket disconnected', {
        socketId: socket.id,
        userId: connection.userId,
        reason,
        duration: Date.now() - connection.connectedAt.getTime(),
        totalConnections: this.connections.size,
      });

    } catch (error) {
      logger.error('Disconnection handling failed', {
        socketId: socket.id,
        userId: connection.userId,
        error: error.message,
      });
    }
  }

  // =============================================================================
  // BROADCASTING METHODS
  // =============================================================================

  public async broadcastToUser(userId: string, event: string, data: any): Promise<void> {
    const room = `user:${userId}`;
    this.io.to(room).emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });

    logger.debug('Broadcast to user', { userId, event });
  }

  public async broadcastToRole(role: string, event: string, data: any): Promise<void> {
    const room = `role:${role}`;
    this.io.to(room).emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });

    logger.debug('Broadcast to role', { role, event });
  }

  public async broadcastToRoom(roomId: string, event: string, data: any): Promise<void> {
    this.io.to(roomId).emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });

    logger.debug('Broadcast to room', { roomId, event });
  }

  public async broadcastToAll(event: string, data: any): Promise<void> {
    this.io.emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });

    logger.debug('Broadcast to all', { event });
  }

  // =============================================================================
  // TASK AND WORKFLOW UPDATES
  // =============================================================================

  public async sendTaskUpdate(taskId: string, update: any): Promise<void> {
    const room = `task:${taskId}`;
    this.io.to(room).emit('task_update', {
      taskId,
      update,
      timestamp: new Date().toISOString(),
    });

    logger.debug('Task update sent', { taskId, updateType: update.type });
  }

  public async sendWorkflowUpdate(workflowId: string, update: any): Promise<void> {
    const room = `workflow:${workflowId}`;
    this.io.to(room).emit('workflow_update', {
      workflowId,
      update,
      timestamp: new Date().toISOString(),
    });

    logger.debug('Workflow update sent', { workflowId, updateType: update.type });
  }

  public async sendAgentUpdate(agentId: string, update: any): Promise<void> {
    const room = `agent:${agentId}`;
    this.io.to(room).emit('agent_update', {
      agentId,
      update,
      timestamp: new Date().toISOString(),
    });

    logger.debug('Agent update sent', { agentId, updateType: update.type });
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  private async checkRoomPermission(user: SocketUser, room: string, action: string): Promise<boolean> {
    // Check if user has permission to perform action on room
    if (room.startsWith('admin:') && user.role !== 'admin') {
      return false;
    }

    if (room.startsWith('user:')) {
      const roomUserId = room.split(':')[1];
      return roomUserId === user.id || user.role === 'admin';
    }

    return true; // Allow other rooms by default
  }

  private async getUserConnectionCount(userId: string): Promise<number> {
    let count = 0;
    for (const connection of this.connections.values()) {
      if (connection.userId === userId) {
        count++;
      }
    }
    return count;
  }

  private async routeAgentMessage(message: WebSocketMessage): Promise<void> {
    // Route agent messages to appropriate handlers
    // This would integrate with the agent system
    logger.debug('Routing agent message', {
      type: message.type,
      event: message.event,
      userId: message.userId,
    });
  }

  private async processMessageQueue(): Promise<void> {
    const messages = this.messageQueue.splice(0, 100);
    
    for (const message of messages) {
      // Process each message
      logger.debug('Processing queued message', {
        type: message.type,
        event: message.event,
      });
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      const timeout = 60000; // 1 minute timeout

      for (const [socketId, connection] of this.connections.entries()) {
        if (now.getTime() - connection.lastPing.getTime() > timeout) {
          logger.warn('Connection timeout, disconnecting', {
            socketId,
            userId: connection.userId,
          });

          const socket = this.io.sockets.sockets.get(socketId);
          if (socket) {
            socket.disconnect(true);
          }
        }
      }
    }, 30000); // Check every 30 seconds
  }

  private initializeDefaultRooms(): void {
    // Create default rooms
    const defaultRooms = [
      {
        id: 'general',
        name: 'General',
        type: 'broadcast' as const,
        permissions: [],
      },
      {
        id: 'admin',
        name: 'Admin',
        type: 'admin' as const,
        permissions: ['admin'],
      },
    ];

    for (const roomData of defaultRooms) {
      const room: RoomInfo = {
        ...roomData,
        members: new Set(),
        metadata: {},
        createdAt: new Date(),
        lastActivity: new Date(),
      };

      this.rooms.set(room.id, room);
    }

    logger.info('Default rooms initialized', { count: defaultRooms.length });
  }

  // =============================================================================
  // REDIS OPERATIONS
  // =============================================================================

  private async storeConnection(connection: SocketConnection): Promise<void> {
    const key = `ws_connection:${connection.id}`;
    const data = {
      id: connection.id,
      userId: connection.userId,
      connectedAt: connection.connectedAt.toISOString(),
      metadata: connection.metadata,
    };

    await this.redisService.setex(key, 3600, JSON.stringify(data)); // 1 hour TTL
  }

  private async removeConnection(connectionId: string): Promise<void> {
    const key = `ws_connection:${connectionId}`;
    await this.redisService.del(key);
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  public getConnectionCount(): number {
    return this.connections.size;
  }

  public getUserConnections(userId: string): SocketConnection[] {
    return Array.from(this.connections.values()).filter(conn => conn.userId === userId);
  }

  public getRoomInfo(roomId: string): RoomInfo | undefined {
    return this.rooms.get(roomId);
  }

  public getStats(): any {
    return {
      totalConnections: this.connections.size,
      totalRooms: this.rooms.size,
      messageQueueSize: this.messageQueue.length,
      uptime: process.uptime(),
    };
  }

  public async shutdown(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Disconnect all sockets
    this.io.disconnectSockets(true);

    // Clear connections
    this.connections.clear();
    this.rooms.clear();
    this.messageQueue.length = 0;

    logger.info('WebSocket Server shutdown complete');
  }
}

export default WebSocketServer;
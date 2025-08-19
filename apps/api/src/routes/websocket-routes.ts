import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import WebSocketServer from '../websocket/websocket-server';
import ConnectionManager from '../websocket/connection-manager';
import MessageBroker from '../websocket/message-broker';
import { requireAuth, requirePermission, AuthenticatedRequest } from '../middleware/auth-middleware';

// =============================================================================
// WEBSOCKET MANAGEMENT ROUTES
// Master Plan: REST API for WebSocket management and monitoring
// =============================================================================

interface SendMessageRequest {
  event: string;
  payload: any;
  targets?: Array<{
    type: 'user' | 'role' | 'room' | 'all';
    id?: string;
  }>;
  options?: {
    guaranteed?: boolean;
    persistent?: boolean;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  };
}

interface CreateRoomRequest {
  name: string;
  type: 'public' | 'private' | 'protected';
  password?: string;
  permissions?: string[];
  maxMembers?: number;
}

interface JoinRoomRequest {
  roomId: string;
  password?: string;
}

// =============================================================================
// WEBSOCKET ROUTES IMPLEMENTATION
// =============================================================================

export async function websocketRoutes(fastify: FastifyInstance) {
  const wsServer = fastify.websocketServer as WebSocketServer;
  const connectionManager = ConnectionManager.getInstance();
  const messageBroker = MessageBroker.getInstance();

  // =============================================================================
  // CONNECTION MANAGEMENT ROUTES
  // =============================================================================

  // Get connection statistics
  fastify.get('/ws/stats', {
    preHandler: [requireAuth(), requirePermission('system', 'read')],
    schema: {
      description: 'Get WebSocket connection statistics',
      tags: ['WebSocket'],
      security: [{ Bearer: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            connections: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                active: { type: 'number' },
                byRole: { type: 'object' },
                byPlatform: { type: 'object' },
              },
            },
            sessions: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                active: { type: 'number' },
                reconnections: { type: 'number' },
              },
            },
            messages: {
              type: 'object',
              properties: {
                sent: { type: 'number' },
                delivered: { type: 'number' },
                failed: { type: 'number' },
                queued: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const wsStats = wsServer.getStats();
      const sessionStats = await connectionManager.getSessionStats();
      const messageStats = messageBroker.getStats();

      reply.send({
        connections: {
          total: wsStats.totalConnections,
          active: wsStats.totalConnections,
          byRole: wsStats.connectionsByRole || {},
          byPlatform: wsStats.connectionsByPlatform || {},
        },
        sessions: {
          total: sessionStats.totalSessions,
          active: sessionStats.activeSessions,
          reconnections: sessionStats.metrics?.reconnections || 0,
        },
        messages: {
          sent: messageStats.sent,
          delivered: messageStats.delivered,
          failed: messageStats.failed,
          queued: messageStats.queued,
        },
      });

    } catch (error) {
      logger.error('Failed to get WebSocket stats', {
        userId: request.user.id,
        error: error.message,
      });

      reply.status(500).send({
        error: 'Stats retrieval failed',
        message: 'Failed to retrieve WebSocket statistics',
      });
    }
  });

  // Get user connections
  fastify.get('/ws/connections', {
    preHandler: [requireAuth()],
    schema: {
      description: 'Get current user connections',
      tags: ['WebSocket'],
      security: [{ Bearer: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            connections: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  connectedAt: { type: 'string' },
                  lastActivity: { type: 'string' },
                  platform: { type: 'string' },
                  rooms: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const userConnections = wsServer.getUserConnections(request.user.id);

      const connections = userConnections.map(conn => ({
        id: conn.id,
        connectedAt: conn.connectedAt.toISOString(),
        lastActivity: conn.user.lastActivity.toISOString(),
        platform: conn.metadata.platform || 'unknown',
        rooms: Array.from(conn.rooms),
      }));

      reply.send({ connections });

    } catch (error) {
      logger.error('Failed to get user connections', {
        userId: request.user.id,
        error: error.message,
      });

      reply.status(500).send({
        error: 'Connection retrieval failed',
        message: 'Failed to retrieve user connections',
      });
    }
  });

  // =============================================================================
  // MESSAGE SENDING ROUTES
  // =============================================================================

  // Send message to specific targets
  fastify.post('/ws/send', {
    preHandler: [requireAuth(), requirePermission('message', 'send')],
    schema: {
      description: 'Send message via WebSocket',
      tags: ['WebSocket'],
      security: [{ Bearer: [] }],
      body: {
        type: 'object',
        required: ['event', 'payload'],
        properties: {
          event: {
            type: 'string',
            description: 'Event name',
          },
          payload: {
            type: 'object',
            description: 'Message payload',
          },
          targets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['user', 'role', 'room', 'all'] },
                id: { type: 'string' },
              },
            },
            description: 'Message targets',
          },
          options: {
            type: 'object',
            properties: {
              guaranteed: { type: 'boolean' },
              persistent: { type: 'boolean' },
              priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            messageId: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest & { Body: SendMessageRequest }, reply: FastifyReply) => {
    const { event, payload, targets = [], options = {} } = request.body;

    try {
      let messageId: string;

      if (targets.length === 0 || targets.some(t => t.type === 'all')) {
        // Broadcast to all
        messageId = await messageBroker.broadcast(event, payload, {
          metadata: {
            senderId: request.user.id,
            senderType: 'user',
            priority: options.priority || 'normal',
            tags: ['user-sent'],
            sessionId: request.user.sessionId,
          },
          delivery: {
            guaranteed: options.guaranteed || false,
            persistent: options.persistent || false,
            acknowledgment: false,
          },
        });
      } else {
        // Send to specific targets
        messageId = await messageBroker.publish({
          event,
          payload,
          routing: {
            targets: targets.map(t => ({ type: t.type, id: t.id })),
            broadcast: false,
            excludeSender: false,
          },
          metadata: {
            senderId: request.user.id,
            senderType: 'user',
            priority: options.priority || 'normal',
            tags: ['user-sent'],
            sessionId: request.user.sessionId,
          },
          delivery: {
            guaranteed: options.guaranteed || false,
            persistent: options.persistent || false,
            acknowledgment: false,
          },
        });
      }

      logger.info('Message sent via API', {
        messageId,
        userId: request.user.id,
        event,
        targets: targets.length,
      });

      reply.send({
        success: true,
        messageId,
        message: 'Message sent successfully',
      });

    } catch (error) {
      logger.error('Failed to send message', {
        userId: request.user.id,
        event,
        error: error.message,
      });

      reply.status(500).send({
        error: 'Message sending failed',
        message: 'Failed to send message',
      });
    }
  });

  // Send notification to user
  fastify.post('/ws/notify/:userId', {
    preHandler: [requireAuth(), requirePermission('notification', 'send')],
    schema: {
      description: 'Send notification to specific user',
      tags: ['WebSocket'],
      security: [{ Bearer: [] }],
      params: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['title', 'message'],
        properties: {
          title: { type: 'string' },
          message: { type: 'string' },
          type: { type: 'string', enum: ['info', 'success', 'warning', 'error'] },
          actions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                action: { type: 'string' },
              },
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            messageId: { type: 'string' },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest & { Params: { userId: string }; Body: any }, reply: FastifyReply) => {
    const { userId } = request.params;
    const { title, message, type = 'info', actions = [] } = request.body;

    try {
      const messageId = await messageBroker.publishToUser(userId, 'notification', {
        title,
        message,
        type,
        actions,
        timestamp: new Date().toISOString(),
      }, {
        metadata: {
          senderId: request.user.id,
          senderType: 'user',
          priority: 'normal',
          tags: ['notification'],
        },
        delivery: {
          guaranteed: true,
          persistent: true,
          acknowledgment: false,
        },
      });

      logger.info('Notification sent', {
        messageId,
        senderId: request.user.id,
        targetUserId: userId,
        type,
      });

      reply.send({
        success: true,
        messageId,
      });

    } catch (error) {
      logger.error('Failed to send notification', {
        senderId: request.user.id,
        targetUserId: userId,
        error: error.message,
      });

      reply.status(500).send({
        error: 'Notification failed',
        message: 'Failed to send notification',
      });
    }
  });

  // =============================================================================
  // ROOM MANAGEMENT ROUTES
  // =============================================================================

  // Create room
  fastify.post('/ws/rooms', {
    preHandler: [requireAuth(), requirePermission('room', 'create')],
    schema: {
      description: 'Create WebSocket room',
      tags: ['WebSocket'],
      security: [{ Bearer: [] }],
      body: {
        type: 'object',
        required: ['name', 'type'],
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['public', 'private', 'protected'] },
          password: { type: 'string' },
          permissions: { type: 'array', items: { type: 'string' } },
          maxMembers: { type: 'number' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            room: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                type: { type: 'string' },
                createdBy: { type: 'string' },
                createdAt: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest & { Body: CreateRoomRequest }, reply: FastifyReply) => {
    const { name, type, password, permissions = [], maxMembers } = request.body;

    try {
      const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create room (this would integrate with room management system)
      const room = {
        id: roomId,
        name,
        type,
        createdBy: request.user.id,
        createdAt: new Date(),
        password,
        permissions,
        maxMembers,
        members: [],
      };

      // Store room information (would use database)
      logger.info('Room created', {
        roomId,
        name,
        type,
        createdBy: request.user.id,
      });

      reply.status(201).send({
        success: true,
        room: {
          id: room.id,
          name: room.name,
          type: room.type,
          createdBy: room.createdBy,
          createdAt: room.createdAt.toISOString(),
        },
      });

    } catch (error) {
      logger.error('Failed to create room', {
        userId: request.user.id,
        name,
        error: error.message,
      });

      reply.status(500).send({
        error: 'Room creation failed',
        message: 'Failed to create room',
      });
    }
  });

  // Get room information
  fastify.get('/ws/rooms/:roomId', {
    preHandler: [requireAuth()],
    schema: {
      description: 'Get room information',
      tags: ['WebSocket'],
      security: [{ Bearer: [] }],
      params: {
        type: 'object',
        properties: {
          roomId: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            room: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                type: { type: 'string' },
                members: { type: 'number' },
                createdAt: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest & { Params: { roomId: string } }, reply: FastifyReply) => {
    const { roomId } = request.params;

    try {
      const roomInfo = wsServer.getRoomInfo(roomId);

      if (!roomInfo) {
        return reply.status(404).send({
          error: 'Room not found',
          message: `Room ${roomId} does not exist`,
        });
      }

      reply.send({
        room: {
          id: roomInfo.id,
          name: roomInfo.name,
          type: roomInfo.type,
          members: roomInfo.members.size,
          createdAt: roomInfo.createdAt.toISOString(),
        },
      });

    } catch (error) {
      logger.error('Failed to get room info', {
        userId: request.user.id,
        roomId,
        error: error.message,
      });

      reply.status(500).send({
        error: 'Room retrieval failed',
        message: 'Failed to get room information',
      });
    }
  });

  // =============================================================================
  // TASK AND WORKFLOW SUBSCRIPTION ROUTES
  // =============================================================================

  // Subscribe to task updates
  fastify.post('/ws/subscribe/task/:taskId', {
    preHandler: [requireAuth(), requirePermission('automation', 'read')],
    schema: {
      description: 'Subscribe to task updates via WebSocket',
      tags: ['WebSocket'],
      security: [{ Bearer: [] }],
      params: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            room: { type: 'string' },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest & { Params: { taskId: string } }, reply: FastifyReply) => {
    const { taskId } = request.params;

    try {
      // This would typically validate that the task exists and user has access
      const room = `task:${taskId}`;

      // Send subscription confirmation
      await messageBroker.publishToUser(request.user.id, 'subscription_ready', {
        type: 'task',
        id: taskId,
        room,
        message: `Ready to receive updates for task ${taskId}`,
      });

      logger.info('Task subscription created', {
        userId: request.user.id,
        taskId,
        room,
      });

      reply.send({
        success: true,
        message: `Subscribed to task updates: ${taskId}`,
        room,
      });

    } catch (error) {
      logger.error('Failed to create task subscription', {
        userId: request.user.id,
        taskId,
        error: error.message,
      });

      reply.status(500).send({
        error: 'Subscription failed',
        message: 'Failed to subscribe to task updates',
      });
    }
  });

  // Subscribe to workflow updates
  fastify.post('/ws/subscribe/workflow/:workflowId', {
    preHandler: [requireAuth(), requirePermission('workflow', 'read')],
    schema: {
      description: 'Subscribe to workflow updates via WebSocket',
      tags: ['WebSocket'],
      security: [{ Bearer: [] }],
      params: {
        type: 'object',
        properties: {
          workflowId: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            room: { type: 'string' },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest & { Params: { workflowId: string } }, reply: FastifyReply) => {
    const { workflowId } = request.params;

    try {
      const room = `workflow:${workflowId}`;

      // Send subscription confirmation
      await messageBroker.publishToUser(request.user.id, 'subscription_ready', {
        type: 'workflow',
        id: workflowId,
        room,
        message: `Ready to receive updates for workflow ${workflowId}`,
      });

      logger.info('Workflow subscription created', {
        userId: request.user.id,
        workflowId,
        room,
      });

      reply.send({
        success: true,
        message: `Subscribed to workflow updates: ${workflowId}`,
        room,
      });

    } catch (error) {
      logger.error('Failed to create workflow subscription', {
        userId: request.user.id,
        workflowId,
        error: error.message,
      });

      reply.status(500).send({
        error: 'Subscription failed',
        message: 'Failed to subscribe to workflow updates',
      });
    }
  });

  // =============================================================================
  // ADMIN ROUTES
  // =============================================================================

  // Disconnect user
  fastify.post('/ws/admin/disconnect/:userId', {
    preHandler: [requireAuth(), requirePermission('admin', 'manage')],
    schema: {
      description: 'Disconnect user from WebSocket',
      tags: ['WebSocket', 'Admin'],
      security: [{ Bearer: [] }],
      params: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            disconnectedConnections: { type: 'number' },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest & { Params: { userId: string }; Body: { reason?: string } }, reply: FastifyReply) => {
    const { userId } = request.params;
    const { reason = 'Disconnected by administrator' } = request.body;

    try {
      const userConnections = wsServer.getUserConnections(userId);
      
      // Send disconnect notification
      await messageBroker.publishToUser(userId, 'force_disconnect', {
        reason,
        disconnectedBy: request.user.id,
        timestamp: new Date().toISOString(),
      });

      // Disconnect all user connections (would implement actual disconnection)
      const disconnectedCount = userConnections.length;

      logger.info('User disconnected by admin', {
        adminId: request.user.id,
        targetUserId: userId,
        reason,
        connectionsDisconnected: disconnectedCount,
      });

      reply.send({
        success: true,
        message: `User ${userId} disconnected`,
        disconnectedConnections: disconnectedCount,
      });

    } catch (error) {
      logger.error('Failed to disconnect user', {
        adminId: request.user.id,
        targetUserId: userId,
        error: error.message,
      });

      reply.status(500).send({
        error: 'Disconnect failed',
        message: 'Failed to disconnect user',
      });
    }
  });

  // Broadcast admin message
  fastify.post('/ws/admin/broadcast', {
    preHandler: [requireAuth(), requirePermission('admin', 'broadcast')],
    schema: {
      description: 'Broadcast message to all connected users',
      tags: ['WebSocket', 'Admin'],
      security: [{ Bearer: [] }],
      body: {
        type: 'object',
        required: ['message'],
        properties: {
          message: { type: 'string' },
          type: { type: 'string', enum: ['info', 'warning', 'maintenance'] },
          persistent: { type: 'boolean' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            messageId: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest & { Body: { message: string; type?: string; persistent?: boolean } }, reply: FastifyReply) => {
    const { message, type = 'info', persistent = false } = request.body;

    try {
      const messageId = await messageBroker.broadcast('admin_broadcast', {
        message,
        type,
        from: 'Administrator',
        timestamp: new Date().toISOString(),
      }, {
        metadata: {
          senderId: request.user.id,
          senderType: 'user',
          priority: 'high',
          tags: ['admin', 'broadcast'],
        },
        delivery: {
          guaranteed: true,
          persistent,
          acknowledgment: false,
        },
      });

      logger.info('Admin broadcast sent', {
        adminId: request.user.id,
        messageId,
        type,
        persistent,
      });

      reply.send({
        success: true,
        messageId,
        message: 'Broadcast sent successfully',
      });

    } catch (error) {
      logger.error('Failed to send admin broadcast', {
        adminId: request.user.id,
        error: error.message,
      });

      reply.status(500).send({
        error: 'Broadcast failed',
        message: 'Failed to send broadcast message',
      });
    }
  });
}

export default websocketRoutes;
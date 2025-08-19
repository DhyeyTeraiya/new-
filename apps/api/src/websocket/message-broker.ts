import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { RedisService } from '../services/redis';
import WebSocketServer from './websocket-server';

// =============================================================================
// MESSAGE BROKER (Advanced Message Routing System)
// Master Plan: Intelligent message routing with queuing and delivery guarantees
// =============================================================================

export interface Message {
  id: string;
  type: MessageType;
  event: string;
  payload: any;
  metadata: MessageMetadata;
  routing: MessageRouting;
  delivery: MessageDelivery;
  timestamp: Date;
}

export interface MessageMetadata {
  senderId?: string;
  senderType: 'user' | 'agent' | 'system' | 'service';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  tags: string[];
  correlationId?: string;
  requestId?: string;
  sessionId?: string;
}

export interface MessageRouting {
  targets: MessageTarget[];
  broadcast: boolean;
  excludeSender: boolean;
  conditions?: MessageCondition[];
}

export interface MessageTarget {
  type: 'user' | 'role' | 'room' | 'agent' | 'all';
  id?: string;
  filter?: Record<string, any>;
}

export interface MessageCondition {
  field: string;
  operator: 'eq' | 'ne' | 'in' | 'nin' | 'gt' | 'lt' | 'contains';
  value: any;
}

export interface MessageDelivery {
  guaranteed: boolean;
  persistent: boolean;
  ttl?: number; // Time to live in milliseconds
  retryPolicy?: RetryPolicy;
  acknowledgment: boolean;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffStrategy: 'linear' | 'exponential' | 'fixed';
  baseDelay: number;
  maxDelay: number;
}

export interface QueuedMessage {
  message: Message;
  attempts: number;
  nextRetry: Date;
  lastError?: string;
}

export interface MessageStats {
  sent: number;
  delivered: number;
  failed: number;
  queued: number;
  acknowledged: number;
  averageDeliveryTime: number;
}

export enum MessageType {
  // Task-related messages
  TASK_CREATED = 'task.created',
  TASK_UPDATED = 'task.updated',
  TASK_COMPLETED = 'task.completed',
  TASK_FAILED = 'task.failed',
  TASK_PROGRESS = 'task.progress',
  
  // Workflow messages
  WORKFLOW_STARTED = 'workflow.started',
  WORKFLOW_COMPLETED = 'workflow.completed',
  WORKFLOW_FAILED = 'workflow.failed',
  WORKFLOW_STEP_COMPLETED = 'workflow.step.completed',
  
  // Agent messages
  AGENT_STATUS = 'agent.status',
  AGENT_RESPONSE = 'agent.response',
  AGENT_ERROR = 'agent.error',
  AGENT_COORDINATION = 'agent.coordination',
  
  // System messages
  SYSTEM_NOTIFICATION = 'system.notification',
  SYSTEM_ALERT = 'system.alert',
  SYSTEM_MAINTENANCE = 'system.maintenance',
  
  // User messages
  USER_NOTIFICATION = 'user.notification',
  USER_MESSAGE = 'user.message',
  
  // Custom messages
  CUSTOM = 'custom',
}

// =============================================================================
// MESSAGE BROKER IMPLEMENTATION
// =============================================================================

export class MessageBroker extends EventEmitter {
  private static instance: MessageBroker;
  private redisService: RedisService;
  private wsServer?: WebSocketServer;
  private messageQueue: Map<string, QueuedMessage> = new Map();
  private stats: MessageStats;
  private processingInterval?: NodeJS.Timeout;
  private subscribers: Map<string, Set<MessageSubscriber>> = new Map();

  private constructor() {
    super();
    this.redisService = RedisService.getInstance();
    this.stats = this.initializeStats();
    this.startMessageProcessing();
    this.setupRedisSubscriptions();
    logger.info('Message Broker initialized');
  }

  public static getInstance(): MessageBroker {
    if (!MessageBroker.instance) {
      MessageBroker.instance = new MessageBroker();
    }
    return MessageBroker.instance;
  }

  public setWebSocketServer(wsServer: WebSocketServer): void {
    this.wsServer = wsServer;
    logger.info('WebSocket server attached to Message Broker');
  }

  // =============================================================================
  // MESSAGE PUBLISHING
  // =============================================================================

  async publish(message: Partial<Message>): Promise<string> {
    const fullMessage = this.buildMessage(message);
    
    logger.debug('Publishing message', {
      messageId: fullMessage.id,
      type: fullMessage.type,
      event: fullMessage.event,
      targets: fullMessage.routing.targets.length,
    });

    try {
      // Route message based on delivery requirements
      if (fullMessage.delivery.guaranteed) {
        await this.queueMessage(fullMessage);
      } else {
        await this.deliverMessage(fullMessage);
      }

      this.stats.sent++;
      this.emit('message.published', fullMessage);

      return fullMessage.id;
    } catch (error) {
      logger.error('Message publishing failed', {
        messageId: fullMessage.id,
        error: error.message,
      });
      
      this.stats.failed++;
      throw error;
    }
  }

  async publishToUser(userId: string, event: string, payload: any, options?: Partial<Message>): Promise<string> {
    return this.publish({
      type: MessageType.USER_MESSAGE,
      event,
      payload,
      routing: {
        targets: [{ type: 'user', id: userId }],
        broadcast: false,
        excludeSender: false,
      },
      ...options,
    });
  }

  async publishToRole(role: string, event: string, payload: any, options?: Partial<Message>): Promise<string> {
    return this.publish({
      type: MessageType.SYSTEM_NOTIFICATION,
      event,
      payload,
      routing: {
        targets: [{ type: 'role', id: role }],
        broadcast: false,
        excludeSender: false,
      },
      ...options,
    });
  }

  async publishToRoom(roomId: string, event: string, payload: any, options?: Partial<Message>): Promise<string> {
    return this.publish({
      type: MessageType.CUSTOM,
      event,
      payload,
      routing: {
        targets: [{ type: 'room', id: roomId }],
        broadcast: false,
        excludeSender: false,
      },
      ...options,
    });
  }

  async broadcast(event: string, payload: any, options?: Partial<Message>): Promise<string> {
    return this.publish({
      type: MessageType.SYSTEM_NOTIFICATION,
      event,
      payload,
      routing: {
        targets: [{ type: 'all' }],
        broadcast: true,
        excludeSender: false,
      },
      ...options,
    });
  }

  // =============================================================================
  // TASK AND WORKFLOW MESSAGING
  // =============================================================================

  async publishTaskUpdate(taskId: string, update: any, userId?: string): Promise<string> {
    const targets: MessageTarget[] = [
      { type: 'room', id: `task:${taskId}` },
    ];

    if (userId) {
      targets.push({ type: 'user', id: userId });
    }

    return this.publish({
      type: MessageType.TASK_UPDATED,
      event: 'task_update',
      payload: {
        taskId,
        update,
      },
      routing: {
        targets,
        broadcast: false,
        excludeSender: false,
      },
      delivery: {
        guaranteed: true,
        persistent: true,
        acknowledgment: false,
      },
      metadata: {
        senderType: 'system',
        priority: 'normal',
        tags: ['task', 'update'],
        correlationId: taskId,
      },
    });
  }

  async publishWorkflowUpdate(workflowId: string, update: any, userId?: string): Promise<string> {
    const targets: MessageTarget[] = [
      { type: 'room', id: `workflow:${workflowId}` },
    ];

    if (userId) {
      targets.push({ type: 'user', id: userId });
    }

    return this.publish({
      type: MessageType.WORKFLOW_STEP_COMPLETED,
      event: 'workflow_update',
      payload: {
        workflowId,
        update,
      },
      routing: {
        targets,
        broadcast: false,
        excludeSender: false,
      },
      delivery: {
        guaranteed: true,
        persistent: true,
        acknowledgment: false,
      },
      metadata: {
        senderType: 'system',
        priority: 'normal',
        tags: ['workflow', 'update'],
        correlationId: workflowId,
      },
    });
  }

  async publishAgentUpdate(agentId: string, update: any, targetUsers?: string[]): Promise<string> {
    const targets: MessageTarget[] = [
      { type: 'room', id: `agent:${agentId}` },
    ];

    if (targetUsers) {
      targets.push(...targetUsers.map(userId => ({ type: 'user' as const, id: userId })));
    }

    return this.publish({
      type: MessageType.AGENT_STATUS,
      event: 'agent_update',
      payload: {
        agentId,
        update,
      },
      routing: {
        targets,
        broadcast: false,
        excludeSender: false,
      },
      delivery: {
        guaranteed: false,
        persistent: false,
        acknowledgment: false,
      },
      metadata: {
        senderType: 'agent',
        priority: 'normal',
        tags: ['agent', 'status'],
        correlationId: agentId,
      },
    });
  }

  // =============================================================================
  // MESSAGE SUBSCRIPTION
  // =============================================================================

  subscribe(pattern: string, callback: MessageSubscriber): void {
    if (!this.subscribers.has(pattern)) {
      this.subscribers.set(pattern, new Set());
    }
    
    this.subscribers.get(pattern)!.add(callback);
    
    logger.debug('Message subscription added', { pattern });
  }

  unsubscribe(pattern: string, callback: MessageSubscriber): void {
    const subscribers = this.subscribers.get(pattern);
    if (subscribers) {
      subscribers.delete(callback);
      
      if (subscribers.size === 0) {
        this.subscribers.delete(pattern);
      }
    }
    
    logger.debug('Message subscription removed', { pattern });
  }

  // =============================================================================
  // MESSAGE DELIVERY
  // =============================================================================

  private async deliverMessage(message: Message): Promise<void> {
    const startTime = Date.now();

    try {
      // Notify local subscribers
      await this.notifySubscribers(message);

      // Route to WebSocket clients
      if (this.wsServer) {
        await this.routeToWebSocket(message);
      }

      // Route to other services via Redis
      await this.routeToServices(message);

      const deliveryTime = Date.now() - startTime;
      this.updateDeliveryStats(deliveryTime);
      this.stats.delivered++;

      logger.debug('Message delivered successfully', {
        messageId: message.id,
        deliveryTime,
      });

    } catch (error) {
      logger.error('Message delivery failed', {
        messageId: message.id,
        error: error.message,
      });

      if (message.delivery.guaranteed) {
        await this.queueMessage(message);
      } else {
        this.stats.failed++;
      }

      throw error;
    }
  }

  private async routeToWebSocket(message: Message): Promise<void> {
    if (!this.wsServer) return;

    for (const target of message.routing.targets) {
      try {
        switch (target.type) {
          case 'user':
            if (target.id) {
              await this.wsServer.broadcastToUser(target.id, message.event, {
                ...message.payload,
                metadata: message.metadata,
              });
            }
            break;

          case 'role':
            if (target.id) {
              await this.wsServer.broadcastToRole(target.id, message.event, {
                ...message.payload,
                metadata: message.metadata,
              });
            }
            break;

          case 'room':
            if (target.id) {
              await this.wsServer.broadcastToRoom(target.id, message.event, {
                ...message.payload,
                metadata: message.metadata,
              });
            }
            break;

          case 'all':
            await this.wsServer.broadcastToAll(message.event, {
              ...message.payload,
              metadata: message.metadata,
            });
            break;
        }
      } catch (error) {
        logger.error('WebSocket routing failed', {
          messageId: message.id,
          targetType: target.type,
          targetId: target.id,
          error: error.message,
        });
      }
    }
  }

  private async routeToServices(message: Message): Promise<void> {
    // Publish to Redis for other service instances
    const channel = `messages:${message.type}`;
    
    await this.redisService.publish(channel, JSON.stringify({
      ...message,
      timestamp: message.timestamp.toISOString(),
    }));
  }

  private async notifySubscribers(message: Message): Promise<void> {
    for (const [pattern, subscribers] of this.subscribers.entries()) {
      if (this.matchesPattern(message, pattern)) {
        for (const subscriber of subscribers) {
          try {
            await subscriber(message);
          } catch (error) {
            logger.error('Subscriber notification failed', {
              messageId: message.id,
              pattern,
              error: error.message,
            });
          }
        }
      }
    }
  }

  // =============================================================================
  // MESSAGE QUEUING
  // =============================================================================

  private async queueMessage(message: Message): Promise<void> {
    const queuedMessage: QueuedMessage = {
      message,
      attempts: 0,
      nextRetry: new Date(),
    };

    this.messageQueue.set(message.id, queuedMessage);
    this.stats.queued++;

    // Store in Redis for persistence
    if (message.delivery.persistent) {
      await this.persistMessage(queuedMessage);
    }

    logger.debug('Message queued', {
      messageId: message.id,
      queueSize: this.messageQueue.size,
    });
  }

  private async processMessageQueue(): Promise<void> {
    const now = new Date();
    const messagesToProcess: QueuedMessage[] = [];

    // Find messages ready for processing
    for (const queuedMessage of this.messageQueue.values()) {
      if (queuedMessage.nextRetry <= now) {
        messagesToProcess.push(queuedMessage);
      }
    }

    // Process messages
    for (const queuedMessage of messagesToProcess) {
      await this.processQueuedMessage(queuedMessage);
    }
  }

  private async processQueuedMessage(queuedMessage: QueuedMessage): Promise<void> {
    const { message } = queuedMessage;
    queuedMessage.attempts++;

    try {
      await this.deliverMessage(message);
      
      // Remove from queue on successful delivery
      this.messageQueue.delete(message.id);
      await this.removePersistedMessage(message.id);
      
      this.stats.queued--;
      this.stats.delivered++;

      logger.debug('Queued message delivered', {
        messageId: message.id,
        attempts: queuedMessage.attempts,
      });

    } catch (error) {
      queuedMessage.lastError = error.message;

      // Check retry policy
      const retryPolicy = message.delivery.retryPolicy;
      if (retryPolicy && queuedMessage.attempts < retryPolicy.maxAttempts) {
        // Schedule retry
        const delay = this.calculateRetryDelay(queuedMessage.attempts, retryPolicy);
        queuedMessage.nextRetry = new Date(Date.now() + delay);

        logger.warn('Message delivery failed, scheduling retry', {
          messageId: message.id,
          attempts: queuedMessage.attempts,
          nextRetry: queuedMessage.nextRetry,
          error: error.message,
        });

      } else {
        // Max attempts reached, remove from queue
        this.messageQueue.delete(message.id);
        await this.removePersistedMessage(message.id);
        
        this.stats.queued--;
        this.stats.failed++;

        logger.error('Message delivery failed permanently', {
          messageId: message.id,
          attempts: queuedMessage.attempts,
          error: error.message,
        });

        this.emit('message.failed', message, error);
      }
    }
  }

  // =============================================================================
  // REDIS OPERATIONS
  // =============================================================================

  private setupRedisSubscriptions(): void {
    // Subscribe to message channels from other instances
    const patterns = [
      'messages:*',
      'cluster:*',
    ];

    for (const pattern of patterns) {
      this.redisService.psubscribe(pattern, (channel, message) => {
        this.handleRedisMessage(channel, message);
      });
    }
  }

  private async handleRedisMessage(channel: string, messageData: string): Promise<void> {
    try {
      const message = JSON.parse(messageData);
      message.timestamp = new Date(message.timestamp);

      // Process message from other instance
      await this.notifySubscribers(message);

      logger.debug('Redis message processed', {
        channel,
        messageId: message.id,
      });

    } catch (error) {
      logger.error('Redis message processing failed', {
        channel,
        error: error.message,
      });
    }
  }

  private async persistMessage(queuedMessage: QueuedMessage): Promise<void> {
    const key = `queued_message:${queuedMessage.message.id}`;
    const ttl = queuedMessage.message.delivery.ttl || 24 * 60 * 60 * 1000; // 24 hours default
    
    await this.redisService.setex(
      key,
      Math.floor(ttl / 1000),
      JSON.stringify({
        ...queuedMessage,
        message: {
          ...queuedMessage.message,
          timestamp: queuedMessage.message.timestamp.toISOString(),
        },
        nextRetry: queuedMessage.nextRetry.toISOString(),
      })
    );
  }

  private async removePersistedMessage(messageId: string): Promise<void> {
    const key = `queued_message:${messageId}`;
    await this.redisService.del(key);
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  private buildMessage(partial: Partial<Message>): Message {
    return {
      id: partial.id || this.generateMessageId(),
      type: partial.type || MessageType.CUSTOM,
      event: partial.event || 'message',
      payload: partial.payload || {},
      metadata: {
        senderType: 'system',
        priority: 'normal',
        tags: [],
        ...partial.metadata,
      },
      routing: {
        targets: [],
        broadcast: false,
        excludeSender: false,
        ...partial.routing,
      },
      delivery: {
        guaranteed: false,
        persistent: false,
        acknowledgment: false,
        ...partial.delivery,
      },
      timestamp: new Date(),
    };
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private matchesPattern(message: Message, pattern: string): boolean {
    // Simple pattern matching - could be enhanced with regex
    if (pattern === '*') return true;
    if (pattern === message.type) return true;
    if (pattern === message.event) return true;
    
    return false;
  }

  private calculateRetryDelay(attempts: number, retryPolicy: RetryPolicy): number {
    let delay = retryPolicy.baseDelay;

    switch (retryPolicy.backoffStrategy) {
      case 'exponential':
        delay = retryPolicy.baseDelay * Math.pow(2, attempts - 1);
        break;
      case 'linear':
        delay = retryPolicy.baseDelay * attempts;
        break;
      case 'fixed':
        delay = retryPolicy.baseDelay;
        break;
    }

    return Math.min(delay, retryPolicy.maxDelay);
  }

  private updateDeliveryStats(deliveryTime: number): void {
    // Update average delivery time
    const totalDeliveries = this.stats.delivered + 1;
    this.stats.averageDeliveryTime = 
      (this.stats.averageDeliveryTime * this.stats.delivered + deliveryTime) / totalDeliveries;
  }

  private initializeStats(): MessageStats {
    return {
      sent: 0,
      delivered: 0,
      failed: 0,
      queued: 0,
      acknowledged: 0,
      averageDeliveryTime: 0,
    };
  }

  private startMessageProcessing(): void {
    this.processingInterval = setInterval(async () => {
      await this.processMessageQueue();
    }, 1000); // Process every second
  }

  // =============================================================================
  // PUBLIC API
  // =============================================================================

  public getStats(): MessageStats {
    return { ...this.stats };
  }

  public getQueueSize(): number {
    return this.messageQueue.size;
  }

  public async clearQueue(): Promise<void> {
    this.messageQueue.clear();
    this.stats.queued = 0;
    logger.info('Message queue cleared');
  }

  public async shutdown(): Promise<void> {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    // Process remaining messages
    await this.processMessageQueue();

    // Clear data
    this.messageQueue.clear();
    this.subscribers.clear();

    logger.info('Message Broker shutdown complete');
  }
}

// =============================================================================
// TYPES
// =============================================================================

export type MessageSubscriber = (message: Message) => Promise<void> | void;

export default MessageBroker;
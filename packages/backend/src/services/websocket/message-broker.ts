import { 
  WebSocketMessage, 
  WebSocketMessageType,
  ChatMessagePayload,
  AIResponsePayload,
  ActionProgressPayload,
  ActionCompletePayload,
  ActionErrorPayload,
  PageChangePayload,
  SessionUpdatePayload,
  AutomationProgressPayload,
  ScreenshotPayload,
  ElementHighlightPayload,
  ConnectionStatusPayload
} from '@browser-ai-agent/shared';
import { ConnectionManager } from './connection-manager';
import { Logger } from 'winston';
import { createLogger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface MessageBrokerConfig {
  enableMessageQueue: boolean;
  maxQueueSize: number;
  messageRetention: number;
  enableBroadcast: boolean;
}

export interface QueuedMessage {
  id: string;
  message: WebSocketMessage;
  targetType: 'connection' | 'user' | 'session' | 'broadcast';
  targetId?: string;
  attempts: number;
  createdAt: Date;
  nextRetry?: Date;
}

export class MessageBroker {
  private readonly logger: Logger;
  private readonly config: MessageBrokerConfig;
  private readonly connectionManager: ConnectionManager;
  private readonly messageQueue: Map<string, QueuedMessage>;
  private readonly messageHandlers: Map<WebSocketMessageType, Function[]>;
  private queueProcessor?: NodeJS.Timeout;

  constructor(
    connectionManager: ConnectionManager,
    config: MessageBrokerConfig
  ) {
    this.logger = createLogger('MessageBroker');
    this.config = config;
    this.connectionManager = connectionManager;
    this.messageQueue = new Map();
    this.messageHandlers = new Map();

    if (config.enableMessageQueue) {
      this.startQueueProcessor();
    }

    this.logger.info('Message Broker initialized', {
      enableMessageQueue: config.enableMessageQueue,
      maxQueueSize: config.maxQueueSize,
    });
  }

  /**
   * Register message handler for specific message type
   */
  onMessage<T = any>(
    messageType: WebSocketMessageType,
    handler: (payload: T, message: WebSocketMessage) => void | Promise<void>
  ): void {
    if (!this.messageHandlers.has(messageType)) {
      this.messageHandlers.set(messageType, []);
    }
    
    this.messageHandlers.get(messageType)!.push(handler);
    
    this.logger.debug('Message handler registered', {
      messageType,
      handlerCount: this.messageHandlers.get(messageType)!.length,
    });
  }

  /**
   * Send message to specific connection
   */
  async sendToConnection(
    connectionId: string,
    type: WebSocketMessageType,
    payload: any,
    sessionId?: string
  ): Promise<boolean> {
    const message = this.createMessage(type, payload, sessionId);
    
    const sent = this.connectionManager.sendToConnection(connectionId, message);
    
    if (!sent && this.config.enableMessageQueue) {
      await this.queueMessage(message, 'connection', connectionId);
    }

    return sent;
  }

  /**
   * Send message to all connections of a user
   */
  async sendToUser(
    userId: string,
    type: WebSocketMessageType,
    payload: any,
    sessionId?: string
  ): Promise<number> {
    const message = this.createMessage(type, payload, sessionId);
    
    const sentCount = this.connectionManager.sendToUser(userId, message);
    
    if (sentCount === 0 && this.config.enableMessageQueue) {
      await this.queueMessage(message, 'user', userId);
    }

    return sentCount;
  }

  /**
   * Send message to all connections of a session
   */
  async sendToSession(
    sessionId: string,
    type: WebSocketMessageType,
    payload: any
  ): Promise<number> {
    const message = this.createMessage(type, payload, sessionId);
    
    const sentCount = this.connectionManager.sendToSession(sessionId, message);
    
    if (sentCount === 0 && this.config.enableMessageQueue) {
      await this.queueMessage(message, 'session', sessionId);
    }

    return sentCount;
  }

  /**
   * Broadcast message to all connections
   */
  async broadcast(
    type: WebSocketMessageType,
    payload: any,
    excludeConnectionId?: string
  ): Promise<number> {
    if (!this.config.enableBroadcast) {
      this.logger.warn('Broadcast attempted but not enabled');
      return 0;
    }

    const message = this.createMessage(type, payload);
    
    return this.connectionManager.broadcast(message, excludeConnectionId);
  }

  /**
   * Handle incoming message from client
   */
  async handleIncomingMessage(
    message: WebSocketMessage,
    connectionId: string
  ): Promise<void> {
    this.logger.debug('Processing incoming message', {
      messageType: message.type,
      messageId: message.id,
      connectionId,
    });

    // Execute registered handlers
    const handlers = this.messageHandlers.get(message.type);
    if (handlers && handlers.length > 0) {
      for (const handler of handlers) {
        try {
          await handler(message.payload, message);
        } catch (error) {
          this.logger.error('Message handler error', {
            messageType: message.type,
            messageId: message.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    } else {
      this.logger.debug('No handlers registered for message type', {
        messageType: message.type,
      });
    }
  }

  /**
   * Specialized message sending methods
   */

  /**
   * Send chat message response
   */
  async sendChatResponse(
    sessionId: string,
    response: any,
    streaming: boolean = false,
    chunk?: string,
    final?: boolean
  ): Promise<number> {
    const payload: AIResponsePayload = {
      response,
      streaming,
      chunk,
      final,
    };

    return await this.sendToSession(sessionId, 'ai_response', payload);
  }

  /**
   * Send action progress update
   */
  async sendActionProgress(
    sessionId: string,
    action: any,
    progress: number,
    status: string,
    screenshot?: string
  ): Promise<number> {
    const payload: ActionProgressPayload = {
      action,
      progress,
      status,
      screenshot,
    };

    return await this.sendToSession(sessionId, 'action_progress', payload);
  }

  /**
   * Send action completion
   */
  async sendActionComplete(
    sessionId: string,
    action: any,
    result: any
  ): Promise<number> {
    const payload: ActionCompletePayload = {
      action,
      result,
    };

    return await this.sendToSession(sessionId, 'action_complete', payload);
  }

  /**
   * Send action error
   */
  async sendActionError(
    sessionId: string,
    action: any,
    error: any,
    recoveryOptions?: any[]
  ): Promise<number> {
    const payload: ActionErrorPayload = {
      action,
      error,
      recoveryOptions,
    };

    return await this.sendToSession(sessionId, 'action_error', payload);
  }

  /**
   * Send automation progress
   */
  async sendAutomationProgress(
    sessionId: string,
    automationId: string,
    currentStep: number,
    totalSteps: number,
    progress: number,
    currentAction?: any,
    completedActions: any[] = []
  ): Promise<number> {
    const payload: AutomationProgressPayload = {
      automationId,
      currentStep,
      totalSteps,
      progress,
      currentAction,
      completedActions,
    };

    return await this.sendToSession(sessionId, 'automation_progress', payload);
  }

  /**
   * Send page change notification
   */
  async sendPageChange(
    sessionId: string,
    previousContext: any,
    newContext: any,
    navigationType: any
  ): Promise<number> {
    const payload: PageChangePayload = {
      previousContext,
      newContext,
      navigationType,
    };

    return await this.sendToSession(sessionId, 'page_change', payload);
  }

  /**
   * Send screenshot
   */
  async sendScreenshot(
    sessionId: string,
    screenshotData: string,
    metadata: any
  ): Promise<number> {
    const payload: ScreenshotPayload = {
      data: screenshotData,
      metadata,
    };

    return await this.sendToSession(sessionId, 'screenshot', payload);
  }

  /**
   * Send element highlight
   */
  async sendElementHighlight(
    sessionId: string,
    element: any,
    style: any,
    duration: number = 2000
  ): Promise<number> {
    const payload: ElementHighlightPayload = {
      element,
      style,
      duration,
    };

    return await this.sendToSession(sessionId, 'element_highlight', payload);
  }

  /**
   * Send connection status update
   */
  async sendConnectionStatus(
    connectionId: string,
    status: 'connected' | 'disconnected' | 'reconnecting' | 'error',
    message?: string,
    reconnectAttempts?: number,
    nextReconnectTime?: Date
  ): Promise<boolean> {
    const payload: ConnectionStatusPayload = {
      status,
      message,
      reconnectAttempts,
      nextReconnectTime,
    };

    return await this.sendToConnection(connectionId, 'connection_status', payload);
  }

  /**
   * Send session update
   */
  async sendSessionUpdate(
    sessionId: string,
    updates: any,
    updateType: 'preferences' | 'state' | 'metadata' | 'full'
  ): Promise<number> {
    const payload: SessionUpdatePayload = {
      updates,
      updateType,
    };

    return await this.sendToSession(sessionId, 'session_update', payload);
  }

  /**
   * Get message queue statistics
   */
  getQueueStats(): {
    queueSize: number;
    messagesByType: Record<string, number>;
    oldestMessage: Date | null;
    failedMessages: number;
  } {
    const messagesByType: Record<string, number> = {};
    let oldestTime = Infinity;
    let failedMessages = 0;

    for (const queuedMessage of this.messageQueue.values()) {
      const type = queuedMessage.message.type;
      messagesByType[type] = (messagesByType[type] || 0) + 1;

      if (queuedMessage.attempts > 1) {
        failedMessages++;
      }

      const messageTime = queuedMessage.createdAt.getTime();
      if (messageTime < oldestTime) {
        oldestTime = messageTime;
      }
    }

    return {
      queueSize: this.messageQueue.size,
      messagesByType,
      oldestMessage: oldestTime === Infinity ? null : new Date(oldestTime),
      failedMessages,
    };
  }

  /**
   * Clear message queue
   */
  clearQueue(): number {
    const clearedCount = this.messageQueue.size;
    this.messageQueue.clear();
    
    this.logger.info('Message queue cleared', { clearedCount });
    
    return clearedCount;
  }

  /**
   * Shutdown message broker
   */
  shutdown(): void {
    if (this.queueProcessor) {
      clearInterval(this.queueProcessor);
    }

    this.messageQueue.clear();
    this.messageHandlers.clear();

    this.logger.info('Message Broker shutdown');
  }

  /**
   * Private helper methods
   */
  private createMessage(
    type: WebSocketMessageType,
    payload: any,
    sessionId?: string
  ): WebSocketMessage {
    return {
      id: uuidv4(),
      type,
      payload,
      sessionId: sessionId || '',
      timestamp: new Date(),
    };
  }

  private async queueMessage(
    message: WebSocketMessage,
    targetType: 'connection' | 'user' | 'session' | 'broadcast',
    targetId?: string
  ): Promise<void> {
    if (this.messageQueue.size >= this.config.maxQueueSize) {
      // Remove oldest message
      const oldestId = Array.from(this.messageQueue.keys())[0];
      this.messageQueue.delete(oldestId);
      
      this.logger.warn('Message queue full, removed oldest message', {
        queueSize: this.messageQueue.size,
        removedMessageId: oldestId,
      });
    }

    const queuedMessage: QueuedMessage = {
      id: uuidv4(),
      message,
      targetType,
      targetId,
      attempts: 0,
      createdAt: new Date(),
    };

    this.messageQueue.set(queuedMessage.id, queuedMessage);

    this.logger.debug('Message queued', {
      messageId: queuedMessage.id,
      messageType: message.type,
      targetType,
      targetId,
    });
  }

  private startQueueProcessor(): void {
    this.queueProcessor = setInterval(() => {
      this.processMessageQueue();
    }, 5000); // Process queue every 5 seconds
  }

  private async processMessageQueue(): Promise<void> {
    if (this.messageQueue.size === 0) {
      return;
    }

    const now = new Date();
    const processedMessages: string[] = [];

    for (const [queueId, queuedMessage] of this.messageQueue) {
      // Skip if not ready for retry
      if (queuedMessage.nextRetry && queuedMessage.nextRetry > now) {
        continue;
      }

      // Skip if too old
      const age = now.getTime() - queuedMessage.createdAt.getTime();
      if (age > this.config.messageRetention) {
        processedMessages.push(queueId);
        continue;
      }

      // Attempt to send message
      let sent = false;
      queuedMessage.attempts++;

      try {
        switch (queuedMessage.targetType) {
          case 'connection':
            sent = this.connectionManager.sendToConnection(
              queuedMessage.targetId!,
              queuedMessage.message
            );
            break;
          case 'user':
            sent = this.connectionManager.sendToUser(
              queuedMessage.targetId!,
              queuedMessage.message
            ) > 0;
            break;
          case 'session':
            sent = this.connectionManager.sendToSession(
              queuedMessage.targetId!,
              queuedMessage.message
            ) > 0;
            break;
          case 'broadcast':
            sent = this.connectionManager.broadcast(queuedMessage.message) > 0;
            break;
        }

        if (sent) {
          processedMessages.push(queueId);
        } else if (queuedMessage.attempts >= 3) {
          // Give up after 3 attempts
          processedMessages.push(queueId);
          this.logger.warn('Message delivery failed after retries', {
            messageId: queuedMessage.id,
            attempts: queuedMessage.attempts,
          });
        } else {
          // Schedule retry
          queuedMessage.nextRetry = new Date(now.getTime() + (queuedMessage.attempts * 10000));
        }
      } catch (error) {
        this.logger.error('Error processing queued message', {
          messageId: queuedMessage.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        
        if (queuedMessage.attempts >= 3) {
          processedMessages.push(queueId);
        }
      }
    }

    // Remove processed messages
    for (const queueId of processedMessages) {
      this.messageQueue.delete(queueId);
    }

    if (processedMessages.length > 0) {
      this.logger.debug('Processed queued messages', {
        processedCount: processedMessages.length,
        remainingCount: this.messageQueue.size,
      });
    }
  }
}
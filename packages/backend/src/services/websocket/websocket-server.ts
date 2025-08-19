import { Server as HTTPServer } from 'http';
import { 
  WebSocketMessage,
  AutomationState,
  ActionResult,
  AIResponse 
} from '@browser-ai-agent/shared';
import { ConnectionManager, ConnectionManagerConfig } from './connection-manager';
import { MessageBroker, MessageBrokerConfig } from './message-broker';
import { WebSocketSessionManager, WebSocketSessionManagerConfig } from './session-manager';
import { AuthMiddleware } from '../../middleware/auth';
import { SessionService } from '../session';
import { AIService } from '../nvidia';
import { AutomationEngine } from '../automation';
import { Logger } from 'winston';
import { createLogger } from '../../utils/logger';

export interface WebSocketServerConfig {
  connection: ConnectionManagerConfig;
  messageBroker: MessageBrokerConfig;
  sessionManager: WebSocketSessionManagerConfig;
}

export class WebSocketServer {
  private readonly logger: Logger;
  private readonly config: WebSocketServerConfig;
  private readonly connectionManager: ConnectionManager;
  private readonly messageBroker: MessageBroker;
  private readonly sessionManager: WebSocketSessionManager;
  private readonly aiService: AIService;
  private readonly automationEngine: AutomationEngine;

  constructor(
    httpServer: HTTPServer,
    config: WebSocketServerConfig,
    dependencies: {
      authMiddleware: AuthMiddleware;
      sessionService: SessionService;
      aiService: AIService;
      automationEngine: AutomationEngine;
    }
  ) {
    this.logger = createLogger('WebSocketServer');
    this.config = config;
    this.aiService = dependencies.aiService;
    this.automationEngine = dependencies.automationEngine;

    // Initialize core components
    this.connectionManager = new ConnectionManager(
      httpServer,
      config.connection,
      dependencies.authMiddleware
    );

    this.messageBroker = new MessageBroker(
      this.connectionManager,
      config.messageBroker
    );

    this.sessionManager = new WebSocketSessionManager(
      this.connectionManager,
      this.messageBroker,
      dependencies.sessionService,
      config.sessionManager
    );

    this.setupMessageHandlers();
    this.setupServiceIntegrations();

    this.logger.info('WebSocket Server initialized');
  }

  /**
   * Setup message handlers for different message types
   */
  private setupMessageHandlers(): void {
    // Chat message handler
    this.messageBroker.onMessage('chat_message', async (payload: any, message: WebSocketMessage) => {
      await this.handleChatMessage(message.sessionId, payload);
    });

    // Automation control handlers
    this.messageBroker.onMessage('automation_start', async (payload: any, message: WebSocketMessage) => {
      await this.handleAutomationStart(message.sessionId, payload);
    });

    this.messageBroker.onMessage('automation_pause', async (payload: any, message: WebSocketMessage) => {
      await this.handleAutomationControl(payload.automationId, 'pause');
    });

    this.messageBroker.onMessage('automation_resume', async (payload: any, message: WebSocketMessage) => {
      await this.handleAutomationControl(payload.automationId, 'resume');
    });

    this.messageBroker.onMessage('automation_cancel', async (payload: any, message: WebSocketMessage) => {
      await this.handleAutomationControl(payload.automationId, 'cancel');
    });

    // Page context update handler
    this.messageBroker.onMessage('page_change', async (payload: any, message: WebSocketMessage) => {
      await this.handlePageChange(message.sessionId, payload);
    });

    // Screenshot request handler
    this.messageBroker.onMessage('screenshot_request', async (payload: any, message: WebSocketMessage) => {
      await this.handleScreenshotRequest(message.sessionId, payload);
    });

    // Ping/pong for heartbeat
    this.messageBroker.onMessage('ping', async (payload: any, message: WebSocketMessage) => {
      await this.messageBroker.sendToSession(message.sessionId, 'pong', {
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Setup integrations with other services
   */
  private setupServiceIntegrations(): void {
    // Listen for automation progress updates
    this.setupAutomationIntegration();

    // Listen for AI service events
    this.setupAIServiceIntegration();
  }

  /**
   * Setup automation engine integration
   */
  private setupAutomationIntegration(): void {
    // This would typically involve setting up event listeners on the automation engine
    // For now, we'll implement polling-based updates
    setInterval(async () => {
      await this.checkAutomationUpdates();
    }, 1000); // Check every second
  }

  /**
   * Setup AI service integration
   */
  private setupAIServiceIntegration(): void {
    // This would set up event listeners for AI service events
    // For now, we'll handle this through direct method calls
  }

  /**
   * Handle chat message from client
   */
  private async handleChatMessage(sessionId: string, payload: any): Promise<void> {
    try {
      this.logger.debug('Processing chat message', {
        sessionId,
        messageLength: payload.message?.length,
      });

      // Initialize session if needed
      await this.sessionManager.initializeSession(sessionId);

      // Process message with AI service
      const aiResponse = await this.aiService.processMessage(
        payload.message,
        sessionId,
        payload.pageContext,
        payload.messageType || 'command'
      );

      // Send AI response back to client
      await this.messageBroker.sendChatResponse(sessionId, aiResponse);

      // Add to conversation history
      await this.sessionManager.addConversationMessage(sessionId, {
        id: `msg-${Date.now()}`,
        type: 'text',
        content: payload.message,
        sender: 'user',
        timestamp: new Date(),
      });

      await this.sessionManager.addConversationMessage(sessionId, {
        id: aiResponse.id,
        type: 'response',
        content: aiResponse.message,
        sender: 'ai',
        actions: aiResponse.actions,
        timestamp: aiResponse.timestamp,
      });

    } catch (error) {
      this.logger.error('Failed to process chat message', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Send error response
      await this.messageBroker.sendToSession(sessionId, 'error', {
        code: 'CHAT_PROCESSING_ERROR',
        message: 'Failed to process chat message',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle automation start request
   */
  private async handleAutomationStart(sessionId: string, payload: any): Promise<void> {
    try {
      this.logger.info('Starting automation via WebSocket', {
        sessionId,
        actionCount: payload.actions?.length,
      });

      const automationId = await this.automationEngine.startAutomation(
        sessionId,
        payload.actions,
        payload.options
      );

      // Send automation started confirmation
      await this.messageBroker.sendToSession(sessionId, 'automation_start', {
        automationId,
        status: 'started',
        message: 'Automation started successfully',
      });

    } catch (error) {
      this.logger.error('Failed to start automation', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      await this.messageBroker.sendToSession(sessionId, 'automation_error', {
        error: {
          code: 'AUTOMATION_START_FAILED',
          message: 'Failed to start automation',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  /**
   * Handle automation control (pause/resume/cancel)
   */
  private async handleAutomationControl(
    automationId: string,
    action: 'pause' | 'resume' | 'cancel'
  ): Promise<void> {
    try {
      let success = false;

      switch (action) {
        case 'pause':
          success = await this.automationEngine.pauseAutomation(automationId);
          break;
        case 'resume':
          success = await this.automationEngine.resumeAutomation(automationId);
          break;
        case 'cancel':
          success = await this.automationEngine.cancelAutomation(automationId);
          break;
      }

      if (success) {
        // Get automation status to find session
        const status = this.automationEngine.getAutomationStatus(automationId);
        if (status) {
          // Broadcast to all connections (we don't have direct session mapping)
          await this.messageBroker.broadcast(`automation_${action}`, {
            automationId,
            status: action === 'cancel' ? 'cancelled' : action === 'pause' ? 'paused' : 'executing',
            message: `Automation ${action}d successfully`,
          });
        }
      }

    } catch (error) {
      this.logger.error(`Failed to ${action} automation`, {
        automationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle page change notification
   */
  private async handlePageChange(sessionId: string, payload: any): Promise<void> {
    try {
      this.logger.debug('Processing page change', {
        sessionId,
        newUrl: payload.newContext?.url,
      });

      // Update session browser state
      if (payload.newContext) {
        await this.sessionManager.updateBrowserState(sessionId, {
          pageContext: payload.newContext,
          currentTab: {
            id: 'current-tab',
            url: payload.newContext.url,
            title: payload.newContext.title,
            active: true,
            status: 'complete',
          },
        });
      }

      // Broadcast page change to all session connections
      await this.messageBroker.sendPageChange(
        sessionId,
        payload.previousContext,
        payload.newContext,
        payload.navigationType
      );

    } catch (error) {
      this.logger.error('Failed to process page change', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle screenshot request
   */
  private async handleScreenshotRequest(sessionId: string, payload: any): Promise<void> {
    try {
      this.logger.debug('Processing screenshot request', {
        sessionId,
        fullPage: payload.fullPage,
      });

      const screenshot = await this.automationEngine.takeScreenshot(
        sessionId,
        payload.options
      );

      await this.messageBroker.sendScreenshot(sessionId, screenshot, {
        timestamp: new Date(),
        fullPage: payload.fullPage || false,
        url: payload.url,
      });

    } catch (error) {
      this.logger.error('Failed to process screenshot request', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      await this.messageBroker.sendToSession(sessionId, 'error', {
        code: 'SCREENSHOT_FAILED',
        message: 'Failed to capture screenshot',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Check for automation updates and broadcast them
   */
  private async checkAutomationUpdates(): Promise<void> {
    // This is a simplified implementation
    // In a real system, you'd want to track active automations and their sessions
    
    // For now, we'll just check if there are any active connections
    const stats = this.connectionManager.getStats();
    if (stats.totalConnections === 0) {
      return; // No connections to update
    }

    // In a real implementation, you would:
    // 1. Track active automations and their associated sessions
    // 2. Poll automation engine for status updates
    // 3. Send progress updates to relevant sessions
    // 4. Handle automation completion/failure events
  }

  /**
   * Send automation progress update
   */
  async sendAutomationProgress(
    sessionId: string,
    automationId: string,
    progress: {
      currentStep: number;
      totalSteps: number;
      progress: number;
      currentAction?: any;
      completedActions?: ActionResult[];
    }
  ): Promise<void> {
    await this.messageBroker.sendAutomationProgress(
      sessionId,
      automationId,
      progress.currentStep,
      progress.totalSteps,
      progress.progress,
      progress.currentAction,
      progress.completedActions || []
    );
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
  ): Promise<void> {
    await this.messageBroker.sendActionProgress(
      sessionId,
      action,
      progress,
      status,
      screenshot
    );
  }

  /**
   * Send action completion
   */
  async sendActionComplete(
    sessionId: string,
    action: any,
    result: ActionResult
  ): Promise<void> {
    await this.messageBroker.sendActionComplete(sessionId, action, result);
  }

  /**
   * Send action error
   */
  async sendActionError(
    sessionId: string,
    action: any,
    error: any,
    recoveryOptions?: any[]
  ): Promise<void> {
    await this.messageBroker.sendActionError(sessionId, action, error, recoveryOptions);
  }

  /**
   * Get WebSocket server statistics
   */
  getStats(): {
    connections: ReturnType<ConnectionManager['getStats']>;
    messageQueue: ReturnType<MessageBroker['getQueueStats']>;
    sessions: ReturnType<WebSocketSessionManager['getStats']>;
  } {
    return {
      connections: this.connectionManager.getStats(),
      messageQueue: this.messageBroker.getQueueStats(),
      sessions: this.sessionManager.getStats(),
    };
  }

  /**
   * Broadcast system message to all connections
   */
  async broadcastSystemMessage(message: string, type: 'info' | 'warning' | 'error' = 'info'): Promise<number> {
    return await this.messageBroker.broadcast('system', {
      type,
      message,
      timestamp: new Date(),
    });
  }

  /**
   * Shutdown WebSocket server
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down WebSocket Server');

    // Notify all clients about shutdown
    await this.broadcastSystemMessage('Server is shutting down', 'warning');

    // Shutdown components in reverse order
    this.sessionManager.shutdown();
    this.messageBroker.shutdown();
    await this.connectionManager.shutdown();

    this.logger.info('WebSocket Server shutdown complete');
  }
}
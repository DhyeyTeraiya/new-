import { WebSocketMessage } from '@browser-ai-agent/shared';

/**
 * Message handler for background script communication
 */
export class MessageHandler {
  private messageQueue: Map<string, any> = new Map();
  private responseCallbacks: Map<string, (response: any) => void> = new Map();

  constructor() {
    this.setupMessageListeners();
  }

  /**
   * Setup message listeners
   */
  private setupMessageListeners(): void {
    // Listen for messages from content scripts
    chrome.runtime.onMessage.addListener(
      (message, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
        return true; // Keep message channel open
      }
    );

    // Listen for external messages (from web pages)
    chrome.runtime.onMessageExternal.addListener(
      (message, sender, sendResponse) => {
        this.handleExternalMessage(message, sender, sendResponse);
        return true;
      }
    );
  }

  /**
   * Handle messages from content scripts and popup
   */
  private async handleMessage(
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): Promise<void> {
    try {
      switch (message.type) {
        case 'PING':
          sendResponse({ type: 'PONG', timestamp: Date.now() });
          break;

        case 'QUEUE_MESSAGE':
          this.queueMessage(message.id, message.data);
          sendResponse({ success: true });
          break;

        case 'GET_QUEUED_MESSAGE':
          const queuedMessage = this.getQueuedMessage(message.id);
          sendResponse({ success: true, data: queuedMessage });
          break;

        case 'CLEAR_MESSAGE_QUEUE':
          this.clearMessageQueue();
          sendResponse({ success: true });
          break;

        case 'REGISTER_CALLBACK':
          this.registerCallback(message.id, sendResponse);
          break;

        case 'BROADCAST_TO_TABS':
          await this.broadcastToTabs(message.data);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Message handler error:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle external messages (from web pages)
   */
  private async handleExternalMessage(
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): Promise<void> {
    // Only allow messages from specific origins for security
    const allowedOrigins = ['http://localhost:3000', 'https://localhost:3000'];
    
    if (!sender.origin || !allowedOrigins.includes(sender.origin)) {
      sendResponse({ success: false, error: 'Unauthorized origin' });
      return;
    }

    try {
      switch (message.type) {
        case 'EXTENSION_PING':
          sendResponse({ success: true, extensionId: chrome.runtime.id });
          break;

        case 'REQUEST_PERMISSION':
          // Handle permission requests from web pages
          sendResponse({ success: true, granted: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown external message type' });
      }
    } catch (error) {
      console.error('External message handler error:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Queue a message for later retrieval
   */
  private queueMessage(id: string, data: any): void {
    this.messageQueue.set(id, {
      data,
      timestamp: Date.now(),
      ttl: 5 * 60 * 1000 // 5 minutes TTL
    });

    // Clean up expired messages
    this.cleanupExpiredMessages();
  }

  /**
   * Get a queued message
   */
  private getQueuedMessage(id: string): any {
    const message = this.messageQueue.get(id);
    if (message) {
      this.messageQueue.delete(id);
      return message.data;
    }
    return null;
  }

  /**
   * Clear all queued messages
   */
  private clearMessageQueue(): void {
    this.messageQueue.clear();
  }

  /**
   * Register a callback for async responses
   */
  private registerCallback(id: string, callback: (response: any) => void): void {
    this.responseCallbacks.set(id, callback);

    // Auto-cleanup after 30 seconds
    setTimeout(() => {
      this.responseCallbacks.delete(id);
    }, 30000);
  }

  /**
   * Trigger a registered callback
   */
  public triggerCallback(id: string, response: any): void {
    const callback = this.responseCallbacks.get(id);
    if (callback) {
      callback(response);
      this.responseCallbacks.delete(id);
    }
  }

  /**
   * Broadcast message to all tabs
   */
  private async broadcastToTabs(message: any): Promise<void> {
    const tabs = await chrome.tabs.query({});
    
    for (const tab of tabs) {
      if (tab.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, message);
        } catch (error) {
          // Tab might not have content script, ignore
        }
      }
    }
  }

  /**
   * Clean up expired messages from queue
   */
  private cleanupExpiredMessages(): void {
    const now = Date.now();
    for (const [id, message] of this.messageQueue.entries()) {
      if (now - message.timestamp > message.ttl) {
        this.messageQueue.delete(id);
      }
    }
  }

  /**
   * Send message to specific tab
   */
  public async sendMessageToTab(tabId: number, message: any): Promise<any> {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      console.error(`Failed to send message to tab ${tabId}:`, error);
      throw error;
    }
  }

  /**
   * Send message to popup
   */
  public async sendMessageToPopup(message: any): Promise<void> {
    try {
      await chrome.runtime.sendMessage(message);
    } catch (error) {
      // Popup might not be open, ignore
    }
  }

  /**
   * Get message queue size
   */
  public getQueueSize(): number {
    return this.messageQueue.size;
  }

  /**
   * Get active callback count
   */
  public getCallbackCount(): number {
    return this.responseCallbacks.size;
  }
}
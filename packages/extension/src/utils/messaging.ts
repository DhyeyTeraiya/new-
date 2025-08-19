/**
 * Chrome extension messaging utilities
 */

export interface ExtensionMessage {
  type: string;
  payload?: any;
  requestId?: string;
}

export interface MessageResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export class ExtensionMessaging {
  private static messageHandlers: Map<string, Function[]> = new Map();
  private static pendingRequests: Map<string, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  /**
   * Send message to background script
   */
  static async sendToBackground(
    type: string,
    payload?: any,
    timeout: number = 5000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Message timeout'));
      }, timeout);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout: timeoutHandle,
      });

      const message: ExtensionMessage = {
        type,
        payload,
        requestId,
      };

      chrome.runtime.sendMessage(message, (response) => {
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(requestId);

          if (chrome.runtime.lastError) {
            pending.reject(new Error(chrome.runtime.lastError.message));
          } else {
            pending.resolve(response);
          }
        }
      });
    });
  }

  /**
   * Send message to content script
   */
  static async sendToContentScript(
    tabId: number,
    type: string,
    payload?: any,
    timeout: number = 5000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Message timeout'));
      }, timeout);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout: timeoutHandle,
      });

      const message: ExtensionMessage = {
        type,
        payload,
        requestId,
      };

      chrome.tabs.sendMessage(tabId, message, (response) => {
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(requestId);

          if (chrome.runtime.lastError) {
            pending.reject(new Error(chrome.runtime.lastError.message));
          } else {
            pending.resolve(response);
          }
        }
      });
    });
  }

  /**
   * Send message to all content scripts
   */
  static async broadcastToContentScripts(
    type: string,
    payload?: any,
    filter?: (tab: chrome.tabs.Tab) => boolean
  ): Promise<{ tabId: number; success: boolean; response?: any; error?: string }[]> {
    const tabs = await this.getAllTabs();
    const results: { tabId: number; success: boolean; response?: any; error?: string }[] = [];

    const promises = tabs
      .filter(tab => tab.id && tab.url && !tab.url.startsWith('chrome://'))
      .filter(tab => !filter || filter(tab))
      .map(async (tab) => {
        try {
          const response = await this.sendToContentScript(tab.id!, type, payload);
          results.push({ tabId: tab.id!, success: true, response });
        } catch (error) {
          results.push({ 
            tabId: tab.id!, 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      });

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * Register message handler
   */
  static onMessage(
    messageType: string,
    handler: (payload: any, sender: chrome.runtime.MessageSender) => any | Promise<any>
  ): void {
    if (!this.messageHandlers.has(messageType)) {
      this.messageHandlers.set(messageType, []);
    }
    
    this.messageHandlers.get(messageType)!.push(handler);

    // Set up runtime message listener if not already set
    if (!chrome.runtime.onMessage.hasListeners()) {
      chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
        return true; // Keep message channel open for async responses
      });
    }
  }

  /**
   * Remove message handler
   */
  static removeMessageHandler(messageType: string, handler: Function): void {
    const handlers = this.messageHandlers.get(messageType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
      
      if (handlers.length === 0) {
        this.messageHandlers.delete(messageType);
      }
    }
  }

  /**
   * Handle incoming message
   */
  private static async handleMessage(
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): Promise<void> {
    const handlers = this.messageHandlers.get(message.type);
    
    if (!handlers || handlers.length === 0) {
      sendResponse({
        success: false,
        error: `No handler registered for message type: ${message.type}`,
      });
      return;
    }

    try {
      // Execute all handlers for this message type
      const results = await Promise.allSettled(
        handlers.map(handler => handler(message.payload, sender))
      );

      // Return the first successful result or the first error
      const successfulResult = results.find(result => result.status === 'fulfilled');
      
      if (successfulResult && successfulResult.status === 'fulfilled') {
        sendResponse({
          success: true,
          data: successfulResult.value,
        });
      } else {
        const failedResult = results.find(result => result.status === 'rejected');
        const error = failedResult && failedResult.status === 'rejected' 
          ? failedResult.reason 
          : 'Unknown error';
        
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get all tabs
   */
  private static async getAllTabs(): Promise<chrome.tabs.Tab[]> {
    return new Promise((resolve) => {
      chrome.tabs.query({}, (tabs) => {
        resolve(tabs);
      });
    });
  }

  /**
   * Generate unique request ID
   */
  private static generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up pending requests (call on extension shutdown)
   */
  static cleanup(): void {
    for (const [requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Extension shutting down'));
    }
    
    this.pendingRequests.clear();
    this.messageHandlers.clear();
  }
}

/**
 * Specialized messaging helpers
 */
export class AIAgentMessaging {
  /**
   * Send chat message to background script
   */
  static async sendChatMessage(
    message: string,
    pageContext?: any,
    messageType: string = 'command'
  ): Promise<any> {
    return ExtensionMessaging.sendToBackground('SEND_CHAT_MESSAGE', {
      message,
      pageContext,
      messageType,
    });
  }

  /**
   * Request screenshot
   */
  static async requestScreenshot(options?: {
    fullPage?: boolean;
    highlightElements?: string[];
  }): Promise<any> {
    return ExtensionMessaging.sendToBackground('REQUEST_SCREENSHOT', options);
  }

  /**
   * Notify page change
   */
  static async notifyPageChange(
    previousContext?: any,
    newContext?: any,
    navigationType?: string
  ): Promise<any> {
    return ExtensionMessaging.sendToBackground('PAGE_CHANGED', {
      previousContext,
      newContext,
      navigationType,
    });
  }

  /**
   * Get session info
   */
  static async getSessionInfo(): Promise<{
    session: any;
    authToken: string;
    connected: boolean;
  }> {
    return ExtensionMessaging.sendToBackground('GET_SESSION_INFO');
  }

  /**
   * Send ping to keep connection alive
   */
  static async ping(): Promise<any> {
    return ExtensionMessaging.sendToBackground('PING');
  }

  /**
   * Show floating widget
   */
  static async showWidget(message?: string): Promise<any> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      return ExtensionMessaging.sendToContentScript(tabs[0].id, 'SHOW_WIDGET', {
        message,
      });
    }
  }

  /**
   * Hide floating widget
   */
  static async hideWidget(): Promise<any> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      return ExtensionMessaging.sendToContentScript(tabs[0].id, 'HIDE_WIDGET');
    }
  }

  /**
   * Update widget state
   */
  static async updateWidgetState(state: {
    visible?: boolean;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
  }): Promise<any> {
    return ExtensionMessaging.broadcastToContentScripts('UPDATE_WIDGET_STATE', state);
  }

  /**
   * Execute action on current page
   */
  static async executePageAction(
    action: any,
    options?: any
  ): Promise<any> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      return ExtensionMessaging.sendToContentScript(tabs[0].id, 'EXECUTE_ACTION', {
        action,
        options,
      });
    }
  }

  /**
   * Extract page context from current page
   */
  static async extractPageContext(): Promise<any> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      return ExtensionMessaging.sendToContentScript(tabs[0].id, 'EXTRACT_PAGE_CONTEXT');
    }
  }

  /**
   * Highlight elements on current page
   */
  static async highlightElements(
    selectors: string[],
    duration: number = 2000
  ): Promise<any> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      return ExtensionMessaging.sendToContentScript(tabs[0].id, 'HIGHLIGHT_ELEMENTS', {
        selectors,
        duration,
      });
    }
  }
}
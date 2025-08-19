/**
 * Widget Manager
 * Manages the lifecycle and integration of the AI widget with the content script
 */

import { WidgetController } from './widget-controller';

export class WidgetManager {
  private widget: WidgetController | null = null;
  private widgetFrame: HTMLIFrameElement | null = null;
  private isInitialized: boolean = false;
  private messageHandlers: Map<string, (data: any) => void> = new Map();

  constructor() {
    this.setupMessageHandlers();
  }

  /**
   * Initialize the widget
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.createWidgetFrame();
      await this.loadWidget();
      this.setupCommunication();
      this.isInitialized = true;
      
      console.log('AI Widget initialized successfully');
    } catch (error) {
      console.error('Failed to initialize AI Widget:', error);
      throw error;
    }
  }

  /**
   * Create the iframe container for the widget
   */
  private async createWidgetFrame(): Promise<void> {
    // Remove existing frame if present
    if (this.widgetFrame) {
      this.widgetFrame.remove();
    }

    this.widgetFrame = document.createElement('iframe');
    this.widgetFrame.id = 'ai-widget-frame';
    this.widgetFrame.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      right: 0 !important;
      width: 100% !important;
      height: 100% !important;
      border: none !important;
      background: transparent !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
    `;
    
    // Set iframe attributes
    this.widgetFrame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    this.widgetFrame.setAttribute('title', 'AI Assistant Widget');
    
    document.body.appendChild(this.widgetFrame);
  }

  /**
   * Load the widget HTML into the iframe
   */
  private async loadWidget(): Promise<void> {
    if (!this.widgetFrame) throw new Error('Widget frame not created');

    return new Promise((resolve, reject) => {
      const widgetHTML = this.getWidgetHTML();
      
      this.widgetFrame!.onload = () => {
        try {
          // Enable pointer events for the widget container only
          const widgetDoc = this.widgetFrame!.contentDocument;
          if (widgetDoc) {
            const widgetContainer = widgetDoc.getElementById('aiWidget');
            if (widgetContainer) {
              widgetContainer.style.pointerEvents = 'all';
            }
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      this.widgetFrame!.onerror = () => {
        reject(new Error('Failed to load widget'));
      };

      // Write HTML to iframe
      const doc = this.widgetFrame!.contentDocument;
      if (doc) {
        doc.open();
        doc.write(widgetHTML);
        doc.close();
      } else {
        reject(new Error('Cannot access iframe document'));
      }
    });
  }

  /**
   * Get the widget HTML content
   */
  private getWidgetHTML(): string {
    // In a real implementation, this would load from the widget.html file
    // For now, we'll return the HTML inline
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Agent Widget</title>
    <style>
        /* Widget styles would be loaded here */
        /* For brevity, using minimal styles */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: transparent;
            overflow: hidden;
        }

        .widget-container {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 2147483647;
            font-size: 14px;
            pointer-events: all;
        }

        .widget-button {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            transition: all 0.3s ease;
            color: white;
            font-weight: bold;
        }

        .widget-button:hover {
            transform: scale(1.05);
        }

        .chat-window {
            position: absolute;
            bottom: 70px;
            right: 0;
            width: 380px;
            height: 500px;
            background: white;
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
            display: none;
            flex-direction: column;
            border: 1px solid #e5e7eb;
        }

        .chat-window.visible {
            display: flex;
        }

        .chat-header {
            padding: 16px 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 16px 16px 0 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .chat-messages {
            flex: 1;
            padding: 16px;
            overflow-y: auto;
        }

        .chat-input-container {
            padding: 16px;
            border-top: 1px solid #e5e7eb;
        }

        .chat-input {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #d1d5db;
            border-radius: 20px;
            resize: none;
            font-family: inherit;
            font-size: 14px;
            outline: none;
        }

        .message {
            margin-bottom: 12px;
            padding: 8px 12px;
            border-radius: 12px;
            max-width: 80%;
        }

        .message.user {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            margin-left: auto;
        }

        .message.ai {
            background: #f3f4f6;
            color: #374151;
        }
    </style>
</head>
<body>
    <div class="widget-container" id="aiWidget">
        <button class="widget-button" id="widgetButton" onclick="toggleWidget()">
            AI
        </button>
        
        <div class="chat-window" id="chatWindow">
            <div class="chat-header">
                <div>
                    <h3>AI Assistant</h3>
                    <div>Connected</div>
                </div>
                <button onclick="toggleWidget()" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer;">×</button>
            </div>
            
            <div class="chat-messages" id="chatMessages">
                <div class="message ai">
                    Hi! I'm your AI assistant. I can help you analyze pages, extract data, automate tasks, and more. What would you like to do?
                </div>
            </div>
            
            <div class="chat-input-container">
                <textarea 
                    class="chat-input" 
                    id="chatInput" 
                    placeholder="Ask me anything about this page..."
                    rows="1"
                    onkeydown="handleKeyDown(event)"
                ></textarea>
            </div>
        </div>
    </div>

    <script>
        let isExpanded = false;
        
        function toggleWidget() {
            isExpanded = !isExpanded;
            const chatWindow = document.getElementById('chatWindow');
            chatWindow.classList.toggle('visible', isExpanded);
            
            // Notify parent window
            window.parent.postMessage({
                type: 'AI_WIDGET_EVENT',
                data: { event: 'toggle', expanded: isExpanded }
            }, '*');
        }
        
        function handleKeyDown(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        }
        
        function sendMessage() {
            const input = document.getElementById('chatInput');
            const message = input.value.trim();
            if (!message) return;
            
            // Add user message to chat
            addMessage(message, 'user');
            input.value = '';
            
            // Send to parent window
            window.parent.postMessage({
                type: 'AI_CHAT_MESSAGE',
                data: { message, includeContext: true }
            }, '*');
        }
        
        function addMessage(content, type = 'ai') {
            const messagesContainer = document.getElementById('chatMessages');
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + type;
            messageDiv.textContent = content;
            messagesContainer.appendChild(messageDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
        
        // Listen for messages from parent window
        window.addEventListener('message', function(event) {
            if (event.data.type === 'AI_RESPONSE') {
                addMessage(event.data.content, 'ai');
            }
        });
        
        // Initialize
        console.log('AI Widget loaded');
    </script>
</body>
</html>`;
  }

  /**
   * Setup communication between widget and content script
   */
  private setupCommunication(): void {
    window.addEventListener('message', (event) => {
      if (event.source === this.widgetFrame?.contentWindow) {
        this.handleWidgetMessage(event.data);
      }
    });
  }

  /**
   * Setup message handlers
   */
  private setupMessageHandlers(): void {
    this.messageHandlers.set('AI_CHAT_MESSAGE', (data) => {
      this.handleChatMessage(data);
    });

    this.messageHandlers.set('AI_WIDGET_EVENT', (data) => {
      this.handleWidgetEvent(data);
    });

    this.messageHandlers.set('AI_CHECK_CONNECTION', () => {
      this.checkConnection();
    });

    this.messageHandlers.set('AI_EXECUTE_AUTOMATION', (data) => {
      this.executeAutomation(data);
    });

    this.messageHandlers.set('AI_HIGHLIGHT_ELEMENT', (data) => {
      this.highlightElement(data);
    });
  }

  /**
   * Handle messages from the widget
   */
  private handleWidgetMessage(message: any): void {
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      handler(message.data);
    } else {
      console.warn('Unknown widget message type:', message.type);
    }
  }

  /**
   * Handle chat messages from the widget
   */
  private async handleChatMessage(data: { message: string; includeContext: boolean }): Promise<void> {
    try {
      // Send message to background script
      const response = await chrome.runtime.sendMessage({
        type: 'SEND_CHAT_MESSAGE',
        data: {
          message: data.message,
          includeContext: data.includeContext
        }
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to send message');
      }
    } catch (error) {
      console.error('Failed to handle chat message:', error);
      this.sendToWidget({
        type: 'AI_RESPONSE',
        content: 'Sorry, I encountered an error. Please try again.'
      });
    }
  }

  /**
   * Handle widget events
   */
  private handleWidgetEvent(data: { event: string; [key: string]: any }): void {
    switch (data.event) {
      case 'toggle':
        console.log('Widget toggled:', data.expanded);
        break;
      case 'minimize':
        console.log('Widget minimized');
        break;
      default:
        console.log('Widget event:', data);
    }
  }

  /**
   * Check connection status
   */
  private async checkConnection(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_SESSION'
      });

      const connected = response.success && response.data?.hasToken && response.data?.wsConnected;
      
      this.sendToWidget({
        type: 'CONNECTION_STATUS',
        payload: { connected }
      });
    } catch (error) {
      console.error('Failed to check connection:', error);
      this.sendToWidget({
        type: 'CONNECTION_STATUS',
        payload: { connected: false }
      });
    }
  }

  /**
   * Execute automation
   */
  private async executeAutomation(data: any): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'EXECUTE_AUTOMATION',
        data
      });

      if (response.success) {
        this.sendToWidget({
          type: 'AI_RESPONSE',
          content: 'Automation executed successfully!'
        });
      } else {
        throw new Error(response.error || 'Automation failed');
      }
    } catch (error) {
      console.error('Failed to execute automation:', error);
      this.sendToWidget({
        type: 'AI_RESPONSE',
        content: 'Failed to execute automation. Please try again.'
      });
    }
  }

  /**
   * Highlight element on page
   */
  private highlightElement(data: { selector: string }): void {
    try {
      const element = document.querySelector(data.selector);
      if (element) {
        element.classList.add('ai-agent-highlight');
        
        // Remove highlight after 3 seconds
        setTimeout(() => {
          element.classList.remove('ai-agent-highlight');
        }, 3000);
      }
    } catch (error) {
      console.error('Failed to highlight element:', error);
    }
  }

  /**
   * Send message to widget
   */
  private sendToWidget(message: any): void {
    if (this.widgetFrame?.contentWindow) {
      this.widgetFrame.contentWindow.postMessage(message, '*');
    }
  }

  /**
   * Show the widget
   */
  public show(): void {
    this.sendToWidget({
      type: 'WIDGET_COMMAND',
      command: 'show'
    });
  }

  /**
   * Hide the widget
   */
  public hide(): void {
    this.sendToWidget({
      type: 'WIDGET_COMMAND',
      command: 'hide'
    });
  }

  /**
   * Send AI response to widget
   */
  public sendAIResponse(content: string, actions?: any[]): void {
    this.sendToWidget({
      type: 'AI_RESPONSE',
      content,
      actions
    });
  }

  /**
   * Update connection status
   */
  public updateConnectionStatus(connected: boolean): void {
    this.sendToWidget({
      type: 'CONNECTION_STATUS',
      payload: { connected }
    });
  }

  /**
   * Handle WebSocket messages
   */
  public handleWebSocketMessage(message: any): void {
    switch (message.type) {
      case 'ai_response':
        this.sendAIResponse(message.payload.message, message.payload.actions);
        break;
      case 'automation_result':
        this.sendToWidget({
          type: 'AI_RESPONSE',
          content: `Automation completed: ${message.payload.result}`
        });
        break;
      case 'error':
        this.sendToWidget({
          type: 'AI_RESPONSE',
          content: `Error: ${message.payload.error}`
        });
        break;
    }
  }

  /**
   * Destroy the widget
   */
  public destroy(): void {
    if (this.widgetFrame) {
      this.widgetFrame.remove();
      this.widgetFrame = null;
    }
    this.isInitialized = false;
  }

  /**
   * Check if widget is initialized
   */
  public isReady(): boolean {
    return this.isInitialized;
  }
}
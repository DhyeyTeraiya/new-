/**
 * Simple Content Script for Browser AI Agent Extension
 * Minimal version that provides basic page interaction
 */

class SimpleContentScript {
  private widget: HTMLElement | null = null;
  private isWidgetVisible = false;

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    console.log('🔧 Browser AI Agent Content Script Loaded');
    
    // Wait for page to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.createWidget());
    } else {
      this.createWidget();
    }

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true;
    });
  }

  private createWidget(): void {
    try {
      // Create floating AI widget
      this.widget = document.createElement('div');
      this.widget.id = 'browser-ai-agent-widget';
      this.widget.innerHTML = `
        <div id="ai-widget-container" style="
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 2147483647;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        ">
          <!-- Chat Window -->
          <div id="ai-chat-window" style="
            display: none;
            width: 380px;
            height: 600px;
            background: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(20px);
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15), 0 8px 32px rgba(0, 0, 0, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            margin-bottom: 16px;
            overflow: hidden;
            transform: translateY(20px) scale(0.95);
            opacity: 0;
            transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          ">
            <!-- Header with Gradient -->
            <div id="ai-chat-header" style="
              background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%);
              color: white;
              padding: 20px 24px;
              font-weight: 600;
              display: flex;
              justify-content: space-between;
              align-items: center;
              position: relative;
              overflow: hidden;
            ">
              <div style="display: flex; align-items: center; gap: 12px;">
                <div style="
                  width: 32px;
                  height: 32px;
                  background: rgba(255, 255, 255, 0.2);
                  border-radius: 8px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: 16px;
                ">🤖</div>
                <div>
                  <div style="font-size: 16px; font-weight: 600;">AI Assistant</div>
                  <div style="font-size: 12px; opacity: 0.8;">Ready to help</div>
                </div>
              </div>
              <button id="ai-close-btn" style="
                background: rgba(255, 255, 255, 0.1);
                border: none;
                color: white;
                font-size: 16px;
                cursor: pointer;
                padding: 8px;
                width: 32px;
                height: 32px;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
              " onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">×</button>
              <!-- Animated background -->
              <div style="
                position: absolute;
                top: -50%;
                left: -50%;
                width: 200%;
                height: 200%;
                background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
                animation: float 6s ease-in-out infinite;
                pointer-events: none;
              "></div>
            </div>
            
            <!-- Messages Area -->
            <div id="ai-chat-messages" style="
              height: 440px;
              overflow-y: auto;
              padding: 24px;
              background: linear-gradient(180deg, #fafafa 0%, #f8fafc 100%);
              scroll-behavior: smooth;
            ">
              <div style="
                background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
                padding: 16px 20px;
                border-radius: 16px;
                margin-bottom: 16px;
                border: 1px solid rgba(99, 102, 241, 0.1);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
                position: relative;
                animation: slideIn 0.5s ease-out;
              ">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                  <div style="width: 6px; height: 6px; background: #10b981; border-radius: 50%; animation: pulse 2s infinite;"></div>
                  <span style="font-size: 12px; color: #6b7280; font-weight: 500;">AI Assistant</span>
                </div>
                <div style="color: #374151; line-height: 1.5;">
                  👋 Hello! I'm your intelligent browser assistant. I can help you navigate websites, fill forms, extract data, and automate repetitive tasks. 
                  <br><br>
                  <strong>Try asking me:</strong>
                  <ul style="margin: 8px 0; padding-left: 16px; color: #6b7280;">
                    <li>"Fill out this form for me"</li>
                    <li>"Click the login button"</li>
                    <li>"Extract all the product prices"</li>
                    <li>"Navigate to the checkout page"</li>
                  </ul>
                  What would you like me to help you with?
                </div>
              </div>
            </div>
            
            <!-- Input Area -->
            <div id="ai-chat-input-container" style="
              padding: 20px 24px;
              border-top: 1px solid rgba(0, 0, 0, 0.06);
              background: rgba(255, 255, 255, 0.95);
              backdrop-filter: blur(10px);
            ">
              <div style="
                display: flex;
                gap: 12px;
                align-items: flex-end;
                background: white;
                border-radius: 16px;
                padding: 4px;
                border: 2px solid transparent;
                box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
                transition: all 0.2s ease;
              " id="input-wrapper">
                <input 
                  id="ai-chat-input" 
                  type="text" 
                  placeholder="Type your message or describe what you'd like me to do..."
                  style="
                    flex: 1;
                    padding: 14px 16px;
                    border: none;
                    border-radius: 12px;
                    font-size: 14px;
                    outline: none;
                    background: transparent;
                    color: #374151;
                    resize: none;
                    min-height: 20px;
                    max-height: 100px;
                  "
                />
                <button id="ai-send-btn" style="
                  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                  color: white;
                  border: none;
                  padding: 12px 16px;
                  border-radius: 12px;
                  cursor: pointer;
                  font-weight: 600;
                  font-size: 14px;
                  transition: all 0.2s ease;
                  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
                  display: flex;
                  align-items: center;
                  gap: 6px;
                " onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 12px rgba(99, 102, 241, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(99, 102, 241, 0.3)'">
                  <span>Send</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22,2 15,22 11,13 2,9 22,2"></polygon>
                  </svg>
                </button>
              </div>
            </div>
          </div>
          
          <!-- Floating Button -->
          <button id="ai-widget-btn" style="
            width: 64px;
            height: 64px;
            border-radius: 50%;
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%);
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            box-shadow: 0 8px 32px rgba(99, 102, 241, 0.4), 0 4px 16px rgba(0, 0, 0, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            position: relative;
            overflow: hidden;
          " onmouseover="this.style.transform='scale(1.1) translateY(-2px)'; this.style.boxShadow='0 12px 40px rgba(99, 102, 241, 0.5), 0 8px 24px rgba(0, 0, 0, 0.15)'" onmouseout="this.style.transform='scale(1) translateY(0)'; this.style.boxShadow='0 8px 32px rgba(99, 102, 241, 0.4), 0 4px 16px rgba(0, 0, 0, 0.1)'">
            <div style="
              position: absolute;
              top: -50%;
              left: -50%;
              width: 200%;
              height: 200%;
              background: radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%);
              animation: rotate 8s linear infinite;
              pointer-events: none;
            "></div>
            <span style="position: relative; z-index: 1;">🤖</span>
          </button>
        </div>
        
        <style>
          @keyframes slideIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          
          @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-10px) rotate(180deg); }
          }
          
          @keyframes rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          
          #ai-chat-messages::-webkit-scrollbar {
            width: 6px;
          }
          
          #ai-chat-messages::-webkit-scrollbar-track {
            background: transparent;
          }
          
          #ai-chat-messages::-webkit-scrollbar-thumb {
            background: rgba(99, 102, 241, 0.2);
            border-radius: 3px;
          }
          
          #ai-chat-messages::-webkit-scrollbar-thumb:hover {
            background: rgba(99, 102, 241, 0.4);
          }
          
          #ai-chat-input:focus + #ai-send-btn {
            background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          }
          
          #input-wrapper:focus-within {
            border-color: rgba(99, 102, 241, 0.3);
            box-shadow: 0 2px 12px rgba(99, 102, 241, 0.15), 0 0 0 3px rgba(99, 102, 241, 0.1);
          }
        </style>
      `;

      document.body.appendChild(this.widget);

      // Add event listeners
      this.setupEventListeners();

      console.log('✅ AI Widget created successfully');

    } catch (error) {
      console.error('❌ Failed to create widget:', error);
    }
  }

  private setupEventListeners(): void {
    if (!this.widget) return;

    const widgetBtn = this.widget.querySelector('#ai-widget-btn') as HTMLButtonElement;
    const closeBtn = this.widget.querySelector('#ai-close-btn') as HTMLButtonElement;
    const sendBtn = this.widget.querySelector('#ai-send-btn') as HTMLButtonElement;
    const chatInput = this.widget.querySelector('#ai-chat-input') as HTMLInputElement;
    const chatWindow = this.widget.querySelector('#ai-chat-window') as HTMLElement;

    // Toggle chat window
    widgetBtn?.addEventListener('click', () => {
      this.toggleWidget();
    });

    // Close chat window
    closeBtn?.addEventListener('click', () => {
      this.hideWidget();
    });

    // Send message
    sendBtn?.addEventListener('click', () => {
      this.sendMessage();
    });

    // Send message on Enter
    chatInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendMessage();
      }
    });

    // Hover effects
    widgetBtn?.addEventListener('mouseenter', () => {
      widgetBtn.style.transform = 'scale(1.1)';
    });

    widgetBtn?.addEventListener('mouseleave', () => {
      widgetBtn.style.transform = 'scale(1)';
    });
  }

  private toggleWidget(): void {
    if (this.isWidgetVisible) {
      this.hideWidget();
    } else {
      this.showWidget();
    }
  }

  private showWidget(): void {
    const chatWindow = this.widget?.querySelector('#ai-chat-window') as HTMLElement;
    if (chatWindow) {
      chatWindow.style.display = 'block';
      this.isWidgetVisible = true;
      
      // Focus on input
      const chatInput = this.widget?.querySelector('#ai-chat-input') as HTMLInputElement;
      chatInput?.focus();
    }
  }

  private hideWidget(): void {
    const chatWindow = this.widget?.querySelector('#ai-chat-window') as HTMLElement;
    if (chatWindow) {
      chatWindow.style.display = 'none';
      this.isWidgetVisible = false;
    }
  }

  private async sendMessage(): Promise<void> {
    const chatInput = this.widget?.querySelector('#ai-chat-input') as HTMLInputElement;
    const messagesContainer = this.widget?.querySelector('#ai-chat-messages') as HTMLElement;

    if (!chatInput || !messagesContainer) return;

    const message = chatInput.value.trim();
    if (!message) return;

    // Clear input
    chatInput.value = '';

    // Add user message to chat
    this.addMessageToChat(message, 'user');

    // Show typing indicator
    const typingIndicator = this.addTypingIndicator();

    try {
      // Send message to background script
      const response = await chrome.runtime.sendMessage({
        type: 'SEND_CHAT_MESSAGE',
        content: message
      });

      // Remove typing indicator
      typingIndicator?.remove();

      if (response.success) {
        // Add AI response to chat
        this.addMessageToChat(response.response.content, 'assistant');
      } else {
        this.addMessageToChat('Sorry, I encountered an error. Please try again.', 'assistant');
      }

    } catch (error) {
      console.error('❌ Failed to send message:', error);
      typingIndicator?.remove();
      this.addMessageToChat('Sorry, I\'m having trouble connecting. Please try again.', 'assistant');
    }
  }

  private addMessageToChat(content: string, type: 'user' | 'assistant'): void {
    const messagesContainer = this.widget?.querySelector('#ai-chat-messages') as HTMLElement;
    if (!messagesContainer) return;

    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
      background: ${type === 'user' ? '#667eea' : 'white'};
      color: ${type === 'user' ? 'white' : '#333'};
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 12px;
      max-width: 85%;
      margin-left: ${type === 'user' ? 'auto' : '0'};
      margin-right: ${type === 'user' ? '0' : 'auto'};
      word-wrap: break-word;
      ${type === 'assistant' ? 'border-left: 3px solid #667eea;' : ''}
    `;

    messageDiv.textContent = content;
    messagesContainer.appendChild(messageDiv);

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  private addTypingIndicator(): HTMLElement {
    const messagesContainer = this.widget?.querySelector('#ai-chat-messages') as HTMLElement;
    if (!messagesContainer) return document.createElement('div');

    const typingDiv = document.createElement('div');
    typingDiv.style.cssText = `
      background: white;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 12px;
      border-left: 3px solid #667eea;
      font-style: italic;
      color: #666;
    `;

    typingDiv.innerHTML = '🤖 Thinking...';
    messagesContainer.appendChild(typingDiv);

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    return typingDiv;
  }

  private handleMessage(message: any, sender: any, sendResponse: (response: any) => void): void {
    switch (message.type) {
      case 'SHOW_WIDGET':
        this.showWidget();
        sendResponse({ success: true });
        break;

      case 'HIDE_WIDGET':
        this.hideWidget();
        sendResponse({ success: true });
        break;

      case 'GET_PAGE_INFO':
        const pageInfo = {
          url: window.location.href,
          title: document.title,
          timestamp: new Date(),
          elements: this.getInteractiveElements()
        };
        sendResponse({ success: true, pageInfo });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  }

  private getInteractiveElements(): any[] {
    const elements: any[] = [];
    
    // Get clickable elements
    const clickableSelectors = [
      'button',
      'a[href]',
      'input[type="button"]',
      'input[type="submit"]',
      '[onclick]',
      '[role="button"]'
    ];

    clickableSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach((element, index) => {
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          elements.push({
            type: 'clickable',
            selector: `${selector}:nth-of-type(${index + 1})`,
            text: element.textContent?.trim().substring(0, 100) || '',
            bounds: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            }
          });
        }
      });
    });

    // Get form inputs
    document.querySelectorAll('input, textarea, select').forEach((element, index) => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        elements.push({
          type: 'input',
          selector: `${element.tagName.toLowerCase()}:nth-of-type(${index + 1})`,
          inputType: (element as HTMLInputElement).type || 'text',
          placeholder: (element as HTMLInputElement).placeholder || '',
          bounds: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          }
        });
      }
    });

    return elements.slice(0, 50); // Limit to 50 elements
  }
}

// Initialize content script
new SimpleContentScript();
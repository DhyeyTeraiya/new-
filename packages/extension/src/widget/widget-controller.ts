/**
 * AI Widget Controller
 * Manages the floating chat widget UI and interactions
 */

interface Message {
  id: string;
  type: 'user' | 'ai' | 'system';
  content: string;
  timestamp: Date;
  actions?: Array<{
    label: string;
    action: string;
    data?: any;
  }>;
}

interface WidgetState {
  isExpanded: boolean;
  isConnected: boolean;
  isTyping: boolean;
  messages: Message[];
  unreadCount: number;
}

export class WidgetController {
  private state: WidgetState = {
    isExpanded: false,
    isConnected: false,
    isTyping: false,
    messages: [],
    unreadCount: 0
  };

  private elements: {
    container: HTMLElement;
    button: HTMLButtonElement;
    buttonIcon: HTMLElement;
    notificationBadge: HTMLElement;
    chatWindow: HTMLElement;
    chatMessages: HTMLElement;
    chatInput: HTMLTextAreaElement;
    sendButton: HTMLButtonElement;
    typingIndicator: HTMLElement;
    statusText: HTMLElement;
    quickActions: HTMLElement;
    minimizeBtn: HTMLButtonElement;
    settingsBtn: HTMLButtonButton;
  };

  private messageListeners: Map<string, (data: any) => void> = new Map();
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    this.elements = this.getElements();
    this.init();
  }

  private getElements() {
    return {
      container: document.getElementById('aiWidget')!,
      button: document.getElementById('widgetButton') as HTMLButtonElement,
      buttonIcon: document.querySelector('.widget-button-icon')!,
      notificationBadge: document.getElementById('notificationBadge')!,
      chatWindow: document.getElementById('chatWindow')!,
      chatMessages: document.getElementById('chatMessages')!,
      chatInput: document.getElementById('chatInput') as HTMLTextAreaElement,
      sendButton: document.getElementById('sendButton') as HTMLButtonElement,
      typingIndicator: document.getElementById('typingIndicator')!,
      statusText: document.getElementById('statusText')!,
      quickActions: document.getElementById('quickActions')!,
      minimizeBtn: document.getElementById('minimizeBtn') as HTMLButtonElement,
      settingsBtn: document.getElementById('settingsBtn') as HTMLButtonElement
    };
  }

  private async init(): Promise<void> {
    this.setupEventListeners();
    this.setupResizeObserver();
    this.setupKeyboardNavigation();
    
    // Add welcome message
    this.addMessage({
      id: this.generateId(),
      type: 'ai',
      content: 'Hi! I\'m your AI assistant. I can help you analyze pages, extract data, automate tasks, and more. What would you like to do?',
      timestamp: new Date()
    });

    // Check connection status
    await this.checkConnectionStatus();
  }

  private setupEventListeners(): void {
    // Widget button click
    this.elements.button.addEventListener('click', () => {
      this.toggleWidget();
    });

    // Minimize button
    this.elements.minimizeBtn.addEventListener('click', () => {
      this.minimizeWidget();
    });

    // Settings button
    this.elements.settingsBtn.addEventListener('click', () => {
      this.openSettings();
    });

    // Send button
    this.elements.sendButton.addEventListener('click', () => {
      this.sendMessage();
    });

    // Input events
    this.elements.chatInput.addEventListener('input', () => {
      this.handleInputChange();
    });

    this.elements.chatInput.addEventListener('keydown', (e) => {
      this.handleInputKeydown(e);
    });

    // Quick actions
    this.elements.quickActions.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('quick-action-btn')) {
        const action = target.getAttribute('data-action');
        if (action) {
          this.handleQuickAction(action);
        }
      }
    });

    // Click outside to close
    document.addEventListener('click', (e) => {
      if (!this.elements.container.contains(e.target as Node) && this.state.isExpanded) {
        this.minimizeWidget();
      }
    });

    // Listen for messages from content script
    window.addEventListener('message', (e) => {
      if (e.data.type === 'AI_WIDGET_MESSAGE') {
        this.handleExternalMessage(e.data);
      }
    });
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.adjustPosition();
    });
    this.resizeObserver.observe(document.body);
  }

  private setupKeyboardNavigation(): void {
    // Escape key to close widget
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.state.isExpanded) {
        this.minimizeWidget();
      }
    });

    // Tab navigation within widget
    this.elements.chatWindow.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        this.handleTabNavigation(e);
      }
    });
  }

  private toggleWidget(): void {
    if (this.state.isExpanded) {
      this.minimizeWidget();
    } else {
      this.expandWidget();
    }
  }

  private expandWidget(): void {
    this.state.isExpanded = true;
    this.state.unreadCount = 0;
    
    this.elements.button.classList.add('expanded');
    this.elements.button.setAttribute('aria-expanded', 'true');
    this.elements.chatWindow.classList.add('visible');
    this.elements.chatWindow.setAttribute('aria-hidden', 'false');
    this.elements.notificationBadge.classList.remove('visible');
    
    // Focus on input
    setTimeout(() => {
      this.elements.chatInput.focus();
      this.scrollToBottom();
    }, 300);

    this.announceToScreenReader('Chat window opened');
  }

  private minimizeWidget(): void {
    this.state.isExpanded = false;
    
    this.elements.button.classList.remove('expanded');
    this.elements.button.setAttribute('aria-expanded', 'false');
    this.elements.chatWindow.classList.remove('visible');
    this.elements.chatWindow.setAttribute('aria-hidden', 'true');
    
    this.announceToScreenReader('Chat window closed');
  }

  private async sendMessage(): Promise<void> {
    const content = this.elements.chatInput.value.trim();
    if (!content) return;

    // Add user message
    const userMessage: Message = {
      id: this.generateId(),
      type: 'user',
      content,
      timestamp: new Date()
    };

    this.addMessage(userMessage);
    this.elements.chatInput.value = '';
    this.updateSendButton();
    this.showTypingIndicator();

    try {
      // Send to content script
      window.parent.postMessage({
        type: 'AI_CHAT_MESSAGE',
        data: {
          message: content,
          includeContext: true
        }
      }, '*');

    } catch (error) {
      console.error('Failed to send message:', error);
      this.addMessage({
        id: this.generateId(),
        type: 'system',
        content: 'Failed to send message. Please try again.',
        timestamp: new Date()
      });
      this.hideTypingIndicator();
    }
  }

  private handleQuickAction(action: string): void {
    const actionMessages: Record<string, string> = {
      analyze: 'Analyze this page and tell me what it\'s about',
      extract: 'Extract all important data from this page',
      automate: 'Help me automate a task on this page',
      summarize: 'Summarize the main content of this page'
    };

    const message = actionMessages[action];
    if (message) {
      this.elements.chatInput.value = message;
      this.updateSendButton();
      this.sendMessage();
    }
  }

  private addMessage(message: Message): void {
    this.state.messages.push(message);
    
    const messageElement = this.createMessageElement(message);
    this.elements.chatMessages.appendChild(messageElement);
    
    this.scrollToBottom();
    
    if (message.type === 'ai' && !this.state.isExpanded) {
      this.state.unreadCount++;
      this.updateNotificationBadge();
    }
  }

  private createMessageElement(message: Message): HTMLElement {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.type}`;
    messageDiv.setAttribute('data-message-id', message.id);

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = message.type === 'user' ? 'U' : message.type === 'ai' ? 'AI' : 'S';

    const content = document.createElement('div');
    content.className = 'message-content';

    const text = document.createElement('div');
    text.className = 'message-text';
    text.textContent = message.content;

    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = this.formatTime(message.timestamp);

    content.appendChild(text);
    content.appendChild(time);

    // Add action buttons if present
    if (message.actions && message.actions.length > 0) {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'message-actions';

      message.actions.forEach(action => {
        const button = document.createElement('button');
        button.className = 'message-action-btn';
        button.textContent = action.label;
        button.addEventListener('click', () => {
          this.handleMessageAction(action.action, action.data);
        });
        actionsDiv.appendChild(button);
      });

      content.appendChild(actionsDiv);
    }

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);

    return messageDiv;
  }

  private handleMessageAction(action: string, data?: any): void {
    switch (action) {
      case 'execute_automation':
        this.executeAutomation(data);
        break;
      case 'highlight_element':
        this.highlightElement(data.selector);
        break;
      case 'copy_text':
        this.copyToClipboard(data.text);
        break;
      default:
        console.log('Unknown message action:', action);
    }
  }

  private async executeAutomation(data: any): Promise<void> {
    try {
      window.parent.postMessage({
        type: 'AI_EXECUTE_AUTOMATION',
        data
      }, '*');
    } catch (error) {
      console.error('Failed to execute automation:', error);
    }
  }

  private highlightElement(selector: string): void {
    window.parent.postMessage({
      type: 'AI_HIGHLIGHT_ELEMENT',
      data: { selector }
    }, '*');
  }

  private async copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.showToast('Copied to clipboard');
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }

  private handleInputChange(): void {
    this.autoResizeInput();
    this.updateSendButton();
  }

  private handleInputKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  private handleTabNavigation(e: KeyboardEvent): void {
    const focusableElements = this.elements.chatWindow.querySelectorAll(
      'button, input, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement.focus();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
    }
  }

  private autoResizeInput(): void {
    const input = this.elements.chatInput;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  }

  private updateSendButton(): void {
    const hasContent = this.elements.chatInput.value.trim().length > 0;
    this.elements.sendButton.disabled = !hasContent || !this.state.isConnected;
  }

  private updateNotificationBadge(): void {
    if (this.state.unreadCount > 0) {
      this.elements.notificationBadge.textContent = this.state.unreadCount.toString();
      this.elements.notificationBadge.classList.add('visible');
    } else {
      this.elements.notificationBadge.classList.remove('visible');
    }
  }

  private showTypingIndicator(): void {
    this.state.isTyping = true;
    this.elements.typingIndicator.classList.add('visible');
    this.scrollToBottom();
  }

  private hideTypingIndicator(): void {
    this.state.isTyping = false;
    this.elements.typingIndicator.classList.remove('visible');
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }, 100);
  }

  private adjustPosition(): void {
    const rect = this.elements.container.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Adjust horizontal position if needed
    if (rect.right > windowWidth) {
      this.elements.container.style.right = '10px';
    }

    // Adjust vertical position if needed
    if (rect.bottom > windowHeight) {
      this.elements.container.style.top = '10px';
    }
  }

  private async checkConnectionStatus(): Promise<void> {
    try {
      // Check with content script
      window.parent.postMessage({
        type: 'AI_CHECK_CONNECTION'
      }, '*');
    } catch (error) {
      this.updateConnectionStatus(false);
    }
  }

  private updateConnectionStatus(connected: boolean): void {
    this.state.isConnected = connected;
    this.elements.statusText.textContent = connected ? 'Connected' : 'Disconnected';
    this.updateSendButton();
  }

  private handleExternalMessage(data: any): void {
    switch (data.subType) {
      case 'AI_RESPONSE':
        this.handleAIResponse(data.payload);
        break;
      case 'CONNECTION_STATUS':
        this.updateConnectionStatus(data.payload.connected);
        break;
      case 'ERROR':
        this.handleError(data.payload.error);
        break;
    }
  }

  private handleAIResponse(response: any): void {
    this.hideTypingIndicator();
    
    const message: Message = {
      id: this.generateId(),
      type: 'ai',
      content: response.message || response.content,
      timestamp: new Date(),
      actions: response.actions
    };

    this.addMessage(message);
  }

  private handleError(error: string): void {
    this.hideTypingIndicator();
    
    this.addMessage({
      id: this.generateId(),
      type: 'system',
      content: `Error: ${error}`,
      timestamp: new Date()
    });
  }

  private openSettings(): void {
    // TODO: Implement settings panel
    this.showToast('Settings panel coming soon!');
  }

  private showToast(message: string): void {
    // Simple toast notification
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #374151;
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 14px;
      z-index: 2147483648;
      animation: slideIn 0.3s ease;
    `;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  private announceToScreenReader(message: string): void {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    
    document.body.appendChild(announcement);
    
    setTimeout(() => {
      announcement.remove();
    }, 1000);
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public API methods
  public show(): void {
    this.expandWidget();
  }

  public hide(): void {
    this.minimizeWidget();
  }

  public addAIMessage(content: string, actions?: any[]): void {
    this.hideTypingIndicator();
    this.addMessage({
      id: this.generateId(),
      type: 'ai',
      content,
      timestamp: new Date(),
      actions
    });
  }

  public setConnectionStatus(connected: boolean): void {
    this.updateConnectionStatus(connected);
  }

  public showTyping(): void {
    this.showTypingIndicator();
  }

  public hideTyping(): void {
    this.hideTypingIndicator();
  }

  public destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    this.elements.container.remove();
  }
}
/**
 * Chat Manager
 * Main class for managing chat conversations, messages, and UI state
 */

import { 
  ChatMessage, 
  ChatConversation, 
  ChatState, 
  ChatSettings, 
  ChatUIState, 
  ChatEvent,
  MessageTemplate,
  QuickAction
} from './types';
import { MessageRenderer } from './message-renderer';
import { MessageStorage } from './message-storage';
import { EventEmitter } from 'events';

export class ChatManager extends EventEmitter {
  private state: ChatState;
  private messageRenderer: MessageRenderer;
  private messageStorage: MessageStorage;
  private messageQueue: ChatMessage[] = [];
  private typingTimeout: NodeJS.Timeout | null = null;
  private autoSaveInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    
    this.messageRenderer = new MessageRenderer();
    this.messageStorage = new MessageStorage();
    
    this.state = this.getInitialState();
    this.setupAutoSave();
    this.loadStoredData();
  }

  /**
   * Get initial chat state
   */
  private getInitialState(): ChatState {
    return {
      currentConversation: null,
      conversations: [],
      isTyping: false,
      isConnected: false,
      unreadCount: 0,
      settings: {
        theme: 'auto',
        fontSize: 'medium',
        soundEnabled: true,
        notificationsEnabled: true,
        autoScroll: true,
        showTimestamps: true,
        compactMode: false,
        language: 'en'
      },
      ui: {
        isExpanded: false,
        isMinimized: false,
        activeTab: 'chat',
        showEmojiPicker: false,
        showAttachmentMenu: false,
        inputHeight: 40
      }
    };
  }

  /**
   * Initialize chat manager
   */
  async initialize(): Promise<void> {
    await this.messageStorage.initialize();
    await this.loadStoredData();
    
    // Create default conversation if none exists
    if (this.state.conversations.length === 0) {
      await this.createConversation('New Conversation');
    }

    this.emit('initialized');
  }

  /**
   * Create new conversation
   */
  async createConversation(title: string = 'New Conversation'): Promise<ChatConversation> {
    const conversation: ChatConversation = {
      id: this.generateId(),
      title,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: []
    };

    // Add welcome message
    const welcomeMessage: ChatMessage = {
      id: this.generateId(),
      type: 'ai',
      content: 'Hi! I\'m your AI assistant. I can help you analyze pages, extract data, automate tasks, and more. What would you like to do?',
      timestamp: new Date(),
      metadata: {
        actions: this.getWelcomeActions()
      }
    };

    conversation.messages.push(welcomeMessage);
    this.state.conversations.unshift(conversation);
    this.state.currentConversation = conversation;

    await this.saveConversation(conversation);
    this.emitStateChange();

    return conversation;
  }

  /**
   * Get welcome actions
   */
  private getWelcomeActions(): any[] {
    return [
      {
        id: 'analyze-page',
        type: 'button',
        label: 'Analyze Page',
        description: 'Analyze the current page content',
        icon: '🔍',
        data: { action: 'analyze_page' },
        primary: true
      },
      {
        id: 'extract-data',
        type: 'button',
        label: 'Extract Data',
        description: 'Extract structured data from the page',
        icon: '📊',
        data: { action: 'extract_data' }
      },
      {
        id: 'automate-task',
        type: 'button',
        label: 'Automate Task',
        description: 'Help automate a task on this page',
        icon: '🤖',
        data: { action: 'automate_task' }
      },
      {
        id: 'summarize',
        type: 'button',
        label: 'Summarize',
        description: 'Summarize the page content',
        icon: '📝',
        data: { action: 'summarize' }
      }
    ];
  }

  /**
   * Send message
   */
  async sendMessage(content: string, options: {
    includeContext?: boolean;
    parentId?: string;
    attachments?: any[];
  } = {}): Promise<ChatMessage> {
    if (!this.state.currentConversation) {
      await this.createConversation();
    }

    const message: ChatMessage = {
      id: this.generateId(),
      type: 'user',
      content: content.trim(),
      timestamp: new Date(),
      status: 'sending',
      parentId: options.parentId,
      metadata: {
        attachments: options.attachments
      }
    };

    // Add message to current conversation
    this.state.currentConversation!.messages.push(message);
    this.state.currentConversation!.updatedAt = new Date();

    // Update UI
    this.emitStateChange();
    this.scrollToBottom();

    try {
      // Send to background script
      const response = await this.sendToBackground({
        type: 'SEND_CHAT_MESSAGE',
        data: {
          message: content,
          includeContext: options.includeContext !== false,
          conversationId: this.state.currentConversation!.id,
          messageId: message.id
        }
      });

      if (response.success) {
        message.status = 'sent';
        this.showTypingIndicator();
      } else {
        message.status = 'failed';
        this.addSystemMessage(`Failed to send message: ${response.error}`);
      }

    } catch (error) {
      message.status = 'failed';
      this.addSystemMessage(`Error sending message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    await this.saveCurrentConversation();
    this.emitStateChange();

    return message;
  }

  /**
   * Receive AI response
   */
  async receiveMessage(content: string, metadata?: any): Promise<ChatMessage> {
    if (!this.state.currentConversation) {
      await this.createConversation();
    }

    this.hideTypingIndicator();

    const message: ChatMessage = {
      id: this.generateId(),
      type: 'ai',
      content,
      timestamp: new Date(),
      metadata
    };

    this.state.currentConversation!.messages.push(message);
    this.state.currentConversation!.updatedAt = new Date();

    // Update unread count if chat is not visible
    if (!this.state.ui.isExpanded) {
      this.state.unreadCount++;
    }

    await this.saveCurrentConversation();
    this.emitStateChange();
    this.scrollToBottom();

    // Play notification sound
    if (this.state.settings.soundEnabled) {
      this.playNotificationSound();
    }

    return message;
  }

  /**
   * Add system message
   */
  addSystemMessage(content: string, type: 'system' | 'error' = 'system'): ChatMessage {
    if (!this.state.currentConversation) return {} as ChatMessage;

    const message: ChatMessage = {
      id: this.generateId(),
      type,
      content,
      timestamp: new Date()
    };

    this.state.currentConversation.messages.push(message);
    this.state.currentConversation.updatedAt = new Date();

    this.emitStateChange();
    this.scrollToBottom();

    return message;
  }

  /**
   * Delete message
   */
  async deleteMessage(messageId: string): Promise<void> {
    if (!this.state.currentConversation) return;

    const messageIndex = this.state.currentConversation.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    this.state.currentConversation.messages.splice(messageIndex, 1);
    this.state.currentConversation.updatedAt = new Date();

    await this.saveCurrentConversation();
    this.emitStateChange();
  }

  /**
   * Edit message
   */
  async editMessage(messageId: string, newContent: string): Promise<void> {
    if (!this.state.currentConversation) return;

    const message = this.state.currentConversation.messages.find(m => m.id === messageId);
    if (!message || message.type !== 'user') return;

    message.content = newContent;
    message.timestamp = new Date();
    this.state.currentConversation.updatedAt = new Date();

    await this.saveCurrentConversation();
    this.emitStateChange();
  }

  /**
   * React to message
   */
  async reactToMessage(messageId: string, emoji: string): Promise<void> {
    if (!this.state.currentConversation) return;

    const message = this.state.currentConversation.messages.find(m => m.id === messageId);
    if (!message) return;

    if (!message.reactions) {
      message.reactions = [];
    }

    const existingReaction = message.reactions.find(r => r.emoji === emoji);
    if (existingReaction) {
      existingReaction.count++;
      if (!existingReaction.users.includes('user')) {
        existingReaction.users.push('user');
      }
    } else {
      message.reactions.push({
        emoji,
        count: 1,
        users: ['user']
      });
    }

    await this.saveCurrentConversation();
    this.emitStateChange();
  }

  /**
   * Switch conversation
   */
  async switchConversation(conversationId: string): Promise<void> {
    const conversation = this.state.conversations.find(c => c.id === conversationId);
    if (!conversation) return;

    this.state.currentConversation = conversation;
    this.state.unreadCount = 0;
    this.emitStateChange();
  }

  /**
   * Delete conversation
   */
  async deleteConversation(conversationId: string): Promise<void> {
    const index = this.state.conversations.findIndex(c => c.id === conversationId);
    if (index === -1) return;

    this.state.conversations.splice(index, 1);
    
    // Switch to another conversation or create new one
    if (this.state.currentConversation?.id === conversationId) {
      if (this.state.conversations.length > 0) {
        this.state.currentConversation = this.state.conversations[0];
      } else {
        await this.createConversation();
      }
    }

    await this.messageStorage.deleteConversation(conversationId);
    this.emitStateChange();
  }

  /**
   * Archive conversation
   */
  async archiveConversation(conversationId: string): Promise<void> {
    const conversation = this.state.conversations.find(c => c.id === conversationId);
    if (!conversation) return;

    conversation.archived = true;
    await this.saveConversation(conversation);
    this.emitStateChange();
  }

  /**
   * Search messages
   */
  searchMessages(query: string): ChatMessage[] {
    if (!query.trim()) return [];

    const results: ChatMessage[] = [];
    const searchTerm = query.toLowerCase();

    this.state.conversations.forEach(conversation => {
      conversation.messages.forEach(message => {
        if (message.content.toLowerCase().includes(searchTerm)) {
          results.push(message);
        }
      });
    });

    return results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get message templates
   */
  getMessageTemplates(): MessageTemplate[] {
    return [
      {
        id: 'analyze-page',
        name: 'Analyze Page',
        content: 'Please analyze this page and tell me what it\'s about.',
        category: 'analysis',
        icon: '🔍'
      },
      {
        id: 'extract-data',
        name: 'Extract Data',
        content: 'Extract all important data from this page in a structured format.',
        category: 'extraction',
        icon: '📊'
      },
      {
        id: 'find-element',
        name: 'Find Element',
        content: 'Help me find the element that contains "{text}".',
        category: 'automation',
        variables: ['text'],
        icon: '🎯'
      },
      {
        id: 'fill-form',
        name: 'Fill Form',
        content: 'Help me fill out the form on this page with the following information: {data}',
        category: 'automation',
        variables: ['data'],
        icon: '📝'
      },
      {
        id: 'navigate-to',
        name: 'Navigate To',
        content: 'Help me navigate to {destination} from this page.',
        category: 'automation',
        variables: ['destination'],
        icon: '🧭'
      },
      {
        id: 'summarize',
        name: 'Summarize',
        content: 'Please provide a concise summary of this page\'s main content.',
        category: 'analysis',
        icon: '📋'
      }
    ];
  }

  /**
   * Get quick actions
   */
  getQuickActions(): QuickAction[] {
    return [
      {
        id: 'analyze',
        label: 'Analyze',
        description: 'Analyze current page',
        icon: '🔍',
        category: 'page',
        action: () => this.sendMessage('Analyze this page'),
        shortcut: 'Ctrl+A'
      },
      {
        id: 'extract',
        label: 'Extract',
        description: 'Extract page data',
        icon: '📊',
        category: 'data',
        action: () => this.sendMessage('Extract data from this page'),
        shortcut: 'Ctrl+E'
      },
      {
        id: 'automate',
        label: 'Automate',
        description: 'Start automation',
        icon: '🤖',
        category: 'automation',
        action: () => this.sendMessage('Help me automate a task'),
        shortcut: 'Ctrl+R'
      },
      {
        id: 'screenshot',
        label: 'Screenshot',
        description: 'Take screenshot',
        icon: '📸',
        category: 'page',
        action: () => this.takeScreenshot(),
        shortcut: 'Ctrl+S'
      }
    ];
  }

  /**
   * Update settings
   */
  async updateSettings(settings: Partial<ChatSettings>): Promise<void> {
    this.state.settings = { ...this.state.settings, ...settings };
    await this.messageStorage.saveSettings(this.state.settings);
    this.emitStateChange();
    this.emit('settings_changed', this.state.settings);
  }

  /**
   * Update UI state
   */
  updateUIState(uiState: Partial<ChatUIState>): void {
    this.state.ui = { ...this.state.ui, ...uiState };
    this.emitStateChange();
  }

  /**
   * Show typing indicator
   */
  showTypingIndicator(): void {
    this.state.isTyping = true;
    this.emitStateChange();

    // Auto-hide after 30 seconds
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    
    this.typingTimeout = setTimeout(() => {
      this.hideTypingIndicator();
    }, 30000);
  }

  /**
   * Hide typing indicator
   */
  hideTypingIndicator(): void {
    this.state.isTyping = false;
    
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
    
    this.emitStateChange();
  }

  /**
   * Set connection status
   */
  setConnectionStatus(connected: boolean): void {
    this.state.isConnected = connected;
    this.emitStateChange();
    
    if (!connected) {
      this.addSystemMessage('Connection lost. Trying to reconnect...', 'error');
    }
  }

  /**
   * Clear unread count
   */
  clearUnreadCount(): void {
    this.state.unreadCount = 0;
    this.emitStateChange();
  }

  /**
   * Export conversation
   */
  exportConversation(conversationId: string, format: 'json' | 'markdown' | 'html' = 'json'): string {
    const conversation = this.state.conversations.find(c => c.id === conversationId);
    if (!conversation) return '';

    switch (format) {
      case 'markdown':
        return this.exportToMarkdown(conversation);
      case 'html':
        return this.exportToHTML(conversation);
      default:
        return JSON.stringify(conversation, null, 2);
    }
  }

  /**
   * Import conversation
   */
  async importConversation(data: string, format: 'json' = 'json'): Promise<ChatConversation> {
    let conversation: ChatConversation;

    try {
      if (format === 'json') {
        conversation = JSON.parse(data);
      } else {
        throw new Error(`Unsupported format: ${format}`);
      }

      // Validate and sanitize
      conversation.id = this.generateId();
      conversation.createdAt = new Date(conversation.createdAt);
      conversation.updatedAt = new Date();
      
      conversation.messages.forEach(message => {
        message.id = this.generateId();
        message.timestamp = new Date(message.timestamp);
      });

      this.state.conversations.unshift(conversation);
      await this.saveConversation(conversation);
      this.emitStateChange();

      return conversation;

    } catch (error) {
      throw new Error(`Failed to import conversation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current state
   */
  getState(): ChatState {
    return { ...this.state };
  }

  /**
   * Private helper methods
   */

  private async loadStoredData(): Promise<void> {
    try {
      const conversations = await this.messageStorage.getConversations();
      const settings = await this.messageStorage.getSettings();

      this.state.conversations = conversations;
      if (settings) {
        this.state.settings = { ...this.state.settings, ...settings };
      }

      // Set current conversation to most recent
      if (conversations.length > 0) {
        this.state.currentConversation = conversations[0];
      }

    } catch (error) {
      console.error('Failed to load stored data:', error);
    }
  }

  private async saveConversation(conversation: ChatConversation): Promise<void> {
    try {
      await this.messageStorage.saveConversation(conversation);
    } catch (error) {
      console.error('Failed to save conversation:', error);
    }
  }

  private async saveCurrentConversation(): Promise<void> {
    if (this.state.currentConversation) {
      await this.saveConversation(this.state.currentConversation);
    }
  }

  private setupAutoSave(): void {
    this.autoSaveInterval = setInterval(async () => {
      if (this.state.currentConversation) {
        await this.saveCurrentConversation();
      }
    }, 30000); // Auto-save every 30 seconds
  }

  private emitStateChange(): void {
    this.emit('state_changed', this.state);
  }

  private scrollToBottom(): void {
    this.emit('scroll_to_bottom');
  }

  private playNotificationSound(): void {
    // Simple notification sound
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT');
    audio.volume = 0.3;
    audio.play().catch(() => {}); // Ignore errors
  }

  private async takeScreenshot(): Promise<void> {
    try {
      const response = await this.sendToBackground({
        type: 'TAKE_SCREENSHOT',
        data: {}
      });

      if (response.success && response.data?.screenshot) {
        this.addSystemMessage('Screenshot captured successfully');
        // Could add screenshot to conversation as attachment
      } else {
        this.addSystemMessage('Failed to capture screenshot', 'error');
      }
    } catch (error) {
      this.addSystemMessage('Error capturing screenshot', 'error');
    }
  }

  private async sendToBackground(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  private exportToMarkdown(conversation: ChatConversation): string {
    const lines = [
      `# ${conversation.title}`,
      '',
      `Created: ${conversation.createdAt.toLocaleString()}`,
      `Updated: ${conversation.updatedAt.toLocaleString()}`,
      '',
      '---',
      ''
    ];

    conversation.messages.forEach(message => {
      const timestamp = message.timestamp.toLocaleTimeString();
      const sender = message.type === 'user' ? 'You' : 'AI Assistant';
      
      lines.push(`## ${sender} (${timestamp})`);
      lines.push('');
      lines.push(message.content);
      lines.push('');
    });

    return lines.join('\\n');
  }

  private exportToHTML(conversation: ChatConversation): string {
    const messages = conversation.messages.map(message => {
      const timestamp = message.timestamp.toLocaleString();
      const sender = message.type === 'user' ? 'You' : 'AI Assistant';
      const className = `message message-${message.type}`;
      
      return `
        <div class="${className}">
          <div class="message-header">
            <strong>${sender}</strong>
            <span class="timestamp">${timestamp}</span>
          </div>
          <div class="message-content">${message.content}</div>
        </div>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${conversation.title}</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          .message { margin-bottom: 20px; padding: 15px; border-radius: 8px; }
          .message-user { background: #e3f2fd; }
          .message-ai { background: #f3e5f5; }
          .message-header { display: flex; justify-content: space-between; margin-bottom: 10px; }
          .timestamp { color: #666; font-size: 0.9em; }
          .message-content { line-height: 1.5; }
        </style>
      </head>
      <body>
        <h1>${conversation.title}</h1>
        <p>Created: ${conversation.createdAt.toLocaleString()}</p>
        <p>Updated: ${conversation.updatedAt.toLocaleString()}</p>
        <hr>
        ${messages}
      </body>
      </html>
    `;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }

    this.removeAllListeners();
  }
}
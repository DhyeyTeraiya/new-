/**
 * Chat UI Component
 * Main UI component for the chat interface
 */

import { ChatManager } from './chat-manager';
import { ChatState, ChatMessage, MessageTemplate, QuickAction } from './types';
import { EventEmitter } from 'events';

export class ChatUI extends EventEmitter {
  private chatManager: ChatManager;
  private container: HTMLElement;
  private elements: {
    messagesContainer: HTMLElement;
    inputContainer: HTMLElement;
    input: HTMLTextAreaElement;
    sendButton: HTMLButtonElement;
    typingIndicator: HTMLElement;
    quickActions: HTMLElement;
    conversationList: HTMLElement;
    settingsPanel: HTMLElement;
    searchInput: HTMLInputElement;
  };
  
  private isInitialized: boolean = false;
  private resizeObserver: ResizeObserver | null = null;
  private currentState: ChatState | null = null;

  constructor(container: HTMLElement) {
    super();
    
    this.container = container;
    this.chatManager = new ChatManager();
    this.elements = {} as any; // Will be initialized in createUI
  }

  /**
   * Initialize chat UI
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await this.chatManager.initialize();
    this.createUI();
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
    this.setupResizeObserver();

    this.isInitialized = true;
    this.emit('initialized');
  }

  /**
   * Create UI structure
   */
  private createUI(): void {
    this.container.innerHTML = `
      <div class="chat-interface">
        <!-- Header -->
        <div class="chat-header">
          <div class="chat-header-left">
            <button class="chat-tab active" data-tab="chat">
              <span class="tab-icon">💬</span>
              <span class="tab-label">Chat</span>
            </button>
            <button class="chat-tab" data-tab="history">
              <span class="tab-icon">📚</span>
              <span class="tab-label">History</span>
            </button>
            <button class="chat-tab" data-tab="settings">
              <span class="tab-icon">⚙️</span>
              <span class="tab-label">Settings</span>
            </button>
          </div>
          <div class="chat-header-right">
            <button class="header-button" id="searchButton" title="Search messages">
              <span class="button-icon">🔍</span>
            </button>
            <button class="header-button" id="newChatButton" title="New conversation">
              <span class="button-icon">➕</span>
            </button>
            <button class="header-button" id="menuButton" title="Menu">
              <span class="button-icon">⋮</span>
            </button>
          </div>
        </div>

        <!-- Search Bar -->
        <div class="search-bar" id="searchBar" style="display: none;">
          <input type="text" class="search-input" placeholder="Search messages..." />
          <button class="search-close">✕</button>
        </div>

        <!-- Main Content -->
        <div class="chat-content">
          <!-- Chat Tab -->
          <div class="chat-tab-content active" data-tab="chat">
            <!-- Messages Container -->
            <div class="messages-container" id="messagesContainer">
              <div class="messages-scroll">
                <!-- Messages will be rendered here -->
              </div>
            </div>

            <!-- Typing Indicator -->
            <div class="typing-indicator" id="typingIndicator" style="display: none;">
              <div class="typing-avatar">🤖</div>
              <div class="typing-content">
                <div class="typing-dots">
                  <span class="typing-dot"></span>
                  <span class="typing-dot"></span>
                  <span class="typing-dot"></span>
                </div>
                <span class="typing-text">AI is thinking...</span>
              </div>
            </div>

            <!-- Quick Actions -->
            <div class="quick-actions" id="quickActions">
              <!-- Quick action buttons will be rendered here -->
            </div>

            <!-- Input Container -->
            <div class="input-container" id="inputContainer">
              <div class="input-wrapper">
                <button class="input-button" id="attachButton" title="Attach file">
                  <span class="button-icon">📎</span>
                </button>
                <textarea 
                  class="message-input" 
                  id="messageInput" 
                  placeholder="Ask me anything about this page..."
                  rows="1"
                ></textarea>
                <button class="input-button" id="emojiButton" title="Add emoji">
                  <span class="button-icon">😊</span>
                </button>
                <button class="send-button" id="sendButton" disabled>
                  <span class="button-icon">📤</span>
                </button>
              </div>
              
              <!-- Templates -->
              <div class="message-templates" id="messageTemplates" style="display: none;">
                <!-- Message templates will be rendered here -->
              </div>
            </div>
          </div>

          <!-- History Tab -->
          <div class="chat-tab-content" data-tab="history">
            <div class="conversation-list" id="conversationList">
              <!-- Conversation history will be rendered here -->
            </div>
          </div>

          <!-- Settings Tab -->
          <div class="chat-tab-content" data-tab="settings">
            <div class="settings-panel" id="settingsPanel">
              <!-- Settings will be rendered here -->
            </div>
          </div>
        </div>

        <!-- Connection Status -->
        <div class="connection-status" id="connectionStatus">
          <span class="status-dot"></span>
          <span class="status-text">Connecting...</span>
        </div>
      </div>
    `;

    // Get element references
    this.elements = {
      messagesContainer: this.container.querySelector('#messagesContainer')!,
      inputContainer: this.container.querySelector('#inputContainer')!,
      input: this.container.querySelector('#messageInput') as HTMLTextAreaElement,
      sendButton: this.container.querySelector('#sendButton') as HTMLButtonElement,
      typingIndicator: this.container.querySelector('#typingIndicator')!,
      quickActions: this.container.querySelector('#quickActions')!,
      conversationList: this.container.querySelector('#conversationList')!,
      settingsPanel: this.container.querySelector('#settingsPanel')!,
      searchInput: this.container.querySelector('.search-input') as HTMLInputElement
    };
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Chat manager events
    this.chatManager.on('state_changed', (state: ChatState) => {
      this.handleStateChange(state);
    });

    this.chatManager.on('scroll_to_bottom', () => {
      this.scrollToBottom();
    });

    // Input events
    this.elements.input.addEventListener('input', () => {
      this.handleInputChange();
    });

    this.elements.input.addEventListener('keydown', (e) => {
      this.handleInputKeydown(e);
    });

    // Send button
    this.elements.sendButton.addEventListener('click', () => {
      this.sendMessage();
    });

    // Tab switching
    this.container.querySelectorAll('.chat-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const tabName = (e.currentTarget as HTMLElement).getAttribute('data-tab');
        if (tabName) this.switchTab(tabName);
      });
    });

    // Header buttons
    this.container.querySelector('#searchButton')?.addEventListener('click', () => {
      this.toggleSearch();
    });

    this.container.querySelector('#newChatButton')?.addEventListener('click', () => {
      this.createNewConversation();
    });

    this.container.querySelector('#menuButton')?.addEventListener('click', () => {
      this.showMenu();
    });

    // Search
    this.elements.searchInput.addEventListener('input', () => {
      this.handleSearch();
    });

    this.container.querySelector('.search-close')?.addEventListener('click', () => {
      this.toggleSearch();
    });

    // Attach button
    this.container.querySelector('#attachButton')?.addEventListener('click', () => {
      this.showAttachmentMenu();
    });

    // Emoji button
    this.container.querySelector('#emojiButton')?.addEventListener('click', () => {
      this.showEmojiPicker();
    });

    // Custom events from message renderer
    window.addEventListener('chat-action', (e: any) => {
      this.handleChatAction(e.detail);
    });

    window.addEventListener('chat-automation', (e: any) => {
      this.handleAutomationAction(e.detail);
    });

    window.addEventListener('chat-extract', (e: any) => {
      this.handleExtractionAction(e.detail);
    });
  }

  /**
   * Setup keyboard shortcuts
   */
  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      // Only handle shortcuts when chat is focused
      if (!this.container.contains(document.activeElement)) return;

      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'n':
            e.preventDefault();
            this.createNewConversation();
            break;
          case 'f':
            e.preventDefault();
            this.toggleSearch();
            break;
          case '/':
            e.preventDefault();
            this.elements.input.focus();
            break;
        }
      }

      // Escape key
      if (e.key === 'Escape') {
        this.handleEscapeKey();
      }
    });
  }

  /**
   * Setup resize observer
   */
  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });

    this.resizeObserver.observe(this.container);
    this.resizeObserver.observe(this.elements.input);
  }

  /**
   * Handle state changes
   */
  private handleStateChange(state: ChatState): void {
    this.currentState = state;

    // Update messages
    this.renderMessages();

    // Update typing indicator
    this.updateTypingIndicator(state.isTyping);

    // Update connection status
    this.updateConnectionStatus(state.isConnected);

    // Update quick actions
    this.renderQuickActions();

    // Update conversation list
    this.renderConversationList();

    // Update settings panel
    this.renderSettingsPanel();

    // Update UI state
    this.updateUIState(state.ui);
  }

  /**
   * Render messages
   */
  private renderMessages(): void {
    if (!this.currentState?.currentConversation) return;

    const messagesScroll = this.elements.messagesContainer.querySelector('.messages-scroll')!;
    messagesScroll.innerHTML = '';

    this.currentState.currentConversation.messages.forEach(message => {
      this.chatManager.messageRenderer.render(message, messagesScroll);
    });

    this.scrollToBottom();
  }

  /**
   * Render quick actions
   */
  private renderQuickActions(): void {
    const quickActions = this.chatManager.getQuickActions();
    
    this.elements.quickActions.innerHTML = quickActions.map(action => `
      <button class="quick-action-btn" data-action-id="${action.id}" title="${action.description}">
        <span class="action-icon">${action.icon}</span>
        <span class="action-label">${action.label}</span>
        ${action.shortcut ? `<span class="action-shortcut">${action.shortcut}</span>` : ''}
      </button>
    `).join('');

    // Add event listeners
    this.elements.quickActions.querySelectorAll('.quick-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const actionId = (e.currentTarget as HTMLElement).getAttribute('data-action-id');
        const action = quickActions.find(a => a.id === actionId);
        if (action) action.action();
      });
    });
  }

  /**
   * Render conversation list
   */
  private renderConversationList(): void {
    if (!this.currentState) return;

    const conversations = this.currentState.conversations.slice(0, 20); // Show recent 20
    
    this.elements.conversationList.innerHTML = `
      <div class="conversation-list-header">
        <h3>Recent Conversations</h3>
        <button class="clear-history-btn">Clear All</button>
      </div>
      <div class="conversation-items">
        ${conversations.map(conv => `
          <div class="conversation-item ${conv.id === this.currentState?.currentConversation?.id ? 'active' : ''}" 
               data-conversation-id="${conv.id}">
            <div class="conversation-title">${conv.title}</div>
            <div class="conversation-preview">
              ${conv.messages.length > 0 ? conv.messages[conv.messages.length - 1].content.substring(0, 50) + '...' : 'No messages'}
            </div>
            <div class="conversation-meta">
              <span class="conversation-date">${this.formatDate(conv.updatedAt)}</span>
              <span class="conversation-count">${conv.messages.length} messages</span>
            </div>
            <div class="conversation-actions">
              <button class="conversation-action" data-action="rename" title="Rename">✏️</button>
              <button class="conversation-action" data-action="archive" title="Archive">📦</button>
              <button class="conversation-action" data-action="delete" title="Delete">🗑️</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Add event listeners
    this.elements.conversationList.querySelectorAll('.conversation-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('conversation-action')) return;
        
        const conversationId = item.getAttribute('data-conversation-id');
        if (conversationId) {
          this.chatManager.switchConversation(conversationId);
          this.switchTab('chat');
        }
      });
    });

    // Conversation actions
    this.elements.conversationList.querySelectorAll('.conversation-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        const conversationId = btn.closest('.conversation-item')?.getAttribute('data-conversation-id');
        
        if (action && conversationId) {
          this.handleConversationAction(action, conversationId);
        }
      });
    });

    // Clear history button
    this.elements.conversationList.querySelector('.clear-history-btn')?.addEventListener('click', () => {
      this.showClearHistoryDialog();
    });
  }

  /**
   * Render settings panel
   */
  private renderSettingsPanel(): void {
    if (!this.currentState) return;

    const settings = this.currentState.settings;
    
    this.elements.settingsPanel.innerHTML = `
      <div class="settings-section">
        <h3>Appearance</h3>
        <div class="setting-item">
          <label for="theme-select">Theme</label>
          <select id="theme-select">
            <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>Light</option>
            <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>Dark</option>
            <option value="auto" ${settings.theme === 'auto' ? 'selected' : ''}>Auto</option>
          </select>
        </div>
        <div class="setting-item">
          <label for="font-size-select">Font Size</label>
          <select id="font-size-select">
            <option value="small" ${settings.fontSize === 'small' ? 'selected' : ''}>Small</option>
            <option value="medium" ${settings.fontSize === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="large" ${settings.fontSize === 'large' ? 'selected' : ''}>Large</option>
          </select>
        </div>
        <div class="setting-item">
          <label>
            <input type="checkbox" id="compact-mode" ${settings.compactMode ? 'checked' : ''}>
            Compact Mode
          </label>
        </div>
        <div class="setting-item">
          <label>
            <input type="checkbox" id="show-timestamps" ${settings.showTimestamps ? 'checked' : ''}>
            Show Timestamps
          </label>
        </div>
      </div>

      <div class="settings-section">
        <h3>Behavior</h3>
        <div class="setting-item">
          <label>
            <input type="checkbox" id="sound-enabled" ${settings.soundEnabled ? 'checked' : ''}>
            Sound Notifications
          </label>
        </div>
        <div class="setting-item">
          <label>
            <input type="checkbox" id="notifications-enabled" ${settings.notificationsEnabled ? 'checked' : ''}>
            Browser Notifications
          </label>
        </div>
        <div class="setting-item">
          <label>
            <input type="checkbox" id="auto-scroll" ${settings.autoScroll ? 'checked' : ''}>
            Auto Scroll to Bottom
          </label>
        </div>
      </div>

      <div class="settings-section">
        <h3>Data</h3>
        <div class="setting-item">
          <button class="settings-button" id="export-data">Export Conversations</button>
          <button class="settings-button" id="import-data">Import Conversations</button>
        </div>
        <div class="setting-item">
          <button class="settings-button" id="clear-data">Clear All Data</button>
        </div>
      </div>

      <div class="settings-section">
        <h3>About</h3>
        <div class="setting-item">
          <p>Browser AI Agent v1.0.0</p>
          <p>AI-powered browser automation and assistance</p>
        </div>
      </div>
    `;

    // Add event listeners for settings
    this.setupSettingsEventListeners();
  }

  /**
   * Setup settings event listeners
   */
  private setupSettingsEventListeners(): void {
    const settingsPanel = this.elements.settingsPanel;

    // Theme change
    settingsPanel.querySelector('#theme-select')?.addEventListener('change', (e) => {
      const theme = (e.target as HTMLSelectElement).value as 'light' | 'dark' | 'auto';
      this.chatManager.updateSettings({ theme });
    });

    // Font size change
    settingsPanel.querySelector('#font-size-select')?.addEventListener('change', (e) => {
      const fontSize = (e.target as HTMLSelectElement).value as 'small' | 'medium' | 'large';
      this.chatManager.updateSettings({ fontSize });
    });

    // Checkbox settings
    const checkboxSettings = [
      'compact-mode', 'show-timestamps', 'sound-enabled', 
      'notifications-enabled', 'auto-scroll'
    ];

    checkboxSettings.forEach(settingId => {
      settingsPanel.querySelector(`#${settingId}`)?.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        const settingKey = settingId.replace('-', '');
        
        // Convert kebab-case to camelCase
        const camelCaseKey = settingKey.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
        
        this.chatManager.updateSettings({ [camelCaseKey]: checked });
      });
    });

    // Data management buttons
    settingsPanel.querySelector('#export-data')?.addEventListener('click', () => {
      this.exportData();
    });

    settingsPanel.querySelector('#import-data')?.addEventListener('click', () => {
      this.importData();
    });

    settingsPanel.querySelector('#clear-data')?.addEventListener('click', () => {
      this.showClearDataDialog();
    });
  }

  /**
   * Handle input changes
   */
  private handleInputChange(): void {
    const value = this.elements.input.value;
    this.elements.sendButton.disabled = !value.trim();
    
    // Auto-resize textarea
    this.autoResizeInput();
    
    // Show/hide templates
    if (value.startsWith('/')) {
      this.showMessageTemplates(value.substring(1));
    } else {
      this.hideMessageTemplates();
    }
  }

  /**
   * Handle input keydown
   */
  private handleInputKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      this.showMessageTemplates();
    }
  }

  /**
   * Send message
   */
  private async sendMessage(): Promise<void> {
    const content = this.elements.input.value.trim();
    if (!content) return;

    this.elements.input.value = '';
    this.elements.sendButton.disabled = true;
    this.autoResizeInput();

    try {
      await this.chatManager.sendMessage(content, {
        includeContext: true
      });
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }

  /**
   * Auto-resize input textarea
   */
  private autoResizeInput(): void {
    const input = this.elements.input;
    input.style.height = 'auto';
    const newHeight = Math.min(input.scrollHeight, 120);
    input.style.height = newHeight + 'px';
    
    // Update UI state
    this.chatManager.updateUIState({ inputHeight: newHeight });
  }

  /**
   * Switch tab
   */
  private switchTab(tabName: string): void {
    // Update tab buttons
    this.container.querySelectorAll('.chat-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === tabName);
    });

    // Update tab content
    this.container.querySelectorAll('.chat-tab-content').forEach(content => {
      content.classList.toggle('active', content.getAttribute('data-tab') === tabName);
    });

    // Update UI state
    this.chatManager.updateUIState({ activeTab: tabName as any });
  }

  /**
   * Update typing indicator
   */
  private updateTypingIndicator(isTyping: boolean): void {
    this.elements.typingIndicator.style.display = isTyping ? 'flex' : 'none';
    
    if (isTyping) {
      this.scrollToBottom();
    }
  }

  /**
   * Update connection status
   */
  private updateConnectionStatus(isConnected: boolean): void {
    const statusElement = this.container.querySelector('#connectionStatus')!;
    const statusDot = statusElement.querySelector('.status-dot')!;
    const statusText = statusElement.querySelector('.status-text')!;

    statusElement.className = `connection-status ${isConnected ? 'connected' : 'disconnected'}`;
    statusText.textContent = isConnected ? 'Connected' : 'Disconnected';
  }

  /**
   * Update UI state
   */
  private updateUIState(uiState: any): void {
    // Apply theme
    if (this.currentState?.settings.theme) {
      this.container.setAttribute('data-theme', this.currentState.settings.theme);
    }

    // Apply font size
    if (this.currentState?.settings.fontSize) {
      this.container.setAttribute('data-font-size', this.currentState.settings.fontSize);
    }

    // Apply compact mode
    if (this.currentState?.settings.compactMode) {
      this.container.classList.toggle('compact-mode', this.currentState.settings.compactMode);
    }
  }

  /**
   * Scroll to bottom
   */
  private scrollToBottom(): void {
    const messagesScroll = this.elements.messagesContainer.querySelector('.messages-scroll')!;
    messagesScroll.scrollTop = messagesScroll.scrollHeight;
  }

  /**
   * Handle various UI actions
   */

  private toggleSearch(): void {
    const searchBar = this.container.querySelector('#searchBar')!;
    const isVisible = searchBar.style.display !== 'none';
    
    searchBar.style.display = isVisible ? 'none' : 'block';
    
    if (!isVisible) {
      this.elements.searchInput.focus();
    } else {
      this.elements.searchInput.value = '';
      this.handleSearch(); // Clear search results
    }
  }

  private handleSearch(): void {
    const query = this.elements.searchInput.value;
    if (query.trim()) {
      const results = this.chatManager.searchMessages(query);
      this.displaySearchResults(results);
    } else {
      this.clearSearchResults();
    }
  }

  private displaySearchResults(results: ChatMessage[]): void {
    // Implementation for displaying search results
    console.log('Search results:', results);
  }

  private clearSearchResults(): void {
    // Implementation for clearing search results
  }

  private async createNewConversation(): Promise<void> {
    await this.chatManager.createConversation();
    this.switchTab('chat');
  }

  private showMenu(): void {
    // Implementation for showing context menu
  }

  private showAttachmentMenu(): void {
    // Implementation for showing attachment menu
  }

  private showEmojiPicker(): void {
    // Implementation for showing emoji picker
  }

  private showMessageTemplates(filter?: string): void {
    const templates = this.chatManager.getMessageTemplates();
    const filteredTemplates = filter ? 
      templates.filter(t => t.name.toLowerCase().includes(filter.toLowerCase())) : 
      templates;

    const templatesContainer = this.container.querySelector('#messageTemplates')!;
    templatesContainer.style.display = 'block';
    
    templatesContainer.innerHTML = filteredTemplates.map(template => `
      <div class="template-item" data-template-id="${template.id}">
        <span class="template-icon">${template.icon}</span>
        <span class="template-name">${template.name}</span>
        <span class="template-category">${template.category}</span>
      </div>
    `).join('');

    // Add event listeners
    templatesContainer.querySelectorAll('.template-item').forEach(item => {
      item.addEventListener('click', () => {
        const templateId = item.getAttribute('data-template-id');
        const template = templates.find(t => t.id === templateId);
        if (template) {
          this.elements.input.value = template.content;
          this.hideMessageTemplates();
          this.elements.input.focus();
        }
      });
    });
  }

  private hideMessageTemplates(): void {
    const templatesContainer = this.container.querySelector('#messageTemplates')!;
    templatesContainer.style.display = 'none';
  }

  private handleChatAction(detail: any): void {
    // Handle chat action from message renderer
    console.log('Chat action:', detail);
  }

  private handleAutomationAction(detail: any): void {
    // Handle automation action
    console.log('Automation action:', detail);
  }

  private handleExtractionAction(detail: any): void {
    // Handle extraction action
    console.log('Extraction action:', detail);
  }

  private handleConversationAction(action: string, conversationId: string): void {
    switch (action) {
      case 'rename':
        this.renameConversation(conversationId);
        break;
      case 'archive':
        this.chatManager.archiveConversation(conversationId);
        break;
      case 'delete':
        this.deleteConversation(conversationId);
        break;
    }
  }

  private renameConversation(conversationId: string): void {
    const newTitle = prompt('Enter new conversation title:');
    if (newTitle) {
      // Implementation for renaming conversation
    }
  }

  private deleteConversation(conversationId: string): void {
    if (confirm('Are you sure you want to delete this conversation?')) {
      this.chatManager.deleteConversation(conversationId);
    }
  }

  private showClearHistoryDialog(): void {
    if (confirm('Are you sure you want to clear all conversation history?')) {
      // Implementation for clearing history
    }
  }

  private showClearDataDialog(): void {
    if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
      // Implementation for clearing all data
    }
  }

  private async exportData(): Promise<void> {
    try {
      const blob = await this.chatManager.messageStorage.backupToFile();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to export data: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  private importData(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          await this.chatManager.messageStorage.restoreFromFile(file);
          alert('Data imported successfully!');
          location.reload(); // Refresh to show imported data
        } catch (error) {
          alert('Failed to import data: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }
      }
    };
    input.click();
  }

  private handleEscapeKey(): void {
    // Close any open menus or dialogs
    this.hideMessageTemplates();
    
    const searchBar = this.container.querySelector('#searchBar')!;
    if (searchBar.style.display !== 'none') {
      this.toggleSearch();
    }
  }

  private handleResize(): void {
    // Handle container resize
    this.scrollToBottom();
  }

  private formatDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 24 * 60 * 60 * 1000) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 7 * 24 * 60 * 60 * 1000) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  }

  /**
   * Public API methods
   */

  public async sendUserMessage(message: string): Promise<void> {
    this.elements.input.value = message;
    await this.sendMessage();
  }

  public receiveAIMessage(message: string, metadata?: any): Promise<void> {
    return this.chatManager.receiveMessage(message, metadata);
  }

  public setConnectionStatus(connected: boolean): void {
    this.chatManager.setConnectionStatus(connected);
  }

  public showTyping(): void {
    this.chatManager.showTypingIndicator();
  }

  public hideTyping(): void {
    this.chatManager.hideTypingIndicator();
  }

  public getState(): ChatState | null {
    return this.currentState;
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    this.chatManager.destroy();
    this.removeAllListeners();
  }
}
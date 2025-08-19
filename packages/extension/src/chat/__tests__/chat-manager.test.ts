/**
 * Tests for Chat Manager
 */

import { ChatManager } from '../chat-manager';
import { ChatMessage } from '../types';

// Mock chrome storage
const mockStorage = {
  local: {
    get: jest.fn().mockResolvedValue({}),
    set: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    getBytesInUse: jest.fn().mockImplementation((keys, callback) => {
      callback(1024);
    }),
    QUOTA_BYTES: 5242880
  }
};

(global as any).chrome = {
  storage: mockStorage,
  runtime: {
    sendMessage: jest.fn().mockResolvedValue({ success: true }),
    lastError: null
  }
};

describe('ChatManager', () => {
  let chatManager: ChatManager;

  beforeEach(async () => {
    jest.clearAllMocks();
    chatManager = new ChatManager();
    await chatManager.initialize();
  });

  afterEach(() => {
    chatManager.destroy();
  });

  describe('Initialization', () => {
    it('should initialize with default state', () => {
      const state = chatManager.getState();
      
      expect(state.conversations).toHaveLength(1); // Default conversation
      expect(state.currentConversation).toBeTruthy();
      expect(state.isTyping).toBe(false);
      expect(state.isConnected).toBe(false);
      expect(state.unreadCount).toBe(0);
    });

    it('should create welcome message', () => {
      const state = chatManager.getState();
      const welcomeMessage = state.currentConversation?.messages[0];
      
      expect(welcomeMessage).toBeTruthy();
      expect(welcomeMessage?.type).toBe('ai');
      expect(welcomeMessage?.content).toContain('Hi! I\'m your AI assistant');
      expect(welcomeMessage?.metadata?.actions).toBeTruthy();
    });
  });

  describe('Message Handling', () => {
    it('should send user message', async () => {
      const message = await chatManager.sendMessage('Hello AI');
      
      expect(message.type).toBe('user');
      expect(message.content).toBe('Hello AI');
      expect(message.status).toBe('sending');
      
      const state = chatManager.getState();
      expect(state.currentConversation?.messages).toContain(message);
    });

    it('should receive AI message', async () => {
      const message = await chatManager.receiveMessage('Hello user!', {
        actions: [{ id: 'test', type: 'button', label: 'Test' }]
      });
      
      expect(message.type).toBe('ai');
      expect(message.content).toBe('Hello user!');
      expect(message.metadata?.actions).toBeTruthy();
      
      const state = chatManager.getState();
      expect(state.currentConversation?.messages).toContain(message);
    });

    it('should add system message', () => {
      const message = chatManager.addSystemMessage('System notification');
      
      expect(message.type).toBe('system');
      expect(message.content).toBe('System notification');
      
      const state = chatManager.getState();
      expect(state.currentConversation?.messages).toContain(message);
    });

    it('should delete message', async () => {
      const message = await chatManager.sendMessage('Test message');
      const messageId = message.id;
      
      await chatManager.deleteMessage(messageId);
      
      const state = chatManager.getState();
      const foundMessage = state.currentConversation?.messages.find(m => m.id === messageId);
      expect(foundMessage).toBeUndefined();
    });

    it('should edit user message', async () => {
      const message = await chatManager.sendMessage('Original message');
      const messageId = message.id;
      
      await chatManager.editMessage(messageId, 'Edited message');
      
      const state = chatManager.getState();
      const editedMessage = state.currentConversation?.messages.find(m => m.id === messageId);
      expect(editedMessage?.content).toBe('Edited message');
    });

    it('should react to message', async () => {
      const message = await chatManager.sendMessage('Test message');
      const messageId = message.id;
      
      await chatManager.reactToMessage(messageId, '👍');
      
      const state = chatManager.getState();
      const reactedMessage = state.currentConversation?.messages.find(m => m.id === messageId);
      expect(reactedMessage?.reactions).toEqual([{
        emoji: '👍',
        count: 1,
        users: ['user']
      }]);
    });
  });

  describe('Conversation Management', () => {
    it('should create new conversation', async () => {
      const conversation = await chatManager.createConversation('Test Conversation');
      
      expect(conversation.title).toBe('Test Conversation');
      expect(conversation.messages).toHaveLength(1); // Welcome message
      
      const state = chatManager.getState();
      expect(state.conversations).toContain(conversation);
      expect(state.currentConversation).toBe(conversation);
    });

    it('should switch conversation', async () => {
      const newConversation = await chatManager.createConversation('New Conversation');
      const originalConversation = chatManager.getState().conversations.find(c => c.id !== newConversation.id);
      
      if (originalConversation) {
        await chatManager.switchConversation(originalConversation.id);
        
        const state = chatManager.getState();
        expect(state.currentConversation).toBe(originalConversation);
      }
    });

    it('should delete conversation', async () => {
      const conversation = await chatManager.createConversation('To Delete');
      const conversationId = conversation.id;
      
      await chatManager.deleteConversation(conversationId);
      
      const state = chatManager.getState();
      const foundConversation = state.conversations.find(c => c.id === conversationId);
      expect(foundConversation).toBeUndefined();
    });

    it('should archive conversation', async () => {
      const conversation = await chatManager.createConversation('To Archive');
      const conversationId = conversation.id;
      
      await chatManager.archiveConversation(conversationId);
      
      const state = chatManager.getState();
      const archivedConversation = state.conversations.find(c => c.id === conversationId);
      expect(archivedConversation?.archived).toBe(true);
    });
  });

  describe('Search Functionality', () => {
    beforeEach(async () => {
      await chatManager.sendMessage('First test message');
      await chatManager.receiveMessage('AI response to first');
      await chatManager.sendMessage('Second message about cats');
      await chatManager.receiveMessage('AI response about cats');
    });

    it('should search messages by content', () => {
      const results = chatManager.searchMessages('test');
      
      expect(results).toHaveLength(1);
      expect(results[0].content).toContain('test');
    });

    it('should search messages case-insensitively', () => {
      const results = chatManager.searchMessages('CATS');
      
      expect(results).toHaveLength(2); // User message and AI response
      expect(results.some(m => m.content.toLowerCase().includes('cats'))).toBe(true);
    });

    it('should return empty array for no matches', () => {
      const results = chatManager.searchMessages('nonexistent');
      
      expect(results).toHaveLength(0);
    });
  });

  describe('Settings Management', () => {
    it('should update settings', async () => {
      await chatManager.updateSettings({
        theme: 'dark',
        fontSize: 'large',
        soundEnabled: false
      });
      
      const state = chatManager.getState();
      expect(state.settings.theme).toBe('dark');
      expect(state.settings.fontSize).toBe('large');
      expect(state.settings.soundEnabled).toBe(false);
    });

    it('should emit settings change event', async () => {
      const settingsChangedSpy = jest.fn();
      chatManager.on('settings_changed', settingsChangedSpy);
      
      await chatManager.updateSettings({ theme: 'dark' });
      
      expect(settingsChangedSpy).toHaveBeenCalledWith(
        expect.objectContaining({ theme: 'dark' })
      );
    });
  });

  describe('UI State Management', () => {
    it('should update UI state', () => {
      chatManager.updateUIState({
        isExpanded: true,
        activeTab: 'history',
        showEmojiPicker: true
      });
      
      const state = chatManager.getState();
      expect(state.ui.isExpanded).toBe(true);
      expect(state.ui.activeTab).toBe('history');
      expect(state.ui.showEmojiPicker).toBe(true);
    });
  });

  describe('Typing Indicator', () => {
    it('should show typing indicator', () => {
      chatManager.showTypingIndicator();
      
      const state = chatManager.getState();
      expect(state.isTyping).toBe(true);
    });

    it('should hide typing indicator', () => {
      chatManager.showTypingIndicator();
      chatManager.hideTypingIndicator();
      
      const state = chatManager.getState();
      expect(state.isTyping).toBe(false);
    });

    it('should auto-hide typing indicator after timeout', (done) => {
      jest.useFakeTimers();
      
      chatManager.showTypingIndicator();
      expect(chatManager.getState().isTyping).toBe(true);
      
      // Fast forward 30 seconds
      jest.advanceTimersByTime(30000);
      
      setTimeout(() => {
        expect(chatManager.getState().isTyping).toBe(false);
        jest.useRealTimers();
        done();
      }, 0);
    });
  });

  describe('Connection Status', () => {
    it('should set connection status', () => {
      chatManager.setConnectionStatus(true);
      
      const state = chatManager.getState();
      expect(state.isConnected).toBe(true);
    });

    it('should add system message when disconnected', () => {
      const initialMessageCount = chatManager.getState().currentConversation?.messages.length || 0;
      
      chatManager.setConnectionStatus(false);
      
      const state = chatManager.getState();
      expect(state.isConnected).toBe(false);
      expect(state.currentConversation?.messages.length).toBe(initialMessageCount + 1);
      
      const lastMessage = state.currentConversation?.messages[state.currentConversation.messages.length - 1];
      expect(lastMessage?.type).toBe('error');
      expect(lastMessage?.content).toContain('Connection lost');
    });
  });

  describe('Templates and Quick Actions', () => {
    it('should return message templates', () => {
      const templates = chatManager.getMessageTemplates();
      
      expect(templates).toHaveLength(6);
      expect(templates[0]).toMatchObject({
        id: 'analyze-page',
        name: 'Analyze Page',
        category: 'analysis'
      });
    });

    it('should return quick actions', () => {
      const actions = chatManager.getQuickActions();
      
      expect(actions).toHaveLength(4);
      expect(actions[0]).toMatchObject({
        id: 'analyze',
        label: 'Analyze',
        category: 'page'
      });
    });
  });

  describe('Export/Import', () => {
    beforeEach(async () => {
      await chatManager.sendMessage('Test message for export');
      await chatManager.receiveMessage('AI response for export');
    });

    it('should export conversation as JSON', () => {
      const conversationId = chatManager.getState().currentConversation?.id;
      if (conversationId) {
        const exported = chatManager.exportConversation(conversationId, 'json');
        const parsed = JSON.parse(exported);
        
        expect(parsed.id).toBe(conversationId);
        expect(parsed.messages).toBeTruthy();
        expect(Array.isArray(parsed.messages)).toBe(true);
      }
    });

    it('should export conversation as markdown', () => {
      const conversationId = chatManager.getState().currentConversation?.id;
      if (conversationId) {
        const exported = chatManager.exportConversation(conversationId, 'markdown');
        
        expect(exported).toContain('# New Conversation');
        expect(exported).toContain('## You');
        expect(exported).toContain('## AI Assistant');
        expect(exported).toContain('Test message for export');
      }
    });

    it('should export conversation as HTML', () => {
      const conversationId = chatManager.getState().currentConversation?.id;
      if (conversationId) {
        const exported = chatManager.exportConversation(conversationId, 'html');
        
        expect(exported).toContain('<!DOCTYPE html>');
        expect(exported).toContain('<title>New Conversation</title>');
        expect(exported).toContain('Test message for export');
      }
    });
  });

  describe('Event Emission', () => {
    it('should emit state change events', (done) => {
      chatManager.on('state_changed', (state) => {
        expect(state).toBeTruthy();
        expect(state.conversations).toBeTruthy();
        done();
      });
      
      chatManager.sendMessage('Trigger state change');
    });

    it('should emit scroll to bottom events', (done) => {
      chatManager.on('scroll_to_bottom', () => {
        done();
      });
      
      chatManager.receiveMessage('Message that should trigger scroll');
    });
  });
});
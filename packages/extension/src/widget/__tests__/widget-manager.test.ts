/**
 * Tests for Widget Manager
 */

import { WidgetManager } from '../widget-manager';

// Mock chrome APIs
const mockChrome = {
  runtime: {
    sendMessage: jest.fn()
  }
};

(global as any).chrome = mockChrome;

describe('WidgetManager', () => {
  let widgetManager: WidgetManager;
  let mockIframe: HTMLIFrameElement;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    
    // Mock iframe creation
    mockIframe = document.createElement('iframe');
    jest.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'iframe') {
        return mockIframe;
      }
      return document.createElement(tagName);
    });

    // Mock iframe content document
    const mockDoc = {
      open: jest.fn(),
      write: jest.fn(),
      close: jest.fn(),
      getElementById: jest.fn(() => ({
        style: { pointerEvents: '' }
      }))
    };
    
    Object.defineProperty(mockIframe, 'contentDocument', {
      value: mockDoc,
      writable: true
    });

    Object.defineProperty(mockIframe, 'contentWindow', {
      value: {
        postMessage: jest.fn()
      },
      writable: true
    });

    widgetManager = new WidgetManager();
    jest.clearAllMocks();
  });

  afterEach(() => {
    widgetManager.destroy();
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      // Mock iframe load event
      setTimeout(() => {
        mockIframe.onload?.({} as Event);
      }, 10);

      await widgetManager.initialize();
      
      expect(widgetManager.isReady()).toBe(true);
      expect(document.body.contains(mockIframe)).toBe(true);
    });

    it('should create iframe with correct attributes', async () => {
      setTimeout(() => {
        mockIframe.onload?.({} as Event);
      }, 10);

      await widgetManager.initialize();

      expect(mockIframe.id).toBe('ai-widget-frame');
      expect(mockIframe.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
      expect(mockIframe.getAttribute('title')).toBe('AI Assistant Widget');
    });

    it('should handle initialization errors', async () => {
      // Mock iframe error
      setTimeout(() => {
        mockIframe.onerror?.({} as Event);
      }, 10);

      await expect(widgetManager.initialize()).rejects.toThrow('Failed to load widget');
    });

    it('should not initialize twice', async () => {
      setTimeout(() => {
        mockIframe.onload?.({} as Event);
      }, 10);

      await widgetManager.initialize();
      const firstFrame = document.getElementById('ai-widget-frame');

      await widgetManager.initialize();
      const secondFrame = document.getElementById('ai-widget-frame');

      expect(firstFrame).toBe(secondFrame);
    });
  });

  describe('Communication', () => {
    beforeEach(async () => {
      setTimeout(() => {
        mockIframe.onload?.({} as Event);
      }, 10);
      await widgetManager.initialize();
    });

    it('should send messages to widget', () => {
      const message = { type: 'TEST_MESSAGE', data: 'test' };
      
      widgetManager.sendAIResponse('Hello from AI');

      expect(mockIframe.contentWindow?.postMessage).toHaveBeenCalledWith({
        type: 'AI_RESPONSE',
        content: 'Hello from AI',
        actions: undefined
      }, '*');
    });

    it('should handle chat messages', async () => {
      mockChrome.runtime.sendMessage.mockResolvedValue({ success: true });

      // Simulate message from widget
      const chatMessage = {
        type: 'AI_CHAT_MESSAGE',
        data: { message: 'Hello', includeContext: true }
      };

      // Access private method for testing
      const handleWidgetMessage = (widgetManager as any).handleWidgetMessage.bind(widgetManager);
      await handleWidgetMessage(chatMessage);

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'SEND_CHAT_MESSAGE',
        data: { message: 'Hello', includeContext: true }
      });
    });

    it('should handle connection check', async () => {
      mockChrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        data: { hasToken: true, wsConnected: true }
      });

      // Simulate connection check from widget
      const checkMessage = { type: 'AI_CHECK_CONNECTION' };
      
      const handleWidgetMessage = (widgetManager as any).handleWidgetMessage.bind(widgetManager);
      await handleWidgetMessage(checkMessage);

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'GET_SESSION'
      });

      expect(mockIframe.contentWindow?.postMessage).toHaveBeenCalledWith({
        type: 'CONNECTION_STATUS',
        payload: { connected: true }
      }, '*');
    });

    it('should handle automation execution', async () => {
      mockChrome.runtime.sendMessage.mockResolvedValue({ success: true });

      const automationMessage = {
        type: 'AI_EXECUTE_AUTOMATION',
        data: { action: 'click', selector: '#button' }
      };

      const handleWidgetMessage = (widgetManager as any).handleWidgetMessage.bind(widgetManager);
      await handleWidgetMessage(automationMessage);

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'EXECUTE_AUTOMATION',
        data: { action: 'click', selector: '#button' }
      });
    });
  });

  describe('Element Highlighting', () => {
    beforeEach(async () => {
      setTimeout(() => {
        mockIframe.onload?.({} as Event);
      }, 10);
      await widgetManager.initialize();
    });

    it('should highlight elements', () => {
      // Create test element
      const testElement = document.createElement('div');
      testElement.id = 'test-element';
      document.body.appendChild(testElement);

      const highlightMessage = {
        type: 'AI_HIGHLIGHT_ELEMENT',
        data: { selector: '#test-element' }
      };

      const handleWidgetMessage = (widgetManager as any).handleWidgetMessage.bind(widgetManager);
      handleWidgetMessage(highlightMessage);

      expect(testElement.classList.contains('ai-agent-highlight')).toBe(true);
    });

    it('should remove highlight after timeout', (done) => {
      jest.useFakeTimers();

      const testElement = document.createElement('div');
      testElement.id = 'test-element';
      document.body.appendChild(testElement);

      const highlightMessage = {
        type: 'AI_HIGHLIGHT_ELEMENT',
        data: { selector: '#test-element' }
      };

      const handleWidgetMessage = (widgetManager as any).handleWidgetMessage.bind(widgetManager);
      handleWidgetMessage(highlightMessage);

      expect(testElement.classList.contains('ai-agent-highlight')).toBe(true);

      // Fast forward 3 seconds
      jest.advanceTimersByTime(3000);

      setTimeout(() => {
        expect(testElement.classList.contains('ai-agent-highlight')).toBe(false);
        jest.useRealTimers();
        done();
      }, 0);
    });
  });

  describe('WebSocket Message Handling', () => {
    beforeEach(async () => {
      setTimeout(() => {
        mockIframe.onload?.({} as Event);
      }, 10);
      await widgetManager.initialize();
    });

    it('should handle AI response messages', () => {
      const wsMessage = {
        type: 'ai_response',
        payload: { message: 'AI response', actions: [] }
      };

      widgetManager.handleWebSocketMessage(wsMessage);

      expect(mockIframe.contentWindow?.postMessage).toHaveBeenCalledWith({
        type: 'AI_RESPONSE',
        content: 'AI response',
        actions: []
      }, '*');
    });

    it('should handle automation result messages', () => {
      const wsMessage = {
        type: 'automation_result',
        payload: { result: 'success' }
      };

      widgetManager.handleWebSocketMessage(wsMessage);

      expect(mockIframe.contentWindow?.postMessage).toHaveBeenCalledWith({
        type: 'AI_RESPONSE',
        content: 'Automation completed: success'
      }, '*');
    });

    it('should handle error messages', () => {
      const wsMessage = {
        type: 'error',
        payload: { error: 'Something went wrong' }
      };

      widgetManager.handleWebSocketMessage(wsMessage);

      expect(mockIframe.contentWindow?.postMessage).toHaveBeenCalledWith({
        type: 'AI_RESPONSE',
        content: 'Error: Something went wrong'
      }, '*');
    });
  });

  describe('Widget Control', () => {
    beforeEach(async () => {
      setTimeout(() => {
        mockIframe.onload?.({} as Event);
      }, 10);
      await widgetManager.initialize();
    });

    it('should show widget', () => {
      widgetManager.show();

      expect(mockIframe.contentWindow?.postMessage).toHaveBeenCalledWith({
        type: 'WIDGET_COMMAND',
        command: 'show'
      }, '*');
    });

    it('should hide widget', () => {
      widgetManager.hide();

      expect(mockIframe.contentWindow?.postMessage).toHaveBeenCalledWith({
        type: 'WIDGET_COMMAND',
        command: 'hide'
      }, '*');
    });

    it('should update connection status', () => {
      widgetManager.updateConnectionStatus(true);

      expect(mockIframe.contentWindow?.postMessage).toHaveBeenCalledWith({
        type: 'CONNECTION_STATUS',
        payload: { connected: true }
      }, '*');
    });
  });

  describe('Cleanup', () => {
    it('should destroy widget properly', async () => {
      setTimeout(() => {
        mockIframe.onload?.({} as Event);
      }, 10);

      await widgetManager.initialize();
      expect(widgetManager.isReady()).toBe(true);

      widgetManager.destroy();

      expect(widgetManager.isReady()).toBe(false);
      expect(document.body.contains(mockIframe)).toBe(false);
    });
  });
});
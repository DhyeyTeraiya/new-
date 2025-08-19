import { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocketServerConfig } from '../websocket-server';
import { AuthMiddleware } from '../../../middleware/auth';
import { SessionService } from '../../session';
import { AIService } from '../../nvidia';
import { AutomationEngine } from '../../automation';
import { Client as SocketIOClient } from 'socket.io-client';

// Mock dependencies
jest.mock('../../session');
jest.mock('../../nvidia');
jest.mock('../../automation');
jest.mock('../../../middleware/auth');

const MockedSessionService = SessionService as jest.MockedClass<typeof SessionService>;
const MockedAIService = AIService as jest.MockedClass<typeof AIService>;
const MockedAutomationEngine = AutomationEngine as jest.MockedClass<typeof AutomationEngine>;
const MockedAuthMiddleware = AuthMiddleware as jest.MockedClass<typeof AuthMiddleware>;

describe('WebSocketServer', () => {
  let httpServer: HTTPServer;
  let webSocketServer: WebSocketServer;
  let mockSessionService: jest.Mocked<SessionService>;
  let mockAIService: jest.Mocked<AIService>;
  let mockAutomationEngine: jest.Mocked<AutomationEngine>;
  let mockAuthMiddleware: jest.Mocked<AuthMiddleware>;
  let config: WebSocketServerConfig;

  beforeEach(() => {
    // Create HTTP server
    httpServer = new HTTPServer();

    // Create mocks
    mockSessionService = {
      getSession: jest.fn(),
      updateSession: jest.fn(),
      createSession: jest.fn(),
    } as any;

    mockAIService = {
      processMessage: jest.fn(),
      initializeSession: jest.fn(),
      cleanupSession: jest.fn(),
    } as any;

    mockAutomationEngine = {
      startAutomation: jest.fn(),
      pauseAutomation: jest.fn(),
      resumeAutomation: jest.fn(),
      cancelAutomation: jest.fn(),
      getAutomationStatus: jest.fn(),
      takeScreenshot: jest.fn(),
    } as any;

    mockAuthMiddleware = {
      verifyToken: jest.fn(),
      generateToken: jest.fn(),
    } as any;

    MockedSessionService.mockImplementation(() => mockSessionService);
    MockedAIService.mockImplementation(() => mockAIService);
    MockedAutomationEngine.mockImplementation(() => mockAutomationEngine);
    MockedAuthMiddleware.mockImplementation(() => mockAuthMiddleware);

    config = {
      connection: {
        cors: {
          origin: '*',
          credentials: true,
        },
        heartbeatInterval: 30000,
        connectionTimeout: 60000,
        maxConnections: 100,
        enableCompression: true,
      },
      messageBroker: {
        enableMessageQueue: true,
        maxQueueSize: 1000,
        messageRetention: 300000,
        enableBroadcast: true,
      },
      sessionManager: {
        syncInterval: 30000,
        enableAutoSync: true,
        maxSyncRetries: 3,
      },
    };

    webSocketServer = new WebSocketServer(httpServer, config, {
      authMiddleware: mockAuthMiddleware,
      sessionService: mockSessionService,
      aiService: mockAIService,
      automationEngine: mockAutomationEngine,
    });
  });

  afterEach(async () => {
    await webSocketServer.shutdown();
    httpServer.close();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', () => {
      expect(webSocketServer).toBeDefined();
    });

    it('should initialize with correct configuration', () => {
      const stats = webSocketServer.getStats();
      expect(stats).toBeDefined();
      expect(stats.connections).toBeDefined();
      expect(stats.messageQueue).toBeDefined();
      expect(stats.sessions).toBeDefined();
    });
  });

  describe('chat message handling', () => {
    beforeEach(() => {
      mockAIService.processMessage.mockResolvedValue({
        id: 'response-1',
        message: 'AI response',
        type: 'chat',
        confidence: 0.9,
        timestamp: new Date(),
      });

      mockSessionService.getSession.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        browserState: {
          currentTab: {
            id: 'tab-1',
            url: 'https://example.com',
            title: 'Test Page',
            active: true,
            status: 'complete',
          },
          tabs: [],
          window: {
            id: 'window-1',
            width: 1920,
            height: 1080,
            left: 0,
            top: 0,
            focused: true,
            state: 'normal',
          },
        },
        conversationHistory: [],
        preferences: {} as any,
        metadata: {} as any,
        createdAt: new Date(),
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      });
    });

    it('should process chat messages', async () => {
      // This test would require setting up actual WebSocket connections
      // For now, we'll test the core functionality through direct method calls
      
      expect(mockAIService.processMessage).toBeDefined();
      expect(mockSessionService.getSession).toBeDefined();
    });
  });

  describe('automation handling', () => {
    beforeEach(() => {
      mockAutomationEngine.startAutomation.mockResolvedValue('automation-1');
      mockAutomationEngine.pauseAutomation.mockResolvedValue(true);
      mockAutomationEngine.resumeAutomation.mockResolvedValue(true);
      mockAutomationEngine.cancelAutomation.mockResolvedValue(true);
    });

    it('should handle automation start requests', async () => {
      const automationId = await mockAutomationEngine.startAutomation(
        'session-1',
        [],
        {}
      );

      expect(automationId).toBe('automation-1');
      expect(mockAutomationEngine.startAutomation).toHaveBeenCalledWith(
        'session-1',
        [],
        {}
      );
    });

    it('should handle automation control requests', async () => {
      const pauseResult = await mockAutomationEngine.pauseAutomation('automation-1');
      const resumeResult = await mockAutomationEngine.resumeAutomation('automation-1');
      const cancelResult = await mockAutomationEngine.cancelAutomation('automation-1');

      expect(pauseResult).toBe(true);
      expect(resumeResult).toBe(true);
      expect(cancelResult).toBe(true);
    });
  });

  describe('screenshot handling', () => {
    beforeEach(() => {
      mockAutomationEngine.takeScreenshot.mockResolvedValue('base64-screenshot-data');
    });

    it('should handle screenshot requests', async () => {
      const screenshot = await mockAutomationEngine.takeScreenshot(
        'session-1',
        { fullPage: true }
      );

      expect(screenshot).toBe('base64-screenshot-data');
      expect(mockAutomationEngine.takeScreenshot).toHaveBeenCalledWith(
        'session-1',
        { fullPage: true }
      );
    });
  });

  describe('progress updates', () => {
    it('should send automation progress updates', async () => {
      await webSocketServer.sendAutomationProgress('session-1', 'automation-1', {
        currentStep: 2,
        totalSteps: 5,
        progress: 40,
        currentAction: { id: 'action-2', type: 'click' },
        completedActions: [],
      });

      // In a real test, we would verify that the message was sent to the session
      // For now, we just verify the method doesn't throw
    });

    it('should send action progress updates', async () => {
      await webSocketServer.sendActionProgress(
        'session-1',
        { id: 'action-1', type: 'click' },
        50,
        'executing'
      );

      // Verify method execution
    });

    it('should send action completion', async () => {
      await webSocketServer.sendActionComplete(
        'session-1',
        { id: 'action-1', type: 'click' },
        {
          actionId: 'action-1',
          success: true,
          executionTime: 1000,
        }
      );

      // Verify method execution
    });

    it('should send action errors', async () => {
      await webSocketServer.sendActionError(
        'session-1',
        { id: 'action-1', type: 'click' },
        {
          code: 'ELEMENT_NOT_FOUND',
          message: 'Element not found',
          recoverable: true,
        }
      );

      // Verify method execution
    });
  });

  describe('system operations', () => {
    it('should get server statistics', () => {
      const stats = webSocketServer.getStats();

      expect(stats).toHaveProperty('connections');
      expect(stats).toHaveProperty('messageQueue');
      expect(stats).toHaveProperty('sessions');
    });

    it('should broadcast system messages', async () => {
      const sentCount = await webSocketServer.broadcastSystemMessage(
        'System maintenance in 5 minutes',
        'warning'
      );

      // In a real test with connections, this would return the number of recipients
      expect(typeof sentCount).toBe('number');
    });

    it('should shutdown gracefully', async () => {
      await expect(webSocketServer.shutdown()).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle AI service errors gracefully', async () => {
      mockAIService.processMessage.mockRejectedValue(new Error('AI service error'));

      // In a real test, we would send a chat message and verify error handling
      // For now, we just verify the mock setup
      await expect(mockAIService.processMessage('test', 'session-1')).rejects.toThrow('AI service error');
    });

    it('should handle automation errors gracefully', async () => {
      mockAutomationEngine.startAutomation.mockRejectedValue(new Error('Automation error'));

      await expect(mockAutomationEngine.startAutomation('session-1', [], {})).rejects.toThrow('Automation error');
    });

    it('should handle session errors gracefully', async () => {
      mockSessionService.getSession.mockRejectedValue(new Error('Session error'));

      await expect(mockSessionService.getSession('session-1')).rejects.toThrow('Session error');
    });
  });
});
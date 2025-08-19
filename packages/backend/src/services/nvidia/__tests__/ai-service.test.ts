import { AIService, AIServiceConfig } from '../ai-service';
import { NVIDIAClient } from '../nvidia-client';
import { PageContext, UserSession } from '@browser-ai-agent/shared';

// Mock the NVIDIA client
jest.mock('../nvidia-client');
const MockedNVIDIAClient = NVIDIAClient as jest.MockedClass<typeof NVIDIAClient>;

describe('AIService', () => {
  let aiService: AIService;
  let mockNVIDIAClient: jest.Mocked<NVIDIAClient>;
  let config: AIServiceConfig;

  beforeEach(() => {
    config = {
      nvidia: {
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        models: {
          primary: { name: 'meta/llama-3.3-70b-instruct', apiKey: 'test-key-1' },
          vision: { name: 'meta/llama-3.2-90b-vision-instruct', apiKey: 'test-key-2' },
          complex: { name: 'meta/llama-3.1-405B-instruct', apiKey: 'test-key-3' },
        },
        timeout: 30000,
        maxRetries: 3,
        retryDelay: 1000,
      },
      maxContextLength: 50,
      enableCaching: true,
      cacheTimeout: 300000,
    };

    // Create mock NVIDIA client
    mockNVIDIAClient = {
      sendPrimaryRequest: jest.fn(),
      sendVisionRequest: jest.fn(),
      sendComplexRequest: jest.fn(),
      getModelInfo: jest.fn().mockReturnValue({
        primary: { name: 'meta/llama-3.3-70b-instruct', hasApiKey: true },
        vision: { name: 'meta/llama-3.2-90b-vision-instruct', hasApiKey: true },
        complex: { name: 'meta/llama-3.1-405B-instruct', hasApiKey: true },
      }),
      healthCheck: jest.fn().mockResolvedValue({
        primary: true,
        vision: true,
        complex: true,
      }),
    } as any;

    MockedNVIDIAClient.mockImplementation(() => mockNVIDIAClient);

    aiService = new AIService(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', () => {
      expect(MockedNVIDIAClient).toHaveBeenCalledWith(config.nvidia);
      expect(aiService).toBeDefined();
    });
  });

  describe('processMessage', () => {
    const mockSession: UserSession = {
      id: 'test-session-id',
      userId: 'test-user-id',
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
      preferences: {
        theme: 'light',
        language: 'en',
        automation: {
          autoConfirmLowRisk: false,
          showActionPreviews: true,
          defaultTimeout: 5000,
          takeScreenshots: true,
          highlightElements: true,
        },
        privacy: {
          storeHistory: true,
          shareAnalytics: false,
          dataRetentionDays: 30,
        },
        notifications: {
          desktop: true,
          browser: true,
          actionCompletion: true,
          errors: true,
        },
        ai: {
          responseStyle: 'conversational',
          explainActions: true,
          confidenceThreshold: 0.7,
          modelPreferences: {
            chat: 'primary',
            reasoning: 'complex',
            vision: 'vision',
            fast: 'primary',
          },
        },
      },
      metadata: {
        source: 'extension',
        userAgent: 'test-agent',
        ipAddress: '127.0.0.1',
        device: {
          type: 'desktop',
          os: 'Windows',
          browser: 'Chrome',
          browserVersion: '120.0.0',
          screenResolution: '1920x1080',
        },
      },
      createdAt: new Date(),
      lastActivity: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
    };

    const mockPageContext: PageContext = {
      url: 'https://example.com',
      title: 'Test Page',
      content: 'This is test page content',
      elements: [
        {
          id: 'button-1',
          tagName: 'button',
          selector: '#submit-btn',
          xpath: '//button[@id="submit-btn"]',
          text: 'Submit',
          attributes: { id: 'submit-btn', class: 'btn btn-primary' },
          bounds: { x: 100, y: 200, width: 80, height: 30 },
          visible: true,
          interactive: true,
        },
      ],
      viewport: {
        width: 1920,
        height: 1080,
        scrollX: 0,
        scrollY: 0,
        devicePixelRatio: 1,
      },
      metadata: {
        loadingState: 'complete',
        hasForms: false,
        hasInteractiveElements: true,
      },
      timestamp: new Date(),
    };

    beforeEach(() => {
      aiService.initializeSession(mockSession);
    });

    it('should process a simple click command', async () => {
      const mockNVIDIAResponse = {
        id: 'response-1',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant' as const,
              content: 'I\'ll click the submit button for you.',
            },
            finish_reason: 'stop' as const,
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 10,
          total_tokens: 60,
        },
        model: 'meta/llama-3.3-70b-instruct',
        created: Date.now(),
      };

      mockNVIDIAClient.sendPrimaryRequest.mockResolvedValue(mockNVIDIAResponse);

      const response = await aiService.processMessage(
        'Click the submit button',
        mockSession.id,
        mockPageContext,
        'command'
      );

      expect(response).toMatchObject({
        message: expect.stringContaining('click'),
        type: 'action_plan',
        confidence: expect.any(Number),
        actions: expect.any(Array),
      });

      expect(mockNVIDIAClient.sendPrimaryRequest).toHaveBeenCalled();
    });

    it('should handle navigation commands', async () => {
      const mockNVIDIAResponse = {
        id: 'response-2',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant' as const,
              content: 'I\'ll navigate to the specified URL.',
            },
            finish_reason: 'stop' as const,
          },
        ],
        usage: { prompt_tokens: 30, completion_tokens: 8, total_tokens: 38 },
        model: 'meta/llama-3.3-70b-instruct',
        created: Date.now(),
      };

      mockNVIDIAClient.sendPrimaryRequest.mockResolvedValue(mockNVIDIAResponse);

      const response = await aiService.processMessage(
        'Go to https://google.com',
        mockSession.id,
        mockPageContext,
        'command'
      );

      expect(response.type).toBe('action_plan');
      expect(response.actions).toBeDefined();
      expect(response.actions?.length).toBeGreaterThan(0);
    });

    it('should handle analysis requests', async () => {
      const mockNVIDIAResponse = {
        id: 'response-3',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant' as const,
              content: 'This page appears to be a test page with a submit button.',
            },
            finish_reason: 'stop' as const,
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
        model: 'meta/llama-3.1-405B-instruct',
        created: Date.now(),
      };

      mockNVIDIAClient.sendComplexRequest.mockResolvedValue(mockNVIDIAResponse);

      const response = await aiService.processMessage(
        'Analyze this page',
        mockSession.id,
        mockPageContext,
        'command'
      );

      expect(response.type).toBe('analysis');
      expect(response.message).toContain('page');
    });

    it('should handle errors gracefully', async () => {
      mockNVIDIAClient.sendPrimaryRequest.mockRejectedValue(
        new Error('API request failed')
      );

      const response = await aiService.processMessage(
        'Click something',
        mockSession.id,
        mockPageContext,
        'command'
      );

      expect(response.type).toBe('error');
      expect(response.message).toContain('error');
      expect(response.confidence).toBe(0);
    });

    it('should use caching when enabled', async () => {
      const mockNVIDIAResponse = {
        id: 'response-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant' as const,
              content: 'Cached response',
            },
            finish_reason: 'stop' as const,
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
        model: 'meta/llama-3.3-70b-instruct',
        created: Date.now(),
      };

      mockNVIDIAClient.sendPrimaryRequest.mockResolvedValue(mockNVIDIAResponse);

      // First request
      const response1 = await aiService.processMessage(
        'Hello',
        mockSession.id,
        mockPageContext,
        'command'
      );

      // Second identical request should use cache
      const response2 = await aiService.processMessage(
        'Hello',
        mockSession.id,
        mockPageContext,
        'command'
      );

      expect(mockNVIDIAClient.sendPrimaryRequest).toHaveBeenCalledTimes(1);
      expect(response2.metadata?.cached).toBe(true);
    });
  });

  describe('analyzePageVisually', () => {
    it('should analyze page using vision model', async () => {
      const mockVisionResponse = {
        id: 'vision-response-1',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant' as const,
              content: 'I can see a webpage with a submit button in the center.',
            },
            finish_reason: 'stop' as const,
          },
        ],
        usage: { prompt_tokens: 200, completion_tokens: 15, total_tokens: 215 },
        model: 'meta/llama-3.2-90b-vision-instruct',
        created: Date.now(),
      };

      mockNVIDIAClient.sendVisionRequest.mockResolvedValue(mockVisionResponse);

      const response = await aiService.analyzePageVisually(
        'test-session-id',
        'base64-screenshot-data',
        'What do you see on this page?'
      );

      expect(response.type).toBe('analysis');
      expect(response.message).toContain('webpage');
      expect(response.metadata?.hasScreenshot).toBe(true);
      expect(mockNVIDIAClient.sendVisionRequest).toHaveBeenCalled();
    });
  });

  describe('generateActionPlan', () => {
    it('should generate complex action plan', async () => {
      const mockComplexResponse = {
        id: 'complex-response-1',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant' as const,
              content: 'Here is a detailed action plan: 1. Navigate to login page 2. Fill credentials 3. Submit form',
            },
            finish_reason: 'stop' as const,
          },
        ],
        usage: { prompt_tokens: 150, completion_tokens: 30, total_tokens: 180 },
        model: 'meta/llama-3.1-405B-instruct',
        created: Date.now(),
      };

      mockNVIDIAClient.sendComplexRequest.mockResolvedValue(mockComplexResponse);

      const response = await aiService.generateActionPlan(
        'test-session-id',
        'Login to the website with my credentials'
      );

      expect(response.type).toBe('action_plan');
      expect(response.message).toContain('action plan');
      expect(mockNVIDIAClient.sendComplexRequest).toHaveBeenCalled();
    });
  });

  describe('getHealthStatus', () => {
    it('should return healthy status when all models are working', async () => {
      const health = await aiService.getHealthStatus();

      expect(health.status).toBe('healthy');
      expect(health.models).toEqual({
        primary: true,
        vision: true,
        complex: true,
      });
    });

    it('should return degraded status when some models fail', async () => {
      mockNVIDIAClient.healthCheck.mockResolvedValue({
        primary: true,
        vision: false,
        complex: true,
      });

      const health = await aiService.getHealthStatus();

      expect(health.status).toBe('degraded');
      expect(health.models.vision).toBe(false);
    });

    it('should return unhealthy status when all models fail', async () => {
      mockNVIDIAClient.healthCheck.mockResolvedValue({
        primary: false,
        vision: false,
        complex: false,
      });

      const health = await aiService.getHealthStatus();

      expect(health.status).toBe('unhealthy');
    });
  });

  describe('session management', () => {
    it('should initialize and cleanup sessions', () => {
      const mockSession: UserSession = {
        id: 'cleanup-test-session',
        userId: 'test-user',
        browserState: {
          currentTab: {
            id: 'tab-1',
            url: 'https://example.com',
            title: 'Test',
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
        expiresAt: new Date(),
      };

      // Should not throw
      aiService.initializeSession(mockSession);
      aiService.cleanupSession(mockSession.id);
    });
  });
});
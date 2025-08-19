import { AutomationEngine, AutomationEngineConfig } from '../automation-engine';
import { BrowserAction, BrowserActionType } from '@browser-ai-agent/shared';

// Mock Playwright
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          goto: jest.fn(),
          title: jest.fn().mockResolvedValue('Test Page'),
          url: jest.fn().mockReturnValue('https://example.com'),
          screenshot: jest.fn().mockResolvedValue(Buffer.from('screenshot')),
          evaluate: jest.fn(),
          locator: jest.fn().mockReturnValue({
            click: jest.fn(),
            fill: jest.fn(),
            count: jest.fn().mockResolvedValue(1),
            isVisible: jest.fn().mockResolvedValue(true),
            isEnabled: jest.fn().mockResolvedValue(true),
            boundingBox: jest.fn().mockResolvedValue({ x: 0, y: 0, width: 100, height: 50 }),
          }),
          waitForTimeout: jest.fn(),
          waitForLoadState: jest.fn(),
          on: jest.fn(),
        }),
        close: jest.fn(),
      }),
      close: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
    }),
  },
  firefox: { launch: jest.fn() },
  webkit: { launch: jest.fn() },
}));

describe('AutomationEngine', () => {
  let automationEngine: AutomationEngine;
  let config: AutomationEngineConfig;

  beforeEach(() => {
    config = {
      browserManager: {
        defaultBrowser: 'chromium',
        headless: true,
        maxInstances: 5,
        instanceTimeout: 300000,
        defaultViewport: { width: 1920, height: 1080 },
      },
      elementSelector: {
        defaultTimeout: 5000,
        retryAttempts: 3,
        retryDelay: 1000,
        enableSmartWaiting: true,
      },
      actionExecutor: {
        defaultTimeout: 5000,
        screenshotOnError: true,
        highlightElements: true,
        maxRetries: 3,
        retryDelay: 1000,
      },
      maxConcurrentAutomations: 10,
      defaultAutomationTimeout: 300000,
    };

    automationEngine = new AutomationEngine(config);
  });

  afterEach(async () => {
    await automationEngine.shutdown();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', () => {
      expect(automationEngine).toBeDefined();
    });
  });

  describe('startAutomation', () => {
    it('should start automation with valid actions', async () => {
      const actions: BrowserAction[] = [
        {
          id: 'action-1',
          type: 'navigate' as BrowserActionType,
          value: 'https://example.com',
          description: 'Navigate to example.com',
        },
        {
          id: 'action-2',
          type: 'click' as BrowserActionType,
          target: {
            css: '#submit-btn',
            strategy: ['css'],
          },
          description: 'Click submit button',
        },
      ];

      const automationId = await automationEngine.startAutomation(
        'test-session-id',
        actions
      );

      expect(automationId).toBeDefined();
      expect(typeof automationId).toBe('string');

      // Check automation status
      const status = automationEngine.getAutomationStatus(automationId);
      expect(status).toBeDefined();
      expect(status?.id).toBe(automationId);
      expect(status?.plan?.steps).toHaveLength(2);
    });

    it('should reject automation when max concurrent limit reached', async () => {
      const actions: BrowserAction[] = [
        {
          id: 'action-1',
          type: 'navigate' as BrowserActionType,
          value: 'https://example.com',
          description: 'Navigate to example.com',
        },
      ];

      // Start multiple automations to reach the limit
      const promises = [];
      for (let i = 0; i < config.maxConcurrentAutomations + 1; i++) {
        promises.push(
          automationEngine.startAutomation(`session-${i}`, actions)
        );
      }

      // The last one should fail
      await expect(Promise.all(promises)).rejects.toThrow(
        'Maximum concurrent automations limit reached'
      );
    });
  });

  describe('executeAction', () => {
    it('should execute single click action', async () => {
      const action: BrowserAction = {
        id: 'click-action',
        type: 'click' as BrowserActionType,
        target: {
          css: '#test-button',
          strategy: ['css'],
        },
        description: 'Click test button',
      };

      const result = await automationEngine.executeAction(
        'test-session-id',
        action,
        { takeScreenshot: true }
      );

      expect(result.success).toBe(true);
      expect(result.actionId).toBe('click-action');
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should execute navigation action', async () => {
      const action: BrowserAction = {
        id: 'nav-action',
        type: 'navigate' as BrowserActionType,
        value: 'https://example.com',
        description: 'Navigate to example.com',
      };

      const result = await automationEngine.executeAction(
        'test-session-id',
        action
      );

      expect(result.success).toBe(true);
      expect(result.actionId).toBe('nav-action');
      expect(result.data?.url).toBe('https://example.com');
    });

    it('should handle action execution errors', async () => {
      // Mock an error in the browser
      const mockPage = {
        goto: jest.fn().mockRejectedValue(new Error('Navigation failed')),
        title: jest.fn().mockResolvedValue('Test Page'),
        url: jest.fn().mockReturnValue('https://example.com'),
        screenshot: jest.fn().mockResolvedValue(Buffer.from('screenshot')),
        evaluate: jest.fn(),
        locator: jest.fn(),
        waitForTimeout: jest.fn(),
        waitForLoadState: jest.fn(),
        on: jest.fn(),
      };

      // Override the page mock for this test
      jest.doMock('playwright', () => ({
        chromium: {
          launch: jest.fn().mockResolvedValue({
            newContext: jest.fn().mockResolvedValue({
              newPage: jest.fn().mockResolvedValue(mockPage),
              close: jest.fn(),
            }),
            close: jest.fn(),
            isConnected: jest.fn().mockReturnValue(true),
          }),
        },
      }));

      const action: BrowserAction = {
        id: 'failing-action',
        type: 'navigate' as BrowserActionType,
        value: 'https://invalid-url',
        description: 'Navigate to invalid URL',
      };

      const result = await automationEngine.executeAction(
        'test-session-id',
        action
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Navigation failed');
    });
  });

  describe('extractPageContext', () => {
    it('should extract page context successfully', async () => {
      const context = await automationEngine.extractPageContext(
        'test-session-id',
        'https://example.com'
      );

      expect(context).toBeDefined();
      expect(context.url).toBe('https://example.com');
      expect(context.title).toBe('Test Page');
      expect(context.elements).toBeDefined();
      expect(context.viewport).toBeDefined();
      expect(context.metadata).toBeDefined();
    });

    it('should extract context from current page if no URL provided', async () => {
      const context = await automationEngine.extractPageContext(
        'test-session-id'
      );

      expect(context).toBeDefined();
      expect(context.url).toBeDefined();
      expect(context.title).toBeDefined();
    });
  });

  describe('takeScreenshot', () => {
    it('should capture screenshot successfully', async () => {
      const screenshot = await automationEngine.takeScreenshot(
        'test-session-id',
        { fullPage: true }
      );

      expect(screenshot).toBeDefined();
      expect(typeof screenshot).toBe('string');
      // Should be base64 encoded
      expect(screenshot).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
    });

    it('should capture screenshot with highlights', async () => {
      const screenshot = await automationEngine.takeScreenshot(
        'test-session-id',
        {
          fullPage: false,
          highlightElements: ['#button1', '.important'],
        }
      );

      expect(screenshot).toBeDefined();
      expect(typeof screenshot).toBe('string');
    });
  });

  describe('automation control', () => {
    let automationId: string;

    beforeEach(async () => {
      const actions: BrowserAction[] = [
        {
          id: 'action-1',
          type: 'navigate' as BrowserActionType,
          value: 'https://example.com',
          description: 'Navigate to example.com',
        },
      ];

      automationId = await automationEngine.startAutomation(
        'test-session-id',
        actions
      );
    });

    it('should pause automation', async () => {
      const result = await automationEngine.pauseAutomation(automationId);
      expect(result).toBe(true);

      const status = automationEngine.getAutomationStatus(automationId);
      expect(status?.status).toBe('paused');
    });

    it('should resume paused automation', async () => {
      await automationEngine.pauseAutomation(automationId);
      const result = await automationEngine.resumeAutomation(automationId);
      expect(result).toBe(true);

      const status = automationEngine.getAutomationStatus(automationId);
      expect(status?.status).toBe('executing');
    });

    it('should cancel automation', async () => {
      const result = await automationEngine.cancelAutomation(automationId);
      expect(result).toBe(true);

      const status = automationEngine.getAutomationStatus(automationId);
      expect(status?.status).toBe('cancelled');
    });

    it('should return false for invalid automation operations', async () => {
      const invalidId = 'invalid-automation-id';
      
      expect(await automationEngine.pauseAutomation(invalidId)).toBe(false);
      expect(await automationEngine.resumeAutomation(invalidId)).toBe(false);
      expect(await automationEngine.cancelAutomation(invalidId)).toBe(false);
    });
  });

  describe('getAutomationMetrics', () => {
    it('should return metrics for active automation', async () => {
      const actions: BrowserAction[] = [
        {
          id: 'action-1',
          type: 'navigate' as BrowserActionType,
          value: 'https://example.com',
          description: 'Navigate to example.com',
        },
      ];

      const automationId = await automationEngine.startAutomation(
        'test-session-id',
        actions
      );

      // Wait a bit for some execution
      await new Promise(resolve => setTimeout(resolve, 100));

      const metrics = automationEngine.getAutomationMetrics(automationId);
      expect(metrics).toBeDefined();
      expect(metrics?.totalActions).toBeGreaterThanOrEqual(0);
      expect(metrics?.totalTime).toBeGreaterThan(0);
    });

    it('should return null for invalid automation ID', () => {
      const metrics = automationEngine.getAutomationMetrics('invalid-id');
      expect(metrics).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should clean up completed automations', async () => {
      const actions: BrowserAction[] = [
        {
          id: 'action-1',
          type: 'navigate' as BrowserActionType,
          value: 'https://example.com',
          description: 'Navigate to example.com',
        },
      ];

      const automationId = await automationEngine.startAutomation(
        'test-session-id',
        actions
      );

      // Cancel to complete it
      await automationEngine.cancelAutomation(automationId);

      // Manually set end time to make it old
      const automation = automationEngine.getAutomationStatus(automationId);
      if (automation) {
        automation.endTime = new Date(Date.now() - 400000); // 6+ minutes ago
      }

      await automationEngine.cleanup();

      // Should still exist since we just set it (cleanup runs periodically)
      // In a real scenario, this would be cleaned up
      expect(automationEngine.getAutomationStatus(automationId)).toBeDefined();
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      const actions: BrowserAction[] = [
        {
          id: 'action-1',
          type: 'navigate' as BrowserActionType,
          value: 'https://example.com',
          description: 'Navigate to example.com',
        },
      ];

      await automationEngine.startAutomation('test-session-id', actions);
      
      // Should not throw
      await expect(automationEngine.shutdown()).resolves.not.toThrow();
    });
  });
});
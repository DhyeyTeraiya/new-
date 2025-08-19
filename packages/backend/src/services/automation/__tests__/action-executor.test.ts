import { ActionExecutor, ActionExecutorConfig } from '../action-executor';
import { ElementSelectorService } from '../element-selector';
import { ScreenshotCapture } from '../screenshot-capture';
import { BrowserAction, BrowserActionType } from '@browser-ai-agent/shared';

// Mock dependencies
jest.mock('../element-selector');
jest.mock('../screenshot-capture');

const MockedElementSelector = ElementSelectorService as jest.MockedClass<typeof ElementSelectorService>;
const MockedScreenshotCapture = ScreenshotCapture as jest.MockedClass<typeof ScreenshotCapture>;

describe('ActionExecutor', () => {
  let actionExecutor: ActionExecutor;
  let mockElementSelector: jest.Mocked<ElementSelectorService>;
  let mockScreenshotCapture: jest.Mocked<ScreenshotCapture>;
  let mockPage: any;
  let config: ActionExecutorConfig;

  beforeEach(() => {
    config = {
      defaultTimeout: 5000,
      screenshotOnError: true,
      highlightElements: true,
      maxRetries: 3,
      retryDelay: 1000,
    };

    // Mock page object
    mockPage = {
      goto: jest.fn().mockResolvedValue(undefined),
      title: jest.fn().mockResolvedValue('Test Page'),
      url: jest.fn().mockReturnValue('https://example.com'),
      reload: jest.fn().mockResolvedValue(undefined),
      goBack: jest.fn().mockResolvedValue(undefined),
      goForward: jest.fn().mockResolvedValue(undefined),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      waitForLoadState: jest.fn().mockResolvedValue(undefined),
      mouse: {
        wheel: jest.fn().mockResolvedValue(undefined),
      },
      keyboard: {
        press: jest.fn().mockResolvedValue(undefined),
      },
      evaluate: jest.fn().mockResolvedValue(undefined),
      locator: jest.fn().mockReturnValue({
        click: jest.fn().mockResolvedValue(undefined),
        fill: jest.fn().mockResolvedValue(undefined),
        clear: jest.fn().mockResolvedValue(undefined),
        selectOption: jest.fn().mockResolvedValue(undefined),
        hover: jest.fn().mockResolvedValue(undefined),
        dispatchEvent: jest.fn().mockResolvedValue(undefined),
        scrollIntoViewIfNeeded: jest.fn().mockResolvedValue(undefined),
        boundingBox: jest.fn().mockResolvedValue({ x: 100, y: 200, width: 80, height: 30 }),
        evaluate: jest.fn().mockResolvedValue(undefined),
        count: jest.fn().mockResolvedValue(1),
        first: jest.fn().mockReturnThis(),
      }),
    };

    // Mock element selector
    mockElementSelector = {
      waitForElement: jest.fn().mockResolvedValue(mockPage.locator()),
      findElement: jest.fn().mockResolvedValue(mockPage.locator()),
      getElementInfo: jest.fn().mockResolvedValue({
        id: 'test-element',
        tagName: 'button',
        selector: '#test-button',
        xpath: '//button[@id="test-button"]',
        text: 'Test Button',
        attributes: { id: 'test-button' },
        bounds: { x: 100, y: 200, width: 80, height: 30 },
        visible: true,
        interactive: true,
      }),
    } as any;

    // Mock screenshot capture
    mockScreenshotCapture = {
      captureScreenshot: jest.fn().mockResolvedValue('base64-screenshot-data'),
    } as any;

    MockedElementSelector.mockImplementation(() => mockElementSelector);
    MockedScreenshotCapture.mockImplementation(() => mockScreenshotCapture);

    actionExecutor = new ActionExecutor(
      config,
      mockElementSelector,
      mockScreenshotCapture
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executeAction', () => {
    it('should execute click action successfully', async () => {
      const action: BrowserAction = {
        id: 'click-test',
        type: 'click' as BrowserActionType,
        target: {
          css: '#test-button',
          strategy: ['css'],
        },
        description: 'Click test button',
        options: {
          highlight: true,
          timeout: 5000,
        },
      };

      const result = await actionExecutor.executeAction(mockPage, action);

      expect(result.success).toBe(true);
      expect(result.actionId).toBe('click-test');
      expect(result.executionTime).toBeGreaterThan(0);
      expect(mockElementSelector.waitForElement).toHaveBeenCalledWith(
        mockPage,
        action.target,
        expect.objectContaining({
          visible: true,
          enabled: true,
          timeout: 5000,
        })
      );
    });

    it('should execute type action successfully', async () => {
      const action: BrowserAction = {
        id: 'type-test',
        type: 'type' as BrowserActionType,
        target: {
          css: '#input-field',
          strategy: ['css'],
        },
        value: 'Hello World',
        description: 'Type in input field',
      };

      const result = await actionExecutor.executeAction(mockPage, action);

      expect(result.success).toBe(true);
      expect(result.actionId).toBe('type-test');
      expect(result.data?.typedValue).toBe('Hello World');
      
      const mockElement = mockPage.locator();
      expect(mockElement.clear).toHaveBeenCalled();
      expect(mockElement.fill).toHaveBeenCalledWith('Hello World');
      expect(mockElement.dispatchEvent).toHaveBeenCalledWith('change');
    });

    it('should execute navigate action successfully', async () => {
      const action: BrowserAction = {
        id: 'nav-test',
        type: 'navigate' as BrowserActionType,
        value: 'https://example.com',
        description: 'Navigate to example.com',
      };

      const result = await actionExecutor.executeAction(mockPage, action);

      expect(result.success).toBe(true);
      expect(result.actionId).toBe('nav-test');
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          timeout: expect.any(Number),
          waitUntil: 'domcontentloaded',
        })
      );
    });

    it('should execute scroll action successfully', async () => {
      const action: BrowserAction = {
        id: 'scroll-test',
        type: 'scroll' as BrowserActionType,
        value: 'down',
        description: 'Scroll down',
      };

      const result = await actionExecutor.executeAction(mockPage, action);

      expect(result.success).toBe(true);
      expect(result.actionId).toBe('scroll-test');
      expect(result.data?.scrollDirection).toBe('down');
      expect(mockPage.mouse.wheel).toHaveBeenCalledWith(0, 500);
    });

    it('should execute wait action successfully', async () => {
      const action: BrowserAction = {
        id: 'wait-test',
        type: 'wait' as BrowserActionType,
        value: '2000',
        description: 'Wait 2 seconds',
      };

      const result = await actionExecutor.executeAction(mockPage, action);

      expect(result.success).toBe(true);
      expect(result.actionId).toBe('wait-test');
      expect(result.data?.waitTime).toBe(2000);
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(2000);
    });

    it('should execute screenshot action successfully', async () => {
      const action: BrowserAction = {
        id: 'screenshot-test',
        type: 'screenshot' as BrowserActionType,
        description: 'Take screenshot',
      };

      const result = await actionExecutor.executeAction(mockPage, action);

      expect(result.success).toBe(true);
      expect(result.actionId).toBe('screenshot-test');
      expect(result.screenshot).toBe('base64-screenshot-data');
      expect(mockScreenshotCapture.captureScreenshot).toHaveBeenCalledWith(
        mockPage,
        expect.objectContaining({ fullPage: false })
      );
    });

    it('should execute select action successfully', async () => {
      const action: BrowserAction = {
        id: 'select-test',
        type: 'select' as BrowserActionType,
        target: {
          css: '#dropdown',
          strategy: ['css'],
        },
        value: 'option1',
        description: 'Select option',
      };

      const result = await actionExecutor.executeAction(mockPage, action);

      expect(result.success).toBe(true);
      expect(result.actionId).toBe('select-test');
      expect(result.data?.selectedValue).toBe('option1');
      
      const mockElement = mockPage.locator();
      expect(mockElement.selectOption).toHaveBeenCalledWith('option1');
    });

    it('should execute hover action successfully', async () => {
      const action: BrowserAction = {
        id: 'hover-test',
        type: 'hover' as BrowserActionType,
        target: {
          css: '#hover-element',
          strategy: ['css'],
        },
        description: 'Hover over element',
      };

      const result = await actionExecutor.executeAction(mockPage, action);

      expect(result.success).toBe(true);
      expect(result.actionId).toBe('hover-test');
      
      const mockElement = mockPage.locator();
      expect(mockElement.hover).toHaveBeenCalled();
    });

    it('should execute key press action successfully', async () => {
      const action: BrowserAction = {
        id: 'keypress-test',
        type: 'key_press' as BrowserActionType,
        value: 'Enter',
        description: 'Press Enter key',
      };

      const result = await actionExecutor.executeAction(mockPage, action);

      expect(result.success).toBe(true);
      expect(result.actionId).toBe('keypress-test');
      expect(result.data?.keyPressed).toBe('Enter');
      expect(mockPage.keyboard.press).toHaveBeenCalledWith('Enter');
    });

    it('should execute reload action successfully', async () => {
      const action: BrowserAction = {
        id: 'reload-test',
        type: 'reload' as BrowserActionType,
        description: 'Reload page',
      };

      const result = await actionExecutor.executeAction(mockPage, action);

      expect(result.success).toBe(true);
      expect(result.actionId).toBe('reload-test');
      expect(result.data?.reloaded).toBe(true);
      expect(mockPage.reload).toHaveBeenCalled();
    });

    it('should handle action execution errors', async () => {
      // Mock element selector to return null (element not found)
      mockElementSelector.waitForElement.mockResolvedValue(null);

      const action: BrowserAction = {
        id: 'failing-action',
        type: 'click' as BrowserActionType,
        target: {
          css: '#non-existent',
          strategy: ['css'],
        },
        description: 'Click non-existent element',
      };

      const result = await actionExecutor.executeAction(mockPage, action);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Element not found');
      expect(result.actionId).toBe('failing-action');
    });

    it('should capture error screenshot when action fails', async () => {
      mockElementSelector.waitForElement.mockRejectedValue(new Error('Element not found'));

      const action: BrowserAction = {
        id: 'error-action',
        type: 'click' as BrowserActionType,
        target: {
          css: '#test',
          strategy: ['css'],
        },
        description: 'Failing action',
      };

      const result = await actionExecutor.executeAction(mockPage, action);

      expect(result.success).toBe(false);
      expect(result.screenshot).toBe('base64-screenshot-data');
      expect(mockScreenshotCapture.captureScreenshot).toHaveBeenCalled();
    });

    it('should throw error for unsupported action type', async () => {
      const action: BrowserAction = {
        id: 'unsupported-action',
        type: 'unsupported' as any,
        description: 'Unsupported action',
      };

      const result = await actionExecutor.executeAction(mockPage, action);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported action type');
    });
  });

  describe('executeActions', () => {
    it('should execute multiple actions in sequence', async () => {
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
            css: '#button',
            strategy: ['css'],
          },
          description: 'Click button',
        },
      ];

      const results = await actionExecutor.executeActions(mockPage, actions);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[0].actionId).toBe('action-1');
      expect(results[1].actionId).toBe('action-2');
    });

    it('should stop on error when stopOnError is true', async () => {
      // Make the second action fail
      mockElementSelector.waitForElement
        .mockResolvedValueOnce(mockPage.locator()) // First action succeeds
        .mockResolvedValueOnce(null); // Second action fails

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
            css: '#non-existent',
            strategy: ['css'],
          },
          description: 'Click non-existent button',
        },
        {
          id: 'action-3',
          type: 'wait' as BrowserActionType,
          value: '1000',
          description: 'Wait 1 second',
        },
      ];

      const results = await actionExecutor.executeActions(mockPage, actions, {
        stopOnError: true,
      });

      expect(results).toHaveLength(2); // Should stop after second action fails
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });

    it('should continue on error when stopOnError is false', async () => {
      // Make the second action fail
      mockElementSelector.waitForElement
        .mockResolvedValueOnce(mockPage.locator()) // First action succeeds
        .mockResolvedValueOnce(null) // Second action fails
        .mockResolvedValueOnce(mockPage.locator()); // Third action succeeds

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
            css: '#non-existent',
            strategy: ['css'],
          },
          description: 'Click non-existent button',
        },
        {
          id: 'action-3',
          type: 'wait' as BrowserActionType,
          value: '1000',
          description: 'Wait 1 second',
        },
      ];

      const results = await actionExecutor.executeActions(mockPage, actions, {
        stopOnError: false,
      });

      expect(results).toHaveLength(3); // Should execute all actions
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });
  });
});
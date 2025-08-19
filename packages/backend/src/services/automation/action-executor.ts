import { Page } from 'playwright';
import { 
  BrowserAction, 
  ActionResult, 
  ActionOptions,
  ElementInfo 
} from '@browser-ai-agent/shared';
import { ElementSelectorService } from './element-selector';
import { ScreenshotCapture } from './screenshot-capture';
import { Logger } from 'winston';
import { createLogger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface ActionExecutorConfig {
  defaultTimeout: number;
  screenshotOnError: boolean;
  highlightElements: boolean;
  maxRetries: number;
  retryDelay: number;
}

export class ActionExecutor {
  private readonly logger: Logger;
  private readonly config: ActionExecutorConfig;
  private readonly elementSelector: ElementSelectorService;
  private readonly screenshotCapture: ScreenshotCapture;

  constructor(
    config: ActionExecutorConfig,
    elementSelector: ElementSelectorService,
    screenshotCapture: ScreenshotCapture
  ) {
    this.logger = createLogger('ActionExecutor');
    this.config = config;
    this.elementSelector = elementSelector;
    this.screenshotCapture = screenshotCapture;
  }

  /**
   * Execute a browser action
   */
  async executeAction(
    page: Page,
    action: BrowserAction,
    options?: {
      skipScreenshots?: boolean;
      customTimeout?: number;
    }
  ): Promise<ActionResult> {
    const startTime = Date.now();
    const actionOptions = { ...action.options, ...options };

    this.logger.info('Executing action', {
      actionId: action.id,
      type: action.type,
      description: action.description,
    });

    try {
      // Take screenshot before action if requested
      let screenshotBefore: string | undefined;
      if (actionOptions.screenshotBefore && !options?.skipScreenshots) {
        screenshotBefore = await this.screenshotCapture.captureScreenshot(page);
      }

      // Execute the action based on type
      let result: ActionResult;
      
      switch (action.type) {
        case 'click':
          result = await this.executeClick(page, action, actionOptions);
          break;
        case 'type':
          result = await this.executeType(page, action, actionOptions);
          break;
        case 'scroll':
          result = await this.executeScroll(page, action, actionOptions);
          break;
        case 'navigate':
          result = await this.executeNavigate(page, action, actionOptions);
          break;
        case 'wait':
          result = await this.executeWait(page, action, actionOptions);
          break;
        case 'extract':
          result = await this.executeExtract(page, action, actionOptions);
          break;
        case 'screenshot':
          result = await this.executeScreenshot(page, action, actionOptions);
          break;
        case 'select':
          result = await this.executeSelect(page, action, actionOptions);
          break;
        case 'hover':
          result = await this.executeHover(page, action, actionOptions);
          break;
        case 'key_press':
          result = await this.executeKeyPress(page, action, actionOptions);
          break;
        case 'form_submit':
          result = await this.executeFormSubmit(page, action, actionOptions);
          break;
        case 'reload':
          result = await this.executeReload(page, action, actionOptions);
          break;
        case 'back':
          result = await this.executeBack(page, action, actionOptions);
          break;
        case 'forward':
          result = await this.executeForward(page, action, actionOptions);
          break;
        default:
          throw new Error(`Unsupported action type: ${action.type}`);
      }

      // Take screenshot after action if requested
      if (actionOptions.screenshotAfter && !options?.skipScreenshots) {
        result.screenshot = await this.screenshotCapture.captureScreenshot(page);
      }

      // Add execution metadata
      result.executionTime = Date.now() - startTime;
      result.metadata = {
        ...result.metadata,
        screenshotBefore,
        actionOptions,
      };

      this.logger.info('Action executed successfully', {
        actionId: action.id,
        type: action.type,
        success: result.success,
        executionTime: result.executionTime,
      });

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error('Action execution failed', {
        actionId: action.id,
        type: action.type,
        error: errorMessage,
        executionTime,
      });

      // Take error screenshot if enabled
      let errorScreenshot: string | undefined;
      if (this.config.screenshotOnError && !options?.skipScreenshots) {
        try {
          errorScreenshot = await this.screenshotCapture.captureScreenshot(page);
        } catch (screenshotError) {
          this.logger.warn('Failed to capture error screenshot', {
            error: screenshotError instanceof Error ? screenshotError.message : 'Unknown error',
          });
        }
      }

      return {
        actionId: action.id,
        success: false,
        error: errorMessage,
        screenshot: errorScreenshot,
        executionTime,
        metadata: {
          actionOptions,
          errorDetails: error instanceof Error ? error.stack : undefined,
        },
      };
    }
  }

  /**
   * Execute multiple actions in sequence
   */
  async executeActions(
    page: Page,
    actions: BrowserAction[],
    options?: {
      stopOnError?: boolean;
      skipScreenshots?: boolean;
    }
  ): Promise<ActionResult[]> {
    const results: ActionResult[] = [];
    
    this.logger.info('Executing action sequence', {
      actionCount: actions.length,
      stopOnError: options?.stopOnError,
    });

    for (const action of actions) {
      const result = await this.executeAction(page, action, options);
      results.push(result);

      if (!result.success && options?.stopOnError) {
        this.logger.warn('Stopping action sequence due to error', {
          actionId: action.id,
          error: result.error,
        });
        break;
      }

      // Small delay between actions to allow page to settle
      await page.waitForTimeout(100);
    }

    const successCount = results.filter(r => r.success).length;
    this.logger.info('Action sequence completed', {
      totalActions: actions.length,
      successfulActions: successCount,
      failedActions: actions.length - successCount,
    });

    return results;
  }

  /**
   * Action execution methods
   */
  private async executeClick(
    page: Page,
    action: BrowserAction,
    options: ActionOptions
  ): Promise<ActionResult> {
    if (!action.target) {
      throw new Error('Click action requires a target element');
    }

    const element = await this.elementSelector.waitForElement(
      page,
      action.target,
      {
        visible: true,
        enabled: true,
        timeout: options.timeout || this.config.defaultTimeout,
      }
    );

    if (!element) {
      throw new Error('Element not found or not clickable');
    }

    // Highlight element if requested
    if (options.highlight || this.config.highlightElements) {
      await this.highlightElement(page, element);
    }

    // Get element info before clicking
    const elementInfo = await this.elementSelector.getElementInfo(page, element);

    // Perform click
    await element.click({
      timeout: options.timeout || this.config.defaultTimeout,
    });

    // Wait for any navigation or loading
    await this.waitForStability(page);

    return {
      actionId: action.id,
      success: true,
      actualTarget: elementInfo,
      metadata: {
        clickPosition: await element.boundingBox(),
      },
    };
  }

  private async executeType(
    page: Page,
    action: BrowserAction,
    options: ActionOptions
  ): Promise<ActionResult> {
    if (!action.target || !action.value) {
      throw new Error('Type action requires target element and value');
    }

    const element = await this.elementSelector.waitForElement(
      page,
      action.target,
      {
        visible: true,
        enabled: true,
        timeout: options.timeout || this.config.defaultTimeout,
      }
    );

    if (!element) {
      throw new Error('Input element not found');
    }

    // Highlight element if requested
    if (options.highlight || this.config.highlightElements) {
      await this.highlightElement(page, element);
    }

    // Clear existing content and type new value
    await element.clear();
    await element.fill(action.value);

    // Trigger change event
    await element.dispatchEvent('change');

    return {
      actionId: action.id,
      success: true,
      data: { typedValue: action.value },
      actualTarget: await this.elementSelector.getElementInfo(page, element),
    };
  }

  private async executeScroll(
    page: Page,
    action: BrowserAction,
    options: ActionOptions
  ): Promise<ActionResult> {
    const scrollValue = action.value || 'down';
    let scrollAmount = 500; // Default scroll amount

    if (action.target) {
      // Scroll to specific element
      const element = await this.elementSelector.findElement(page, action.target);
      if (element) {
        await element.scrollIntoViewIfNeeded();
        return {
          actionId: action.id,
          success: true,
          data: { scrolledToElement: true },
        };
      }
    }

    // Scroll by direction
    switch (scrollValue.toLowerCase()) {
      case 'up':
        await page.mouse.wheel(0, -scrollAmount);
        break;
      case 'down':
        await page.mouse.wheel(0, scrollAmount);
        break;
      case 'left':
        await page.mouse.wheel(-scrollAmount, 0);
        break;
      case 'right':
        await page.mouse.wheel(scrollAmount, 0);
        break;
      case 'top':
        await page.evaluate(() => window.scrollTo(0, 0));
        break;
      case 'bottom':
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        break;
      default:
        // Try to parse as number for pixel amount
        const pixels = parseInt(scrollValue);
        if (!isNaN(pixels)) {
          await page.mouse.wheel(0, pixels);
        }
    }

    await this.waitForStability(page);

    return {
      actionId: action.id,
      success: true,
      data: { scrollDirection: scrollValue },
    };
  }

  private async executeNavigate(
    page: Page,
    action: BrowserAction,
    options: ActionOptions
  ): Promise<ActionResult> {
    if (!action.value) {
      throw new Error('Navigate action requires a URL');
    }

    const url = action.value;
    const timeout = options.timeout || 30000; // Longer timeout for navigation

    await page.goto(url, {
      timeout,
      waitUntil: 'domcontentloaded',
    });

    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle', { timeout: 10000 });

    return {
      actionId: action.id,
      success: true,
      data: {
        url: page.url(),
        title: await page.title(),
      },
    };
  }

  private async executeWait(
    page: Page,
    action: BrowserAction,
    options: ActionOptions
  ): Promise<ActionResult> {
    const waitTime = action.value ? parseInt(action.value) : 1000;

    if (action.target) {
      // Wait for specific element
      const element = await this.elementSelector.waitForElement(
        page,
        action.target,
        {
          visible: options.waitForVisible,
          enabled: options.waitForEnabled,
          timeout: options.timeout || this.config.defaultTimeout,
        }
      );

      return {
        actionId: action.id,
        success: !!element,
        data: { elementFound: !!element },
      };
    } else {
      // Wait for specified time
      await page.waitForTimeout(waitTime);
      
      return {
        actionId: action.id,
        success: true,
        data: { waitTime },
      };
    }
  }

  private async executeExtract(
    page: Page,
    action: BrowserAction,
    options: ActionOptions
  ): Promise<ActionResult> {
    let extractedData: any = {};

    if (action.target) {
      // Extract from specific element
      const element = await this.elementSelector.findElement(page, action.target);
      if (element) {
        extractedData = await this.extractElementData(page, element);
      }
    } else {
      // Extract general page data
      extractedData = await this.extractPageData(page);
    }

    return {
      actionId: action.id,
      success: true,
      data: extractedData,
    };
  }

  private async executeScreenshot(
    page: Page,
    action: BrowserAction,
    options: ActionOptions
  ): Promise<ActionResult> {
    const screenshot = await this.screenshotCapture.captureScreenshot(page, {
      fullPage: action.value === 'full',
    });

    return {
      actionId: action.id,
      success: true,
      screenshot,
      data: { screenshotTaken: true },
    };
  }

  private async executeSelect(
    page: Page,
    action: BrowserAction,
    options: ActionOptions
  ): Promise<ActionResult> {
    if (!action.target || !action.value) {
      throw new Error('Select action requires target element and value');
    }

    const element = await this.elementSelector.waitForElement(
      page,
      action.target,
      {
        visible: true,
        enabled: true,
        timeout: options.timeout || this.config.defaultTimeout,
      }
    );

    if (!element) {
      throw new Error('Select element not found');
    }

    await element.selectOption(action.value);

    return {
      actionId: action.id,
      success: true,
      data: { selectedValue: action.value },
      actualTarget: await this.elementSelector.getElementInfo(page, element),
    };
  }

  private async executeHover(
    page: Page,
    action: BrowserAction,
    options: ActionOptions
  ): Promise<ActionResult> {
    if (!action.target) {
      throw new Error('Hover action requires a target element');
    }

    const element = await this.elementSelector.waitForElement(
      page,
      action.target,
      {
        visible: true,
        timeout: options.timeout || this.config.defaultTimeout,
      }
    );

    if (!element) {
      throw new Error('Element not found for hover');
    }

    await element.hover();

    return {
      actionId: action.id,
      success: true,
      actualTarget: await this.elementSelector.getElementInfo(page, element),
    };
  }

  private async executeKeyPress(
    page: Page,
    action: BrowserAction,
    options: ActionOptions
  ): Promise<ActionResult> {
    if (!action.value) {
      throw new Error('Key press action requires a key value');
    }

    await page.keyboard.press(action.value);

    return {
      actionId: action.id,
      success: true,
      data: { keyPressed: action.value },
    };
  }

  private async executeFormSubmit(
    page: Page,
    action: BrowserAction,
    options: ActionOptions
  ): Promise<ActionResult> {
    let form;

    if (action.target) {
      form = await this.elementSelector.findElement(page, action.target);
    } else {
      // Find first form on page
      form = page.locator('form').first();
    }

    if (!form) {
      throw new Error('Form not found');
    }

    // Try to find submit button first
    const submitButton = form.locator('input[type="submit"], button[type="submit"], button:not([type])').first();
    
    if (await submitButton.count() > 0) {
      await submitButton.click();
    } else {
      // Fallback to form submission
      await form.evaluate(form => (form as HTMLFormElement).submit());
    }

    await this.waitForStability(page);

    return {
      actionId: action.id,
      success: true,
      data: { formSubmitted: true },
    };
  }

  private async executeReload(
    page: Page,
    action: BrowserAction,
    options: ActionOptions
  ): Promise<ActionResult> {
    await page.reload({
      timeout: options.timeout || 30000,
      waitUntil: 'domcontentloaded',
    });

    return {
      actionId: action.id,
      success: true,
      data: { reloaded: true },
    };
  }

  private async executeBack(
    page: Page,
    action: BrowserAction,
    options: ActionOptions
  ): Promise<ActionResult> {
    await page.goBack({
      timeout: options.timeout || 30000,
      waitUntil: 'domcontentloaded',
    });

    return {
      actionId: action.id,
      success: true,
      data: { navigatedBack: true },
    };
  }

  private async executeForward(
    page: Page,
    action: BrowserAction,
    options: ActionOptions
  ): Promise<ActionResult> {
    await page.goForward({
      timeout: options.timeout || 30000,
      waitUntil: 'domcontentloaded',
    });

    return {
      actionId: action.id,
      success: true,
      data: { navigatedForward: true },
    };
  }

  /**
   * Helper methods
   */
  private async highlightElement(page: Page, element: any): Promise<void> {
    try {
      await element.evaluate((el: HTMLElement) => {
        el.style.outline = '3px solid #ff0000';
        el.style.outlineOffset = '2px';
        setTimeout(() => {
          el.style.outline = '';
          el.style.outlineOffset = '';
        }, 2000);
      });
    } catch (error) {
      // Ignore highlighting errors
    }
  }

  private async waitForStability(page: Page, timeout: number = 2000): Promise<void> {
    try {
      await page.waitForLoadState('networkidle', { timeout });
    } catch (error) {
      // Continue if network idle timeout
    }
  }

  private async extractElementData(page: Page, element: any): Promise<any> {
    return await element.evaluate((el: HTMLElement) => {
      const data: any = {
        tagName: el.tagName.toLowerCase(),
        text: el.textContent?.trim(),
        innerHTML: el.innerHTML,
        attributes: {},
      };

      // Extract attributes
      for (const attr of el.attributes) {
        data.attributes[attr.name] = attr.value;
      }

      // Extract specific data based on element type
      if (el.tagName === 'TABLE') {
        data.tableData = this.extractTableData(el as HTMLTableElement);
      } else if (el.tagName === 'UL' || el.tagName === 'OL') {
        data.listItems = Array.from(el.querySelectorAll('li')).map(li => li.textContent?.trim());
      }

      return data;
    });
  }

  private async extractPageData(page: Page): Promise<any> {
    return await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        text: document.body.textContent?.trim(),
        links: Array.from(document.querySelectorAll('a[href]')).map(a => ({
          text: a.textContent?.trim(),
          href: (a as HTMLAnchorElement).href,
        })),
        images: Array.from(document.querySelectorAll('img')).map(img => ({
          src: (img as HTMLImageElement).src,
          alt: (img as HTMLImageElement).alt,
        })),
        forms: Array.from(document.querySelectorAll('form')).map(form => ({
          action: (form as HTMLFormElement).action,
          method: (form as HTMLFormElement).method,
          inputs: Array.from(form.querySelectorAll('input, select, textarea')).map(input => ({
            name: (input as HTMLInputElement).name,
            type: (input as HTMLInputElement).type,
            value: (input as HTMLInputElement).value,
          })),
        })),
      };
    });
  }
}
import { Page, ElementHandle } from 'playwright';
import { logger } from '@/utils/logger';
import { AIElementSelector, ElementContext, ElementAnalysis } from './element-selector';

// =============================================================================
// SOPHISTICATED ACTION EXECUTOR (Superior to Manus Action Execution)
// Master Plan: Human-like behavior simulation with anti-detection
// =============================================================================

export interface ActionConfig {
  humanLike: boolean;
  speed: 'slow' | 'normal' | 'fast';
  retryAttempts: number;
  waitBetweenActions: number;
  scrollIntoView: boolean;
  takeScreenshots: boolean;
  validateAfterAction: boolean;
}

export interface ActionResult {
  success: boolean;
  action: string;
  element?: ElementAnalysis;
  error?: string;
  screenshot?: Buffer;
  duration: number;
  retryCount: number;
  metadata: Record<string, any>;
}

export interface ClickOptions {
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
  delay?: number;
  force?: boolean;
  modifiers?: ('Alt' | 'Control' | 'Meta' | 'Shift')[];
  position?: { x: number; y: number };
}

export interface TypeOptions {
  delay?: number;
  clear?: boolean;
  humanLike?: boolean;
  pressEnterAfter?: boolean;
}

export interface ScrollOptions {
  direction: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  smooth?: boolean;
  toElement?: boolean;
}

// =============================================================================
// ADVANCED ACTION EXECUTOR IMPLEMENTATION
// =============================================================================

export class ActionExecutor {
  private elementSelector: AIElementSelector;
  private defaultConfig: ActionConfig;

  constructor(config?: Partial<ActionConfig>) {
    this.elementSelector = new AIElementSelector();
    this.defaultConfig = {
      humanLike: true,
      speed: 'normal',
      retryAttempts: 3,
      waitBetweenActions: 1000,
      scrollIntoView: true,
      takeScreenshots: true,
      validateAfterAction: true,
      ...config,
    };
    
    logger.info('Action Executor initialized', { config: this.defaultConfig });
  }

  // =============================================================================
  // CLICK ACTIONS
  // =============================================================================

  async click(page: Page, context: ElementContext, options?: ClickOptions): Promise<ActionResult> {
    const startTime = Date.now();
    let retryCount = 0;
    let lastError: string | undefined;

    logger.info('Executing click action', {
      description: context.description,
      expectedType: context.expectedType,
    });

    while (retryCount <= this.defaultConfig.retryAttempts) {
      try {
        // Find the element
        const elementAnalysis = await this.elementSelector.findElement(page, context);
        
        if (!elementAnalysis) {
          throw new Error(`Element not found: ${context.description}`);
        }

        if (!elementAnalysis.isClickable) {
          throw new Error(`Element is not clickable: ${context.description}`);
        }

        // Scroll element into view if needed
        if (this.defaultConfig.scrollIntoView) {
          await this.scrollToElement(page, elementAnalysis.element);
        }

        // Add human-like delay before action
        if (this.defaultConfig.humanLike) {
          await this.humanDelay();
        }

        // Perform human-like mouse movement to element
        if (this.defaultConfig.humanLike) {
          await this.humanMouseMove(page, elementAnalysis.boundingBox);
        }

        // Take screenshot before action
        let beforeScreenshot: Buffer | undefined;
        if (this.defaultConfig.takeScreenshots) {
          beforeScreenshot = await page.screenshot();
        }

        // Perform the click
        await this.performClick(elementAnalysis.element, options);

        // Wait for potential page changes
        await this.waitForStability(page);

        // Take screenshot after action
        let afterScreenshot: Buffer | undefined;
        if (this.defaultConfig.takeScreenshots) {
          afterScreenshot = await page.screenshot();
        }

        // Validate action if needed
        if (this.defaultConfig.validateAfterAction) {
          const isValid = await this.validateClickAction(page, elementAnalysis, context);
          if (!isValid) {
            throw new Error('Click action validation failed');
          }
        }

        const duration = Date.now() - startTime;

        logger.info('Click action completed successfully', {
          description: context.description,
          duration,
          retryCount,
        });

        return {
          success: true,
          action: 'click',
          element: elementAnalysis,
          duration,
          retryCount,
          metadata: {
            beforeScreenshot,
            afterScreenshot,
            clickOptions: options,
          },
        };

      } catch (error) {
        lastError = error.message;
        retryCount++;
        
        logger.warn('Click action failed, retrying', {
          description: context.description,
          attempt: retryCount,
          error: lastError,
        });

        if (retryCount <= this.defaultConfig.retryAttempts) {
          await this.waitBetweenRetries(retryCount);
        }
      }
    }

    const duration = Date.now() - startTime;

    logger.error('Click action failed after all retries', {
      description: context.description,
      retryCount,
      error: lastError,
    });

    return {
      success: false,
      action: 'click',
      error: lastError,
      duration,
      retryCount,
      metadata: {},
    };
  }

  // =============================================================================
  // TYPE ACTIONS
  // =============================================================================

  async type(page: Page, context: ElementContext, text: string, options?: TypeOptions): Promise<ActionResult> {
    const startTime = Date.now();
    let retryCount = 0;
    let lastError: string | undefined;

    logger.info('Executing type action', {
      description: context.description,
      text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
    });

    while (retryCount <= this.defaultConfig.retryAttempts) {
      try {
        // Find the element
        const elementAnalysis = await this.elementSelector.findElement(page, context);
        
        if (!elementAnalysis) {
          throw new Error(`Element not found: ${context.description}`);
        }

        // Scroll element into view if needed
        if (this.defaultConfig.scrollIntoView) {
          await this.scrollToElement(page, elementAnalysis.element);
        }

        // Focus the element first
        await elementAnalysis.element.focus();

        // Clear existing content if requested
        if (options?.clear !== false) {
          await this.clearInput(elementAnalysis.element);
        }

        // Add human-like delay before typing
        if (this.defaultConfig.humanLike) {
          await this.humanDelay();
        }

        // Perform human-like typing
        if (options?.humanLike !== false && this.defaultConfig.humanLike) {
          await this.humanType(elementAnalysis.element, text, options);
        } else {
          await elementAnalysis.element.type(text, {
            delay: options?.delay || 50,
          });
        }

        // Press Enter if requested
        if (options?.pressEnterAfter) {
          await elementAnalysis.element.press('Enter');
        }

        // Wait for potential changes
        await this.waitForStability(page);

        // Validate the typed content
        if (this.defaultConfig.validateAfterAction) {
          const isValid = await this.validateTypeAction(elementAnalysis.element, text);
          if (!isValid) {
            throw new Error('Type action validation failed');
          }
        }

        const duration = Date.now() - startTime;

        logger.info('Type action completed successfully', {
          description: context.description,
          textLength: text.length,
          duration,
          retryCount,
        });

        return {
          success: true,
          action: 'type',
          element: elementAnalysis,
          duration,
          retryCount,
          metadata: {
            text,
            options,
          },
        };

      } catch (error) {
        lastError = error.message;
        retryCount++;
        
        logger.warn('Type action failed, retrying', {
          description: context.description,
          attempt: retryCount,
          error: lastError,
        });

        if (retryCount <= this.defaultConfig.retryAttempts) {
          await this.waitBetweenRetries(retryCount);
        }
      }
    }

    const duration = Date.now() - startTime;

    return {
      success: false,
      action: 'type',
      error: lastError,
      duration,
      retryCount,
      metadata: { text, options },
    };
  }

  // =============================================================================
  // SCROLL ACTIONS
  // =============================================================================

  async scroll(page: Page, options: ScrollOptions): Promise<ActionResult> {
    const startTime = Date.now();

    logger.info('Executing scroll action', {
      direction: options.direction,
      amount: options.amount,
    });

    try {
      if (options.toElement && options.direction === 'down') {
        // Scroll to find an element
        await this.scrollToFindElement(page, options);
      } else {
        // Regular scroll
        await this.performScroll(page, options);
      }

      // Wait for scroll to complete
      await this.waitForScrollStability(page);

      const duration = Date.now() - startTime;

      logger.info('Scroll action completed', {
        direction: options.direction,
        duration,
      });

      return {
        success: true,
        action: 'scroll',
        duration,
        retryCount: 0,
        metadata: { options },
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Scroll action failed', {
        direction: options.direction,
        error: error.message,
      });

      return {
        success: false,
        action: 'scroll',
        error: error.message,
        duration,
        retryCount: 0,
        metadata: { options },
      };
    }
  }

  // =============================================================================
  // WAIT ACTIONS
  // =============================================================================

  async waitForElement(page: Page, context: ElementContext, timeout: number = 30000): Promise<ActionResult> {
    const startTime = Date.now();

    logger.info('Waiting for element', {
      description: context.description,
      timeout,
    });

    try {
      let element: ElementAnalysis | null = null;
      const endTime = startTime + timeout;

      while (Date.now() < endTime) {
        element = await this.elementSelector.findElement(page, context);
        
        if (element && element.isVisible) {
          break;
        }

        await this.sleep(1000); // Check every second
      }

      if (!element) {
        throw new Error(`Element not found within timeout: ${context.description}`);
      }

      const duration = Date.now() - startTime;

      logger.info('Element found successfully', {
        description: context.description,
        duration,
      });

      return {
        success: true,
        action: 'waitForElement',
        element,
        duration,
        retryCount: 0,
        metadata: { timeout },
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Wait for element failed', {
        description: context.description,
        error: error.message,
      });

      return {
        success: false,
        action: 'waitForElement',
        error: error.message,
        duration,
        retryCount: 0,
        metadata: { timeout },
      };
    }
  }

  async waitForNavigation(page: Page, timeout: number = 30000): Promise<ActionResult> {
    const startTime = Date.now();

    logger.info('Waiting for navigation', { timeout });

    try {
      await page.waitForLoadState('networkidle', { timeout });

      const duration = Date.now() - startTime;

      logger.info('Navigation completed', { duration });

      return {
        success: true,
        action: 'waitForNavigation',
        duration,
        retryCount: 0,
        metadata: { timeout },
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Wait for navigation failed', {
        error: error.message,
      });

      return {
        success: false,
        action: 'waitForNavigation',
        error: error.message,
        duration,
        retryCount: 0,
        metadata: { timeout },
      };
    }
  }

  // =============================================================================
  // HUMAN-LIKE BEHAVIOR SIMULATION
  // =============================================================================

  private async humanMouseMove(page: Page, boundingBox: { x: number; y: number; width: number; height: number }): Promise<void> {
    // Calculate target position with some randomness
    const targetX = boundingBox.x + boundingBox.width / 2 + (Math.random() - 0.5) * 20;
    const targetY = boundingBox.y + boundingBox.height / 2 + (Math.random() - 0.5) * 20;

    // Get current mouse position (approximate)
    const currentPos = await page.evaluate(() => ({ x: 0, y: 0 })); // Simplified

    // Create curved path to target
    const steps = Math.max(5, Math.floor(Math.random() * 10) + 5);
    
    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;
      
      // Add some curve to the movement
      const curve = Math.sin(progress * Math.PI) * 20;
      
      const x = currentPos.x + (targetX - currentPos.x) * progress + curve;
      const y = currentPos.y + (targetY - currentPos.y) * progress;

      await page.mouse.move(x, y);
      
      // Random small delay between movements
      await this.sleep(Math.random() * 50 + 10);
    }
  }

  private async humanType(element: ElementHandle, text: string, options?: TypeOptions): Promise<void> {
    const baseDelay = options?.delay || 100;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      // Variable typing speed - faster for common letters
      const charDelay = this.getCharacterDelay(char, baseDelay);
      
      await element.type(char, { delay: charDelay });
      
      // Occasional longer pauses (thinking)
      if (Math.random() < 0.1) {
        await this.sleep(Math.random() * 500 + 200);
      }
      
      // Occasional typos and corrections (simplified)
      if (Math.random() < 0.02 && i > 0) {
        await element.press('Backspace');
        await this.sleep(Math.random() * 200 + 100);
        await element.type(char, { delay: charDelay });
      }
    }
  }

  private getCharacterDelay(char: string, baseDelay: number): number {
    // Common letters are typed faster
    const commonChars = 'etaoinshrdlu';
    const isCommon = commonChars.includes(char.toLowerCase());
    
    const multiplier = isCommon ? 0.8 : 1.2;
    const randomFactor = 0.5 + Math.random();
    
    return Math.floor(baseDelay * multiplier * randomFactor);
  }

  private async humanDelay(): Promise<void> {
    const delay = this.getHumanDelay();
    await this.sleep(delay);
  }

  private getHumanDelay(): number {
    switch (this.defaultConfig.speed) {
      case 'slow':
        return Math.random() * 2000 + 1000; // 1-3 seconds
      case 'fast':
        return Math.random() * 200 + 100; // 100-300ms
      default: // normal
        return Math.random() * 800 + 400; // 400-1200ms
    }
  }

  // =============================================================================
  // ACTION IMPLEMENTATION HELPERS
  // =============================================================================

  private async performClick(element: ElementHandle, options?: ClickOptions): Promise<void> {
    const clickOptions: any = {
      button: options?.button || 'left',
      clickCount: options?.clickCount || 1,
      delay: options?.delay || 0,
      force: options?.force || false,
    };

    if (options?.modifiers) {
      clickOptions.modifiers = options.modifiers;
    }

    if (options?.position) {
      clickOptions.position = options.position;
    }

    await element.click(clickOptions);
  }

  private async clearInput(element: ElementHandle): Promise<void> {
    // Select all and delete
    await element.selectText();
    await element.press('Delete');
    
    // Alternative method for stubborn inputs
    const value = await element.inputValue();
    if (value) {
      for (let i = 0; i < value.length; i++) {
        await element.press('Backspace');
      }
    }
  }

  private async scrollToElement(page: Page, element: ElementHandle): Promise<void> {
    await element.scrollIntoViewIfNeeded();
    
    // Add small delay for scroll to complete
    await this.sleep(500);
  }

  private async performScroll(page: Page, options: ScrollOptions): Promise<void> {
    const amount = options.amount || 500;
    
    let deltaX = 0;
    let deltaY = 0;

    switch (options.direction) {
      case 'up':
        deltaY = -amount;
        break;
      case 'down':
        deltaY = amount;
        break;
      case 'left':
        deltaX = -amount;
        break;
      case 'right':
        deltaX = amount;
        break;
    }

    if (options.smooth) {
      // Smooth scrolling with multiple small steps
      const steps = 10;
      const stepX = deltaX / steps;
      const stepY = deltaY / steps;

      for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(stepX, stepY);
        await this.sleep(50);
      }
    } else {
      await page.mouse.wheel(deltaX, deltaY);
    }
  }

  private async scrollToFindElement(page: Page, options: ScrollOptions): Promise<void> {
    // This would implement intelligent scrolling to find elements
    // For now, just scroll down in increments
    const maxScrolls = 10;
    let scrollCount = 0;

    while (scrollCount < maxScrolls) {
      await this.performScroll(page, {
        direction: 'down',
        amount: 500,
        smooth: true,
      });
      
      await this.sleep(1000);
      scrollCount++;
    }
  }

  // =============================================================================
  // VALIDATION METHODS
  // =============================================================================

  private async validateClickAction(page: Page, element: ElementAnalysis, context: ElementContext): Promise<boolean> {
    // Check if click caused expected changes
    try {
      // Wait for potential navigation or DOM changes
      await this.sleep(1000);
      
      // Check if URL changed (for navigation clicks)
      const currentUrl = page.url();
      
      // Check if element state changed
      const newElement = await this.elementSelector.findElement(page, context);
      
      // Basic validation - if we can still find the element or URL changed, consider it successful
      return newElement !== null || currentUrl !== page.url();
    } catch (error) {
      return false;
    }
  }

  private async validateTypeAction(element: ElementHandle, expectedText: string): Promise<boolean> {
    try {
      const actualValue = await element.inputValue();
      return actualValue.includes(expectedText);
    } catch (error) {
      return false;
    }
  }

  // =============================================================================
  // STABILITY AND TIMING HELPERS
  // =============================================================================

  private async waitForStability(page: Page): Promise<void> {
    try {
      // Wait for network to be idle
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    } catch (error) {
      // If network idle fails, just wait a bit
      await this.sleep(1000);
    }
  }

  private async waitForScrollStability(page: Page): Promise<void> {
    // Wait for scroll animations to complete
    await this.sleep(500);
    
    // Check if page is still scrolling
    let lastScrollY = await page.evaluate(() => window.scrollY);
    await this.sleep(100);
    let currentScrollY = await page.evaluate(() => window.scrollY);
    
    // Wait until scroll position stabilizes
    while (lastScrollY !== currentScrollY) {
      lastScrollY = currentScrollY;
      await this.sleep(100);
      currentScrollY = await page.evaluate(() => window.scrollY);
    }
  }

  private async waitBetweenRetries(retryCount: number): Promise<void> {
    // Exponential backoff with jitter
    const baseDelay = 1000;
    const maxDelay = 10000;
    const delay = Math.min(baseDelay * Math.pow(2, retryCount - 1), maxDelay);
    const jitter = Math.random() * 1000;
    
    await this.sleep(delay + jitter);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  updateConfig(config: Partial<ActionConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...config };
    logger.info('Action Executor config updated', { config: this.defaultConfig });
  }

  getConfig(): ActionConfig {
    return { ...this.defaultConfig };
  }

  getStats(): any {
    return {
      config: this.defaultConfig,
      selectorStats: this.elementSelector.getCacheStats(),
    };
  }
}

export default ActionExecutor;
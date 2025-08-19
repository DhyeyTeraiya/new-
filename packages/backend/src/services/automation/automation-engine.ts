import { Page } from 'playwright';
import {
  BrowserAction,
  ActionResult,
  AutomationState,
  AutomationStatus,
  AutomationError,
  AutomationMetrics,
  PageContext,
  ElementInfo,
} from '@browser-ai-agent/shared';
import { BrowserManager } from './browser-manager';
import { ElementSelectorService } from './element-selector';
import { ActionExecutor } from './action-executor';
import { ScreenshotCapture } from './screenshot-capture';
import { Logger } from 'winston';
import { createLogger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface AutomationEngineConfig {
  browserManager: {
    defaultBrowser: 'chromium' | 'firefox' | 'webkit';
    headless: boolean;
    maxInstances: number;
    instanceTimeout: number;
    defaultViewport: { width: number; height: number };
  };
  elementSelector: {
    defaultTimeout: number;
    retryAttempts: number;
    retryDelay: number;
    enableSmartWaiting: boolean;
  };
  actionExecutor: {
    defaultTimeout: number;
    screenshotOnError: boolean;
    highlightElements: boolean;
    maxRetries: number;
    retryDelay: number;
  };
  maxConcurrentAutomations: number;
  defaultAutomationTimeout: number;
}

export class AutomationEngine {
  private readonly logger: Logger;
  private readonly config: AutomationEngineConfig;
  private readonly browserManager: BrowserManager;
  private readonly elementSelector: ElementSelectorService;
  private readonly actionExecutor: ActionExecutor;
  private readonly screenshotCapture: ScreenshotCapture;
  private readonly activeAutomations: Map<string, AutomationState>;

  constructor(config: AutomationEngineConfig) {
    this.logger = createLogger('AutomationEngine');
    this.config = config;
    this.activeAutomations = new Map();

    // Initialize services
    this.browserManager = new BrowserManager(config.browserManager);
    this.elementSelector = new ElementSelectorService(config.elementSelector);
    this.screenshotCapture = new ScreenshotCapture();
    this.actionExecutor = new ActionExecutor(
      config.actionExecutor,
      this.elementSelector,
      this.screenshotCapture
    );

    this.logger.info('Automation Engine initialized', {
      maxConcurrentAutomations: config.maxConcurrentAutomations,
    });
  }

  /**
   * Start a new automation session
   */
  async startAutomation(
    sessionId: string,
    actions: BrowserAction[],
    options?: {
      browserType?: 'chromium' | 'firefox' | 'webkit';
      headless?: boolean;
      viewport?: { width: number; height: number };
      continueOnError?: boolean;
      timeout?: number;
    }
  ): Promise<string> {
    // Check concurrent automation limit
    if (this.activeAutomations.size >= this.config.maxConcurrentAutomations) {
      throw new Error('Maximum concurrent automations limit reached');
    }

    const automationId = uuidv4();
    
    this.logger.info('Starting automation', {
      automationId,
      sessionId,
      actionCount: actions.length,
      options,
    });

    // Create browser instance
    const browserInstance = await this.browserManager.createInstance(sessionId, {
      browser: options?.browserType,
      headless: options?.headless,
      viewport: options?.viewport,
    });

    // Initialize automation state
    const automationState: AutomationState = {
      id: automationId,
      status: 'planning',
      currentStep: 0,
      history: [],
      startTime: new Date(),
      plan: {
        id: uuidv4(),
        description: `Execute ${actions.length} browser actions`,
        steps: actions.map((action, index) => ({
          id: `step-${index}`,
          description: action.description,
          action,
          expectedOutcome: action.expectedResult || 'Action completed successfully',
        })),
        estimatedTime: actions.length * 5000, // 5 seconds per action estimate
        riskLevel: 'medium',
        requiresConfirmation: false,
      },
    };

    this.activeAutomations.set(automationId, automationState);

    // Start execution in background
    this.executeAutomation(automationId, browserInstance.id, options)
      .catch(error => {
        this.logger.error('Automation execution failed', {
          automationId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        this.handleAutomationError(automationId, error);
      });

    return automationId;
  }

  /**
   * Get automation status
   */
  getAutomationStatus(automationId: string): AutomationState | null {
    return this.activeAutomations.get(automationId) || null;
  }

  /**
   * Pause automation
   */
  async pauseAutomation(automationId: string): Promise<boolean> {
    const automation = this.activeAutomations.get(automationId);
    if (!automation || automation.status !== 'executing') {
      return false;
    }

    automation.status = 'paused';
    this.logger.info('Automation paused', { automationId });
    return true;
  }

  /**
   * Resume automation
   */
  async resumeAutomation(automationId: string): Promise<boolean> {
    const automation = this.activeAutomations.get(automationId);
    if (!automation || automation.status !== 'paused') {
      return false;
    }

    automation.status = 'executing';
    this.logger.info('Automation resumed', { automationId });
    return true;
  }

  /**
   * Cancel automation
   */
  async cancelAutomation(automationId: string): Promise<boolean> {
    const automation = this.activeAutomations.get(automationId);
    if (!automation) {
      return false;
    }

    automation.status = 'cancelled';
    automation.endTime = new Date();
    
    this.logger.info('Automation cancelled', { automationId });
    return true;
  }

  /**
   * Execute single action
   */
  async executeAction(
    sessionId: string,
    action: BrowserAction,
    options?: {
      browserInstanceId?: string;
      takeScreenshot?: boolean;
    }
  ): Promise<ActionResult> {
    let browserInstance;
    let shouldCloseBrowser = false;

    try {
      // Get or create browser instance
      if (options?.browserInstanceId) {
        browserInstance = this.browserManager.getInstance(options.browserInstanceId);
        if (!browserInstance) {
          throw new Error('Browser instance not found');
        }
      } else {
        browserInstance = await this.browserManager.createInstance(sessionId);
        shouldCloseBrowser = true;
      }

      const page = this.browserManager.getPage(browserInstance.id);
      if (!page) {
        throw new Error('Page not available');
      }

      // Update browser instance status
      this.browserManager.setStatus(browserInstance.id, 'busy');

      // Execute action
      const result = await this.actionExecutor.executeAction(page, action, {
        skipScreenshots: !options?.takeScreenshot,
      });

      // Update browser instance status
      this.browserManager.setStatus(browserInstance.id, 'ready');

      return result;
    } catch (error) {
      if (browserInstance) {
        this.browserManager.setStatus(browserInstance.id, 'error');
      }
      throw error;
    } finally {
      // Clean up if we created a temporary browser instance
      if (shouldCloseBrowser && browserInstance) {
        await this.browserManager.closeInstance(browserInstance.id);
      }
    }
  }

  /**
   * Extract page context
   */
  async extractPageContext(
    sessionId: string,
    url?: string,
    options?: {
      browserInstanceId?: string;
      includeScreenshot?: boolean;
    }
  ): Promise<PageContext> {
    let browserInstance;
    let shouldCloseBrowser = false;

    try {
      // Get or create browser instance
      if (options?.browserInstanceId) {
        browserInstance = this.browserManager.getInstance(options.browserInstanceId);
        if (!browserInstance) {
          throw new Error('Browser instance not found');
        }
      } else {
        browserInstance = await this.browserManager.createInstance(sessionId);
        shouldCloseBrowser = true;
      }

      const page = this.browserManager.getPage(browserInstance.id);
      if (!page) {
        throw new Error('Page not available');
      }

      // Navigate to URL if provided
      if (url && page.url() !== url) {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
      }

      // Extract page information
      const [title, content, viewport, elements] = await Promise.all([
        page.title(),
        this.extractPageContent(page),
        this.extractViewportInfo(page),
        this.elementSelector.extractPageElements(page),
      ]);

      const pageContext: PageContext = {
        url: page.url(),
        title,
        content,
        elements,
        viewport,
        metadata: {
          loadingState: 'complete',
          hasForms: elements.some(e => e.tagName === 'form'),
          hasInteractiveElements: elements.some(e => e.interactive),
        },
        timestamp: new Date(),
      };

      return pageContext;
    } finally {
      // Clean up if we created a temporary browser instance
      if (shouldCloseBrowser && browserInstance) {
        await this.browserManager.closeInstance(browserInstance.id);
      }
    }
  }

  /**
   * Take screenshot
   */
  async takeScreenshot(
    sessionId: string,
    options?: {
      browserInstanceId?: string;
      fullPage?: boolean;
      highlightElements?: string[];
    }
  ): Promise<string> {
    let browserInstance;
    let shouldCloseBrowser = false;

    try {
      // Get or create browser instance
      if (options?.browserInstanceId) {
        browserInstance = this.browserManager.getInstance(options.browserInstanceId);
        if (!browserInstance) {
          throw new Error('Browser instance not found');
        }
      } else {
        browserInstance = await this.browserManager.createInstance(sessionId);
        shouldCloseBrowser = true;
      }

      const page = this.browserManager.getPage(browserInstance.id);
      if (!page) {
        throw new Error('Page not available');
      }

      // Prepare highlight elements
      let highlightBounds;
      if (options?.highlightElements?.length) {
        highlightBounds = await this.getElementBounds(page, options.highlightElements);
      }

      return await this.screenshotCapture.captureScreenshot(page, {
        fullPage: options?.fullPage,
        highlightElements: highlightBounds,
      });
    } finally {
      // Clean up if we created a temporary browser instance
      if (shouldCloseBrowser && browserInstance) {
        await this.browserManager.closeInstance(browserInstance.id);
      }
    }
  }

  /**
   * Get automation metrics
   */
  getAutomationMetrics(automationId: string): AutomationMetrics | null {
    const automation = this.activeAutomations.get(automationId);
    if (!automation) {
      return null;
    }

    const totalActions = automation.history.length;
    const successfulActions = automation.history.filter(r => r.success).length;
    const failedActions = totalActions - successfulActions;
    
    const totalTime = automation.endTime 
      ? automation.endTime.getTime() - automation.startTime.getTime()
      : Date.now() - automation.startTime.getTime();

    return {
      totalActions,
      successfulActions,
      failedActions,
      totalTime,
      averageActionTime: totalActions > 0 ? totalTime / totalActions : 0,
      successRate: totalActions > 0 ? successfulActions / totalActions : 0,
    };
  }

  /**
   * Clean up completed automations
   */
  async cleanup(): Promise<void> {
    const completedAutomations: string[] = [];
    const now = Date.now();

    for (const [automationId, automation] of this.activeAutomations.entries()) {
      const isCompleted = ['completed', 'failed', 'cancelled'].includes(automation.status);
      const isOld = automation.endTime && (now - automation.endTime.getTime()) > 300000; // 5 minutes

      if (isCompleted && isOld) {
        completedAutomations.push(automationId);
      }
    }

    completedAutomations.forEach(id => this.activeAutomations.delete(id));

    // Clean up browser instances
    await this.browserManager.cleanupOldInstances();

    if (completedAutomations.length > 0) {
      this.logger.info('Cleaned up completed automations', {
        count: completedAutomations.length,
      });
    }
  }

  /**
   * Shutdown automation engine
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down automation engine');

    // Cancel all active automations
    for (const automationId of this.activeAutomations.keys()) {
      await this.cancelAutomation(automationId);
    }

    // Shutdown browser manager
    await this.browserManager.shutdown();

    this.activeAutomations.clear();
    this.logger.info('Automation engine shutdown complete');
  }

  /**
   * Private methods
   */
  private async executeAutomation(
    automationId: string,
    browserInstanceId: string,
    options?: {
      continueOnError?: boolean;
      timeout?: number;
    }
  ): Promise<void> {
    const automation = this.activeAutomations.get(automationId);
    if (!automation || !automation.plan) {
      throw new Error('Automation not found or invalid');
    }

    const page = this.browserManager.getPage(browserInstanceId);
    if (!page) {
      throw new Error('Browser page not available');
    }

    automation.status = 'executing';
    const timeout = options?.timeout || this.config.defaultAutomationTimeout;
    const startTime = Date.now();

    try {
      for (let i = 0; i < automation.plan.steps.length; i++) {
        // Check for cancellation or pause
        if (automation.status === 'cancelled') {
          break;
        }

        while (automation.status === 'paused') {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Check timeout
        if (Date.now() - startTime > timeout) {
          throw new Error('Automation timeout exceeded');
        }

        const step = automation.plan.steps[i];
        automation.currentStep = i;

        this.logger.debug('Executing automation step', {
          automationId,
          stepIndex: i,
          stepDescription: step.description,
        });

        // Execute action
        const result = await this.actionExecutor.executeAction(page, step.action);
        automation.history.push(result);

        // Handle step failure
        if (!result.success) {
          this.logger.warn('Automation step failed', {
            automationId,
            stepIndex: i,
            error: result.error,
          });

          if (!options?.continueOnError) {
            throw new Error(`Step ${i + 1} failed: ${result.error}`);
          }
        }

        // Small delay between steps
        await page.waitForTimeout(500);
      }

      // Mark as completed
      automation.status = 'completed';
      automation.endTime = new Date();

      this.logger.info('Automation completed successfully', {
        automationId,
        totalSteps: automation.plan.steps.length,
        successfulSteps: automation.history.filter(r => r.success).length,
      });
    } catch (error) {
      automation.status = 'failed';
      automation.endTime = new Date();
      automation.error = {
        code: 'AUTOMATION_EXECUTION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        recoverable: false,
        details: { currentStep: automation.currentStep },
      };

      this.logger.error('Automation failed', {
        automationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        currentStep: automation.currentStep,
      });
    } finally {
      // Clean up browser instance
      await this.browserManager.closeInstance(browserInstanceId);
    }
  }

  private handleAutomationError(automationId: string, error: any): void {
    const automation = this.activeAutomations.get(automationId);
    if (automation) {
      automation.status = 'failed';
      automation.endTime = new Date();
      automation.error = {
        code: 'AUTOMATION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        recoverable: false,
        details: error,
      };
    }
  }

  private async extractPageContent(page: Page): Promise<string> {
    return await page.evaluate(() => {
      // Remove script and style elements
      const scripts = document.querySelectorAll('script, style');
      scripts.forEach(el => el.remove());

      // Get text content
      const content = document.body.textContent || '';
      
      // Clean up whitespace
      return content.replace(/\s+/g, ' ').trim();
    });
  }

  private async extractViewportInfo(page: Page): Promise<any> {
    const viewport = page.viewportSize();
    
    return {
      width: viewport?.width || 0,
      height: viewport?.height || 0,
      scrollX: await page.evaluate(() => window.scrollX),
      scrollY: await page.evaluate(() => window.scrollY),
      devicePixelRatio: await page.evaluate(() => window.devicePixelRatio),
    };
  }

  private async getElementBounds(page: Page, selectors: string[]): Promise<any[]> {
    const bounds = [];
    
    for (const selector of selectors) {
      try {
        const element = page.locator(selector).first();
        const box = await element.boundingBox();
        if (box) {
          bounds.push(box);
        }
      } catch (error) {
        // Continue with next selector
      }
    }

    return bounds;
  }
}
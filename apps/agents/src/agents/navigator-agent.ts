import { logger } from '@/utils/logger';
import { MultiLLMService, LLMRequest } from '@/services/ai/multi-llm-service';
import { TaskType, AgentType } from '@browser-ai-agent/shared/types/agent';
import { IAgent, INavigatorAgent } from '@browser-ai-agent/shared/types/agent';
import BrowserManager from '../automation/browser-manager';
import ActionExecutor from '../automation/action-executor';
import AIElementSelector from '../automation/element-selector';

// =============================================================================
// NAVIGATOR AGENT (Superior to Manus Navigation)
// Master Plan: Fast Executor - Mistral-7B for navigation and form interactions
// =============================================================================

export interface NavigationTask {
  id: string;
  type: 'navigate' | 'click' | 'type' | 'scroll' | 'wait' | 'form_fill';
  target: NavigationTarget;
  parameters: Record<string, any>;
  validation?: NavigationValidation;
  retryPolicy: RetryPolicy;
  timeout: number;
}

export interface NavigationTarget {
  url?: string;
  element?: {
    selector?: string;
    description: string;
    type: 'button' | 'input' | 'link' | 'form' | 'any';
    context?: string;
  };
  coordinates?: { x: number; y: number };
}

export interface NavigationValidation {
  expectedUrl?: string;
  expectedElement?: string;
  expectedText?: string;
  customValidator?: (page: any) => Promise<boolean>;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  conditions: string[];
}

export interface NavigationResult {
  success: boolean;
  taskId: string;
  action: string;
  result?: any;
  error?: string;
  duration: number;
  retryCount: number;
  screenshots: string[];
  metadata: {
    url: string;
    title: string;
    timestamp: Date;
    userAgent: string;
  };
}

export interface NavigationContext {
  sessionId: string;
  pageId: string;
  currentUrl: string;
  previousActions: NavigationResult[];
  userPreferences: {
    speed: 'slow' | 'normal' | 'fast';
    humanLike: boolean;
    screenshots: boolean;
  };
}

// =============================================================================
// NAVIGATOR AGENT IMPLEMENTATION
// =============================================================================

export class NavigatorAgent implements INavigatorAgent {
  public readonly id: string;
  public readonly type = AgentType.NAVIGATOR;
  private llmService: MultiLLMService;
  private browserManager: BrowserManager;
  private actionExecutor: ActionExecutor;
  private elementSelector: AIElementSelector;
  private activeContexts: Map<string, NavigationContext> = new Map();
  private taskHistory: Map<string, NavigationResult[]> = new Map();

  constructor(id: string) {
    this.id = id;
    this.llmService = MultiLLMService.getInstance();
    this.browserManager = BrowserManager.getInstance();
    this.actionExecutor = new ActionExecutor();
    this.elementSelector = new AIElementSelector();
    logger.info('Navigator Agent initialized', { id: this.id });
  }

  // =============================================================================
  // CORE AGENT INTERFACE METHODS
  // =============================================================================

  async initialize(): Promise<void> {
    logger.info('Initializing Navigator Agent', { id: this.id });
    // Initialize browser manager and other dependencies
  }

  async start(): Promise<void> {
    logger.info('Starting Navigator Agent', { id: this.id });
  }

  async stop(): Promise<void> {
    logger.info('Stopping Navigator Agent', { id: this.id });
    
    // Clean up active contexts
    for (const [sessionId, context] of this.activeContexts.entries()) {
      await this.cleanupContext(sessionId);
    }
  }

  async executeTask(task: any): Promise<NavigationResult> {
    logger.info('Navigator Agent executing task', {
      taskId: task.id,
      type: task.type,
      agentId: this.id,
    });

    const startTime = Date.now();
    let retryCount = 0;
    let lastError: string | undefined;

    const navigationTask: NavigationTask = this.parseTask(task);

    while (retryCount <= navigationTask.retryPolicy.maxAttempts) {
      try {
        // Get or create navigation context
        const context = await this.getNavigationContext(task.sessionId);
        
        // Execute the navigation task
        const result = await this.executeNavigationTask(navigationTask, context);
        
        // Update context with result
        context.previousActions.push(result);
        
        // Store in history
        if (!this.taskHistory.has(task.userId)) {
          this.taskHistory.set(task.userId, []);
        }
        this.taskHistory.get(task.userId)!.push(result);

        logger.info('Navigation task completed successfully', {
          taskId: task.id,
          action: navigationTask.type,
          duration: result.duration,
          retryCount,
        });

        return result;

      } catch (error) {
        lastError = error.message;
        retryCount++;

        logger.warn('Navigation task failed, retrying', {
          taskId: task.id,
          attempt: retryCount,
          error: lastError,
        });

        if (retryCount <= navigationTask.retryPolicy.maxAttempts) {
          await this.sleep(navigationTask.retryPolicy.backoffMs * retryCount);
        }
      }
    }

    // All retries failed
    const duration = Date.now() - startTime;
    const failedResult: NavigationResult = {
      success: false,
      taskId: task.id,
      action: navigationTask.type,
      error: lastError,
      duration,
      retryCount,
      screenshots: [],
      metadata: {
        url: '',
        title: '',
        timestamp: new Date(),
        userAgent: '',
      },
    };

    logger.error('Navigation task failed after all retries', {
      taskId: task.id,
      retryCount,
      error: lastError,
    });

    return failedResult;
  }

  async sendMessage(message: any): Promise<void> {
    logger.debug('Navigator Agent sending message', { message });
  }

  async receiveMessage(message: any): Promise<void> {
    logger.debug('Navigator Agent received message', { message });
  }

  getStatus(): any {
    return {
      id: this.id,
      type: this.type,
      status: 'active',
      activeContexts: this.activeContexts.size,
      tasksCompleted: Array.from(this.taskHistory.values()).reduce((sum, tasks) => sum + tasks.length, 0),
      lastActivity: new Date(),
    };
  }

  updateStatus(status: any): void {
    // Update agent status
  }

  // =============================================================================
  // NAVIGATION-SPECIFIC METHODS
  // =============================================================================

  async navigateToUrl(url: string, context: NavigationContext): Promise<NavigationResult> {
    const startTime = Date.now();
    
    logger.info('Navigating to URL', { url, sessionId: context.sessionId });

    try {
      const page = await this.browserManager.getPage(context.sessionId, context.pageId);
      if (!page) {
        throw new Error('Browser page not available');
      }

      // Navigate to URL
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // Wait for page to stabilize
      await this.waitForPageStability(page);

      // Update context
      context.currentUrl = page.url();

      const duration = Date.now() - startTime;

      return {
        success: true,
        taskId: `nav_${Date.now()}`,
        action: 'navigate',
        result: { url: page.url(), title: await page.title() },
        duration,
        retryCount: 0,
        screenshots: [],
        metadata: {
          url: page.url(),
          title: await page.title(),
          timestamp: new Date(),
          userAgent: await page.evaluate(() => navigator.userAgent),
        },
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Navigation failed', {
        url,
        error: error.message,
      });

      return {
        success: false,
        taskId: `nav_${Date.now()}`,
        action: 'navigate',
        error: error.message,
        duration,
        retryCount: 0,
        screenshots: [],
        metadata: {
          url: '',
          title: '',
          timestamp: new Date(),
          userAgent: '',
        },
      };
    }
  }

  async clickElement(target: NavigationTarget, context: NavigationContext): Promise<NavigationResult> {
    const startTime = Date.now();
    
    logger.info('Clicking element', {
      description: target.element?.description,
      sessionId: context.sessionId,
    });

    try {
      const page = await this.browserManager.getPage(context.sessionId, context.pageId);
      if (!page) {
        throw new Error('Browser page not available');
      }

      if (!target.element) {
        throw new Error('Element target is required for click action');
      }

      // Use AI element selector to find the element
      const elementContext = {
        description: target.element.description,
        expectedType: target.element.type,
        nearbyText: target.element.context,
      };

      const actionResult = await this.actionExecutor.click(page, elementContext);

      const duration = Date.now() - startTime;

      return {
        success: actionResult.success,
        taskId: `click_${Date.now()}`,
        action: 'click',
        result: actionResult,
        error: actionResult.success ? undefined : 'Click action failed',
        duration,
        retryCount: actionResult.retryCount,
        screenshots: [],
        metadata: {
          url: page.url(),
          title: await page.title(),
          timestamp: new Date(),
          userAgent: await page.evaluate(() => navigator.userAgent),
        },
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Click action failed', {
        description: target.element?.description,
        error: error.message,
      });

      return {
        success: false,
        taskId: `click_${Date.now()}`,
        action: 'click',
        error: error.message,
        duration,
        retryCount: 0,
        screenshots: [],
        metadata: {
          url: '',
          title: '',
          timestamp: new Date(),
          userAgent: '',
        },
      };
    }
  }

  async typeText(target: NavigationTarget, text: string, context: NavigationContext): Promise<NavigationResult> {
    const startTime = Date.now();
    
    logger.info('Typing text', {
      description: target.element?.description,
      textLength: text.length,
      sessionId: context.sessionId,
    });

    try {
      const page = await this.browserManager.getPage(context.sessionId, context.pageId);
      if (!page) {
        throw new Error('Browser page not available');
      }

      if (!target.element) {
        throw new Error('Element target is required for type action');
      }

      // Use AI element selector to find the input element
      const elementContext = {
        description: target.element.description,
        expectedType: target.element.type,
        nearbyText: target.element.context,
      };

      const actionResult = await this.actionExecutor.type(page, elementContext, text, {
        humanLike: context.userPreferences.humanLike,
        clear: true,
      });

      const duration = Date.now() - startTime;

      return {
        success: actionResult.success,
        taskId: `type_${Date.now()}`,
        action: 'type',
        result: actionResult,
        error: actionResult.success ? undefined : 'Type action failed',
        duration,
        retryCount: actionResult.retryCount,
        screenshots: [],
        metadata: {
          url: page.url(),
          title: await page.title(),
          timestamp: new Date(),
          userAgent: await page.evaluate(() => navigator.userAgent),
        },
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Type action failed', {
        description: target.element?.description,
        error: error.message,
      });

      return {
        success: false,
        taskId: `type_${Date.now()}`,
        action: 'type',
        error: error.message,
        duration,
        retryCount: 0,
        screenshots: [],
        metadata: {
          url: '',
          title: '',
          timestamp: new Date(),
          userAgent: '',
        },
      };
    }
  }

  async fillForm(formData: Record<string, string>, context: NavigationContext): Promise<NavigationResult> {
    const startTime = Date.now();
    
    logger.info('Filling form', {
      fields: Object.keys(formData).length,
      sessionId: context.sessionId,
    });

    try {
      const page = await this.browserManager.getPage(context.sessionId, context.pageId);
      if (!page) {
        throw new Error('Browser page not available');
      }

      const results: any[] = [];

      // Fill each form field
      for (const [fieldName, value] of Object.entries(formData)) {
        try {
          // Use AI to understand the field and find appropriate input
          const fieldDescription = await this.generateFieldDescription(fieldName, value);
          
          const elementContext = {
            description: fieldDescription,
            expectedType: 'input' as const,
            attributes: { name: fieldName },
          };

          const actionResult = await this.actionExecutor.type(page, elementContext, value, {
            humanLike: context.userPreferences.humanLike,
            clear: true,
          });

          results.push({
            field: fieldName,
            success: actionResult.success,
            error: actionResult.success ? undefined : 'Field fill failed',
          });

          // Small delay between fields for human-like behavior
          if (context.userPreferences.humanLike) {
            await this.sleep(Math.random() * 500 + 200);
          }

        } catch (error) {
          results.push({
            field: fieldName,
            success: false,
            error: error.message,
          });
        }
      }

      const duration = Date.now() - startTime;
      const successCount = results.filter(r => r.success).length;
      const success = successCount === results.length;

      return {
        success,
        taskId: `form_${Date.now()}`,
        action: 'form_fill',
        result: {
          totalFields: results.length,
          successfulFields: successCount,
          results,
        },
        error: success ? undefined : `Failed to fill ${results.length - successCount} fields`,
        duration,
        retryCount: 0,
        screenshots: [],
        metadata: {
          url: page.url(),
          title: await page.title(),
          timestamp: new Date(),
          userAgent: await page.evaluate(() => navigator.userAgent),
        },
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Form fill failed', {
        error: error.message,
      });

      return {
        success: false,
        taskId: `form_${Date.now()}`,
        action: 'form_fill',
        error: error.message,
        duration,
        retryCount: 0,
        screenshots: [],
        metadata: {
          url: '',
          title: '',
          timestamp: new Date(),
          userAgent: '',
        },
      };
    }
  }

  async scrollPage(direction: 'up' | 'down' | 'left' | 'right', amount: number, context: NavigationContext): Promise<NavigationResult> {
    const startTime = Date.now();
    
    logger.info('Scrolling page', {
      direction,
      amount,
      sessionId: context.sessionId,
    });

    try {
      const page = await this.browserManager.getPage(context.sessionId, context.pageId);
      if (!page) {
        throw new Error('Browser page not available');
      }

      const actionResult = await this.actionExecutor.scroll(page, {
        direction,
        amount,
        smooth: context.userPreferences.humanLike,
      });

      const duration = Date.now() - startTime;

      return {
        success: actionResult.success,
        taskId: `scroll_${Date.now()}`,
        action: 'scroll',
        result: actionResult,
        error: actionResult.success ? undefined : 'Scroll action failed',
        duration,
        retryCount: actionResult.retryCount,
        screenshots: [],
        metadata: {
          url: page.url(),
          title: await page.title(),
          timestamp: new Date(),
          userAgent: await page.evaluate(() => navigator.userAgent),
        },
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Scroll action failed', {
        direction,
        error: error.message,
      });

      return {
        success: false,
        taskId: `scroll_${Date.now()}`,
        action: 'scroll',
        error: error.message,
        duration,
        retryCount: 0,
        screenshots: [],
        metadata: {
          url: '',
          title: '',
          timestamp: new Date(),
          userAgent: '',
        },
      };
    }
  }

  // =============================================================================
  // AI-POWERED NAVIGATION INTELLIGENCE
  // =============================================================================

  async analyzePageForNavigation(context: NavigationContext): Promise<any> {
    logger.info('Analyzing page for navigation opportunities', {
      sessionId: context.sessionId,
    });

    try {
      const page = await this.browserManager.getPage(context.sessionId, context.pageId);
      if (!page) {
        throw new Error('Browser page not available');
      }

      // Get page content and structure
      const pageInfo = await page.evaluate(() => ({
        url: window.location.href,
        title: document.title,
        forms: Array.from(document.forms).map(form => ({
          id: form.id,
          name: form.name,
          action: form.action,
          method: form.method,
          fields: Array.from(form.elements).map(el => ({
            name: el.name,
            type: el.type,
            placeholder: el.placeholder,
            required: el.required,
          })),
        })),
        links: Array.from(document.links).slice(0, 20).map(link => ({
          href: link.href,
          text: link.textContent?.trim(),
          title: link.title,
        })),
        buttons: Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]')).slice(0, 20).map(btn => ({
          text: btn.textContent?.trim(),
          type: btn.type,
          name: btn.name,
        })),
      }));

      // Use AI to analyze navigation opportunities
      const llmRequest: LLMRequest = {
        taskContext: {
          type: TaskType.DATA_EXTRACTION,
          agent_type: AgentType.NAVIGATOR,
          complexity: 'medium',
          priority: 'normal',
          user_tier: 'premium',
        },
        messages: [
          {
            role: 'user',
            content: `Analyze this page for navigation opportunities:

URL: ${pageInfo.url}
Title: ${pageInfo.title}

Forms: ${JSON.stringify(pageInfo.forms, null, 2)}
Links: ${JSON.stringify(pageInfo.links, null, 2)}
Buttons: ${JSON.stringify(pageInfo.buttons, null, 2)}

Provide navigation recommendations including:
1. Key interactive elements
2. Suggested navigation paths
3. Form filling opportunities
4. Potential automation workflows

Return as JSON with structured recommendations.`,
          },
        ],
        systemPrompt: 'You are an expert web navigation analyst. Provide actionable navigation recommendations for browser automation.',
        temperature: 0.3,
      };

      const response = await this.llmService.complete(llmRequest);
      
      try {
        const analysis = JSON.parse(response.content);
        
        logger.info('Page navigation analysis completed', {
          sessionId: context.sessionId,
          recommendations: analysis.recommendations?.length || 0,
        });

        return analysis;
      } catch (parseError) {
        logger.warn('Failed to parse navigation analysis', {
          response: response.content,
          error: parseError.message,
        });
        return { error: 'Failed to parse analysis' };
      }

    } catch (error) {
      logger.error('Page navigation analysis failed', {
        sessionId: context.sessionId,
        error: error.message,
      });
      return { error: error.message };
    }
  }

  async optimizeNavigationPath(steps: NavigationTask[]): Promise<NavigationTask[]> {
    logger.info('Optimizing navigation path', { steps: steps.length });

    try {
      const llmRequest: LLMRequest = {
        taskContext: {
          type: TaskType.CUSTOM_WORKFLOW,
          agent_type: AgentType.NAVIGATOR,
          complexity: 'high',
          priority: 'normal',
          user_tier: 'premium',
        },
        messages: [
          {
            role: 'user',
            content: `Optimize this navigation sequence for efficiency and reliability:

Steps: ${JSON.stringify(steps, null, 2)}

Consider:
1. Step dependencies and ordering
2. Wait times and page load optimization
3. Error handling and retry strategies
4. Human-like behavior patterns
5. Performance optimization

Return optimized steps as JSON array with the same structure.`,
          },
        ],
        systemPrompt: 'You are an expert navigation optimizer. Improve navigation sequences for speed, reliability, and human-like behavior.',
        temperature: 0.2,
      };

      const response = await this.llmService.complete(llmRequest);
      
      try {
        const optimizedSteps = JSON.parse(response.content);
        
        logger.info('Navigation path optimized', {
          originalSteps: steps.length,
          optimizedSteps: optimizedSteps.length,
        });

        return optimizedSteps;
      } catch (parseError) {
        logger.warn('Failed to parse optimized navigation path', {
          error: parseError.message,
        });
        return steps; // Return original if parsing fails
      }

    } catch (error) {
      logger.error('Navigation path optimization failed', {
        error: error.message,
      });
      return steps; // Return original if optimization fails
    }
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  private parseTask(task: any): NavigationTask {
    return {
      id: task.id,
      type: task.type || 'navigate',
      target: task.target || {},
      parameters: task.parameters || {},
      validation: task.validation,
      retryPolicy: task.retryPolicy || {
        maxAttempts: 3,
        backoffMs: 1000,
        conditions: ['network_error', 'element_not_found'],
      },
      timeout: task.timeout || 30000,
    };
  }

  private async executeNavigationTask(task: NavigationTask, context: NavigationContext): Promise<NavigationResult> {
    switch (task.type) {
      case 'navigate':
        return await this.navigateToUrl(task.target.url!, context);
      case 'click':
        return await this.clickElement(task.target, context);
      case 'type':
        return await this.typeText(task.target, task.parameters.text, context);
      case 'form_fill':
        return await this.fillForm(task.parameters.formData, context);
      case 'scroll':
        return await this.scrollPage(
          task.parameters.direction,
          task.parameters.amount || 500,
          context
        );
      case 'wait':
        await this.sleep(task.parameters.duration || 1000);
        return {
          success: true,
          taskId: task.id,
          action: 'wait',
          duration: task.parameters.duration || 1000,
          retryCount: 0,
          screenshots: [],
          metadata: {
            url: context.currentUrl,
            title: '',
            timestamp: new Date(),
            userAgent: '',
          },
        };
      default:
        throw new Error(`Unknown navigation task type: ${task.type}`);
    }
  }

  private async getNavigationContext(sessionId: string): Promise<NavigationContext> {
    let context = this.activeContexts.get(sessionId);
    
    if (!context) {
      // Create new context
      const pageId = await this.browserManager.createPage(sessionId);
      
      context = {
        sessionId,
        pageId,
        currentUrl: '',
        previousActions: [],
        userPreferences: {
          speed: 'normal',
          humanLike: true,
          screenshots: true,
        },
      };
      
      this.activeContexts.set(sessionId, context);
    }
    
    return context;
  }

  private async cleanupContext(sessionId: string): Promise<void> {
    const context = this.activeContexts.get(sessionId);
    if (context) {
      // Close browser page if needed
      // await this.browserManager.closePage(sessionId, context.pageId);
      this.activeContexts.delete(sessionId);
    }
  }

  private async generateFieldDescription(fieldName: string, value: string): Promise<string> {
    // Generate human-readable description for form fields
    const fieldMappings: Record<string, string> = {
      email: 'email input field',
      password: 'password input field',
      username: 'username input field',
      firstName: 'first name input field',
      lastName: 'last name input field',
      phone: 'phone number input field',
      address: 'address input field',
      city: 'city input field',
      state: 'state input field',
      zip: 'zip code input field',
      country: 'country input field',
    };

    return fieldMappings[fieldName] || `${fieldName} input field`;
  }

  private async waitForPageStability(page: any): Promise<void> {
    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch (error) {
      // If network idle fails, just wait a bit
      await this.sleep(2000);
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // =============================================================================
  // PUBLIC API METHODS
  // =============================================================================

  public getTaskHistory(userId: string): NavigationResult[] {
    return this.taskHistory.get(userId) || [];
  }

  public getActiveContexts(): string[] {
    return Array.from(this.activeContexts.keys());
  }

  public async getContextInfo(sessionId: string): Promise<NavigationContext | null> {
    return this.activeContexts.get(sessionId) || null;
  }

  public getStats(): any {
    return {
      id: this.id,
      type: this.type,
      activeContexts: this.activeContexts.size,
      totalTasks: Array.from(this.taskHistory.values()).reduce((sum, tasks) => sum + tasks.length, 0),
      successRate: this.calculateSuccessRate(),
      averageTaskDuration: this.calculateAverageTaskDuration(),
    };
  }

  private calculateSuccessRate(): number {
    const allTasks = Array.from(this.taskHistory.values()).flat();
    if (allTasks.length === 0) return 0;
    
    const successfulTasks = allTasks.filter(task => task.success).length;
    return successfulTasks / allTasks.length;
  }

  private calculateAverageTaskDuration(): number {
    const allTasks = Array.from(this.taskHistory.values()).flat();
    if (allTasks.length === 0) return 0;
    
    const totalDuration = allTasks.reduce((sum, task) => sum + task.duration, 0);
    return totalDuration / allTasks.length;
  }
}

export default NavigatorAgent;
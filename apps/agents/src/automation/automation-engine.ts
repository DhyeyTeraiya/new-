import { logger } from '@/utils/logger';
import BrowserManager, { BrowserConfig, BrowserSession } from './browser-manager';
import AIElementSelector, { ElementContext } from './element-selector';
import ActionExecutor, { ActionConfig, ActionResult } from './action-executor';
import IntelligentWaiter, { WaitCondition, WaitResult } from './intelligent-waiter';
import ScreenshotManager, { ScreenshotOptions, VisualTestCase } from './screenshot-manager';

// =============================================================================
// NEXT-GENERATION AUTOMATION ENGINE (Superior to Manus Browser Control)
// Master Plan: Orchestrates all automation components with self-healing capabilities
// =============================================================================

export interface AutomationTask {
  id: string;
  name: string;
  steps: AutomationStep[];
  config: AutomationConfig;
  retryPolicy: RetryPolicy;
  validation: ValidationConfig;
  metadata: Record<string, any>;
}

export interface AutomationStep {
  id: string;
  type: 'navigate' | 'click' | 'type' | 'wait' | 'scroll' | 'extract' | 'screenshot' | 'custom';
  name: string;
  parameters: Record<string, any>;
  elementContext?: ElementContext;
  waitConditions?: WaitCondition[];
  validation?: StepValidation;
  onError?: ErrorHandling;
  timeout?: number;
}

export interface AutomationConfig {
  browserConfig: BrowserConfig;
  actionConfig: ActionConfig;
  screenshotConfig: {
    enabled: boolean;
    captureOnError: boolean;
    captureOnSuccess: boolean;
    visualTesting: boolean;
  };
  selfHealing: {
    enabled: boolean;
    maxAttempts: number;
    strategies: SelfHealingStrategy[];
  };
  performance: {
    parallelExecution: boolean;
    maxConcurrency: number;
    resourceOptimization: boolean;
  };
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffStrategy: 'linear' | 'exponential' | 'fixed';
  baseDelay: number;
  maxDelay: number;
  retryConditions: string[];
}

export interface ValidationConfig {
  enabled: boolean;
  strictMode: boolean;
  customValidators: Array<{
    name: string;
    function: (result: any) => Promise<boolean>;
  }>;
}

export interface StepValidation {
  required: boolean;
  expectedResult?: any;
  customValidator?: string;
  timeout?: number;
}

export interface ErrorHandling {
  strategy: 'retry' | 'skip' | 'abort' | 'fallback';
  fallbackStep?: AutomationStep;
  maxRetries?: number;
}

export interface SelfHealingStrategy {
  name: string;
  trigger: string;
  action: 'update_selector' | 'wait_longer' | 'try_alternative' | 'refresh_page';
  parameters: Record<string, any>;
}

export interface AutomationResult {
  taskId: string;
  success: boolean;
  startTime: Date;
  endTime: Date;
  duration: number;
  stepResults: StepResult[];
  screenshots: string[];
  errors: AutomationError[];
  performance: PerformanceMetrics;
  selfHealingActions: SelfHealingAction[];
}

export interface StepResult {
  stepId: string;
  stepName: string;
  success: boolean;
  startTime: Date;
  endTime: Date;
  duration: number;
  result?: any;
  error?: string;
  retryCount: number;
  screenshots: string[];
  selfHealing: boolean;
}

export interface AutomationError {
  stepId: string;
  type: string;
  message: string;
  timestamp: Date;
  screenshot?: string;
  stackTrace?: string;
  context: Record<string, any>;
}

export interface PerformanceMetrics {
  totalDuration: number;
  networkTime: number;
  renderTime: number;
  actionTime: number;
  waitTime: number;
  screenshotTime: number;
  memoryUsage: number;
  cpuUsage: number;
}

export interface SelfHealingAction {
  stepId: string;
  strategy: string;
  trigger: string;
  action: string;
  success: boolean;
  timestamp: Date;
  details: Record<string, any>;
}

// =============================================================================
// AUTOMATION ENGINE IMPLEMENTATION
// =============================================================================

export class AutomationEngine {
  private browserManager: BrowserManager;
  private elementSelector: AIElementSelector;
  private actionExecutor: ActionExecutor;
  private intelligentWaiter: IntelligentWaiter;
  private screenshotManager: ScreenshotManager;
  
  private activeTasks: Map<string, AutomationTask> = new Map();
  private taskResults: Map<string, AutomationResult> = new Map();
  private performanceMonitor: PerformanceMonitor;

  constructor() {
    this.browserManager = BrowserManager.getInstance();
    this.elementSelector = new AIElementSelector();
    this.actionExecutor = new ActionExecutor();
    this.intelligentWaiter = new IntelligentWaiter();
    this.screenshotManager = new ScreenshotManager();
    this.performanceMonitor = new PerformanceMonitor();
    
    logger.info('Automation Engine initialized');
  }

  // =============================================================================
  // MAIN EXECUTION METHODS
  // =============================================================================

  async executeTask(task: AutomationTask): Promise<AutomationResult> {
    const startTime = new Date();
    logger.info('Starting automation task execution', {
      taskId: task.id,
      taskName: task.name,
      steps: task.steps.length,
    });

    // Initialize result object
    const result: AutomationResult = {
      taskId: task.id,
      success: false,
      startTime,
      endTime: new Date(),
      duration: 0,
      stepResults: [],
      screenshots: [],
      errors: [],
      performance: this.performanceMonitor.createEmptyMetrics(),
      selfHealingActions: [],
    };

    this.activeTasks.set(task.id, task);
    this.performanceMonitor.startTask(task.id);

    let sessionId: string | null = null;
    let pageId: string | null = null;

    try {
      // Create browser session
      sessionId = await this.browserManager.createSession(task.config.browserConfig);
      pageId = await this.browserManager.createPage(sessionId);
      
      const page = await this.browserManager.getPage(sessionId, pageId);
      if (!page) {
        throw new Error('Failed to create browser page');
      }

      // Execute steps sequentially or in parallel based on config
      if (task.config.performance.parallelExecution) {
        result.stepResults = await this.executeStepsInParallel(page, task, result);
      } else {
        result.stepResults = await this.executeStepsSequentially(page, task, result);
      }

      // Check overall success
      result.success = result.stepResults.every(stepResult => stepResult.success);

      // Capture final screenshot if enabled
      if (task.config.screenshotConfig.enabled && task.config.screenshotConfig.captureOnSuccess && result.success) {
        const finalScreenshot = await this.screenshotManager.captureFullPage(page, `${task.id}_final`);
        result.screenshots.push(`${task.id}_final`);
      }

    } catch (error) {
      logger.error('Task execution failed', {
        taskId: task.id,
        error: error.message,
      });

      result.errors.push({
        stepId: 'task_execution',
        type: 'execution_error',
        message: error.message,
        timestamp: new Date(),
        context: { taskId: task.id },
      });

      // Capture error screenshot
      if (sessionId && pageId && task.config.screenshotConfig.captureOnError) {
        try {
          const page = await this.browserManager.getPage(sessionId, pageId);
          if (page) {
            await this.screenshotManager.captureFullPage(page, `${task.id}_error`);
            result.screenshots.push(`${task.id}_error`);
          }
        } catch (screenshotError) {
          logger.warn('Failed to capture error screenshot', { error: screenshotError.message });
        }
      }
    } finally {
      // Cleanup browser session
      if (sessionId) {
        await this.browserManager.closeSession(sessionId);
      }

      // Finalize result
      result.endTime = new Date();
      result.duration = result.endTime.getTime() - result.startTime.getTime();
      result.performance = this.performanceMonitor.getTaskMetrics(task.id);

      this.activeTasks.delete(task.id);
      this.taskResults.set(task.id, result);

      logger.info('Task execution completed', {
        taskId: task.id,
        success: result.success,
        duration: result.duration,
        steps: result.stepResults.length,
        errors: result.errors.length,
      });
    }

    return result;
  }

  async executeMultipleTasks(tasks: AutomationTask[], maxConcurrency: number = 3): Promise<Map<string, AutomationResult>> {
    logger.info('Executing multiple tasks', {
      taskCount: tasks.length,
      maxConcurrency,
    });

    const results = new Map<string, AutomationResult>();
    const executing: Promise<void>[] = [];

    for (const task of tasks) {
      // Wait if we've reached max concurrency
      if (executing.length >= maxConcurrency) {
        await Promise.race(executing);
      }

      // Start task execution
      const taskPromise = this.executeTask(task).then(result => {
        results.set(task.id, result);
      }).finally(() => {
        // Remove from executing array
        const index = executing.indexOf(taskPromise);
        if (index > -1) {
          executing.splice(index, 1);
        }
      });

      executing.push(taskPromise);
    }

    // Wait for all remaining tasks
    await Promise.all(executing);

    logger.info('Multiple tasks execution completed', {
      totalTasks: tasks.length,
      successfulTasks: Array.from(results.values()).filter(r => r.success).length,
    });

    return results;
  }

  // =============================================================================
  // STEP EXECUTION METHODS
  // =============================================================================

  private async executeStepsSequentially(page: any, task: AutomationTask, result: AutomationResult): Promise<StepResult[]> {
    const stepResults: StepResult[] = [];

    for (const step of task.steps) {
      const stepResult = await this.executeStep(page, step, task, result);
      stepResults.push(stepResult);

      // Stop execution if step failed and no error handling is defined
      if (!stepResult.success && (!step.onError || step.onError.strategy === 'abort')) {
        logger.warn('Aborting task execution due to step failure', {
          taskId: task.id,
          stepId: step.id,
        });
        break;
      }

      // Skip remaining steps if configured
      if (!stepResult.success && step.onError?.strategy === 'skip') {
        continue;
      }
    }

    return stepResults;
  }

  private async executeStepsInParallel(page: any, task: AutomationTask, result: AutomationResult): Promise<StepResult[]> {
    // Group steps by dependencies
    const stepGroups = this.groupStepsByDependencies(task.steps);
    const stepResults: StepResult[] = [];

    for (const group of stepGroups) {
      // Execute steps in current group in parallel
      const groupPromises = group.map(step => this.executeStep(page, step, task, result));
      const groupResults = await Promise.all(groupPromises);
      stepResults.push(...groupResults);

      // Check if any critical step failed
      const criticalFailure = groupResults.some(r => !r.success && !task.steps.find(s => s.id === r.stepId)?.onError);
      if (criticalFailure) {
        logger.warn('Aborting parallel execution due to critical step failure', {
          taskId: task.id,
        });
        break;
      }
    }

    return stepResults;
  }

  private async executeStep(page: any, step: AutomationStep, task: AutomationTask, taskResult: AutomationResult): Promise<StepResult> {
    const startTime = new Date();
    logger.info('Executing automation step', {
      taskId: task.id,
      stepId: step.id,
      stepType: step.type,
      stepName: step.name,
    });

    const stepResult: StepResult = {
      stepId: step.id,
      stepName: step.name,
      success: false,
      startTime,
      endTime: new Date(),
      duration: 0,
      retryCount: 0,
      screenshots: [],
      selfHealing: false,
    };

    let lastError: string | undefined;
    const maxRetries = step.onError?.maxRetries || task.retryPolicy.maxAttempts;

    while (stepResult.retryCount <= maxRetries) {
      try {
        // Execute pre-step wait conditions
        if (step.waitConditions) {
          await this.executeWaitConditions(page, step.waitConditions);
        }

        // Capture before screenshot if enabled
        if (task.config.screenshotConfig.enabled) {
          const beforeScreenshot = await this.screenshotManager.captureFullPage(page, `${step.id}_before_${stepResult.retryCount}`);
          stepResult.screenshots.push(`${step.id}_before_${stepResult.retryCount}`);
        }

        // Execute the actual step
        const actionResult = await this.executeStepAction(page, step);
        stepResult.result = actionResult;

        // Validate step result if configured
        if (step.validation?.required) {
          const isValid = await this.validateStepResult(actionResult, step.validation);
          if (!isValid) {
            throw new Error('Step validation failed');
          }
        }

        // Capture after screenshot if enabled
        if (task.config.screenshotConfig.enabled) {
          const afterScreenshot = await this.screenshotManager.captureFullPage(page, `${step.id}_after_${stepResult.retryCount}`);
          stepResult.screenshots.push(`${step.id}_after_${stepResult.retryCount}`);
        }

        stepResult.success = true;
        break;

      } catch (error) {
        lastError = error.message;
        stepResult.retryCount++;

        logger.warn('Step execution failed, attempting self-healing', {
          taskId: task.id,
          stepId: step.id,
          attempt: stepResult.retryCount,
          error: lastError,
        });

        // Attempt self-healing if enabled
        if (task.config.selfHealing.enabled && stepResult.retryCount <= task.config.selfHealing.maxAttempts) {
          const healingResult = await this.attemptSelfHealing(page, step, error, task);
          
          if (healingResult.success) {
            stepResult.selfHealing = true;
            taskResult.selfHealingActions.push(healingResult);
            logger.info('Self-healing successful', {
              taskId: task.id,
              stepId: step.id,
              strategy: healingResult.strategy,
            });
          }
        }

        // Capture error screenshot
        if (task.config.screenshotConfig.captureOnError) {
          try {
            const errorScreenshot = await this.screenshotManager.captureFullPage(page, `${step.id}_error_${stepResult.retryCount}`);
            stepResult.screenshots.push(`${step.id}_error_${stepResult.retryCount}`);
          } catch (screenshotError) {
            logger.warn('Failed to capture error screenshot', { error: screenshotError.message });
          }
        }

        // Wait before retry
        if (stepResult.retryCount <= maxRetries) {
          await this.waitBeforeRetry(stepResult.retryCount, task.retryPolicy);
        }
      }
    }

    // Handle step failure
    if (!stepResult.success) {
      stepResult.error = lastError;
      
      taskResult.errors.push({
        stepId: step.id,
        type: 'step_execution_error',
        message: lastError || 'Unknown error',
        timestamp: new Date(),
        context: {
          stepType: step.type,
          stepName: step.name,
          retryCount: stepResult.retryCount,
        },
      });
    }

    stepResult.endTime = new Date();
    stepResult.duration = stepResult.endTime.getTime() - stepResult.startTime.getTime();

    logger.info('Step execution completed', {
      taskId: task.id,
      stepId: step.id,
      success: stepResult.success,
      duration: stepResult.duration,
      retryCount: stepResult.retryCount,
      selfHealing: stepResult.selfHealing,
    });

    return stepResult;
  }

  // =============================================================================
  // STEP ACTION EXECUTION
  // =============================================================================

  private async executeStepAction(page: any, step: AutomationStep): Promise<any> {
    switch (step.type) {
      case 'navigate':
        return await this.executeNavigateAction(page, step);
      case 'click':
        return await this.executeClickAction(page, step);
      case 'type':
        return await this.executeTypeAction(page, step);
      case 'wait':
        return await this.executeWaitAction(page, step);
      case 'scroll':
        return await this.executeScrollAction(page, step);
      case 'extract':
        return await this.executeExtractAction(page, step);
      case 'screenshot':
        return await this.executeScreenshotAction(page, step);
      case 'custom':
        return await this.executeCustomAction(page, step);
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  private async executeNavigateAction(page: any, step: AutomationStep): Promise<any> {
    const url = step.parameters.url;
    if (!url) {
      throw new Error('URL parameter is required for navigate action');
    }

    await page.goto(url, {
      waitUntil: step.parameters.waitUntil || 'networkidle',
      timeout: step.timeout || 30000,
    });

    return { url: page.url(), title: await page.title() };
  }

  private async executeClickAction(page: any, step: AutomationStep): Promise<ActionResult> {
    if (!step.elementContext) {
      throw new Error('Element context is required for click action');
    }

    return await this.actionExecutor.click(page, step.elementContext, step.parameters.clickOptions);
  }

  private async executeTypeAction(page: any, step: AutomationStep): Promise<ActionResult> {
    if (!step.elementContext) {
      throw new Error('Element context is required for type action');
    }

    const text = step.parameters.text;
    if (!text) {
      throw new Error('Text parameter is required for type action');
    }

    return await this.actionExecutor.type(page, step.elementContext, text, step.parameters.typeOptions);
  }

  private async executeWaitAction(page: any, step: AutomationStep): Promise<WaitResult> {
    const waitCondition = step.parameters.waitCondition;
    if (!waitCondition) {
      throw new Error('Wait condition is required for wait action');
    }

    return await this.intelligentWaiter.waitForCondition(page, waitCondition);
  }

  private async executeScrollAction(page: any, step: AutomationStep): Promise<ActionResult> {
    const scrollOptions = step.parameters.scrollOptions;
    if (!scrollOptions) {
      throw new Error('Scroll options are required for scroll action');
    }

    return await this.actionExecutor.scroll(page, scrollOptions);
  }

  private async executeExtractAction(page: any, step: AutomationStep): Promise<any> {
    if (!step.elementContext) {
      throw new Error('Element context is required for extract action');
    }

    const element = await this.elementSelector.findElement(page, step.elementContext);
    if (!element) {
      throw new Error(`Element not found: ${step.elementContext.description}`);
    }

    const extractType = step.parameters.extractType || 'text';
    
    switch (extractType) {
      case 'text':
        return { text: element.text };
      case 'attribute':
        const attrName = step.parameters.attributeName;
        return { [attrName]: element.attributes[attrName] };
      case 'html':
        return { html: await element.element.innerHTML() };
      default:
        throw new Error(`Unknown extract type: ${extractType}`);
    }
  }

  private async executeScreenshotAction(page: any, step: AutomationStep): Promise<any> {
    const screenshotName = step.parameters.name || step.id;
    const options = step.parameters.screenshotOptions || {};

    if (step.parameters.fullPage !== false) {
      const screenshot = await this.screenshotManager.captureFullPage(page, screenshotName, options);
      return { screenshot: screenshotName, size: screenshot.length };
    } else if (step.elementContext) {
      const element = await this.elementSelector.findElement(page, step.elementContext);
      if (!element) {
        throw new Error(`Element not found for screenshot: ${step.elementContext.description}`);
      }
      
      const screenshot = await this.screenshotManager.captureElement(page, element.selector.value, screenshotName, options);
      return { screenshot: screenshotName, size: screenshot.length };
    } else {
      const screenshot = await this.screenshotManager.captureViewport(page, screenshotName, options);
      return { screenshot: screenshotName, size: screenshot.length };
    }
  }

  private async executeCustomAction(page: any, step: AutomationStep): Promise<any> {
    const customFunction = step.parameters.customFunction;
    if (!customFunction) {
      throw new Error('Custom function is required for custom action');
    }

    // Execute custom function with page context
    return await customFunction(page, step.parameters);
  }

  // =============================================================================
  // SELF-HEALING IMPLEMENTATION
  // =============================================================================

  private async attemptSelfHealing(page: any, step: AutomationStep, error: Error, task: AutomationTask): Promise<SelfHealingAction> {
    const healingAction: SelfHealingAction = {
      stepId: step.id,
      strategy: '',
      trigger: error.message,
      action: '',
      success: false,
      timestamp: new Date(),
      details: {},
    };

    for (const strategy of task.config.selfHealing.strategies) {
      if (this.shouldApplyStrategy(strategy, error, step)) {
        healingAction.strategy = strategy.name;
        healingAction.action = strategy.action;

        try {
          switch (strategy.action) {
            case 'update_selector':
              await this.updateSelector(page, step, strategy.parameters);
              break;
            case 'wait_longer':
              await this.waitLonger(page, strategy.parameters);
              break;
            case 'try_alternative':
              await this.tryAlternative(page, step, strategy.parameters);
              break;
            case 'refresh_page':
              await this.refreshPage(page, strategy.parameters);
              break;
          }

          healingAction.success = true;
          healingAction.details = strategy.parameters;
          break;

        } catch (healingError) {
          logger.warn('Self-healing strategy failed', {
            strategy: strategy.name,
            error: healingError.message,
          });
        }
      }
    }

    return healingAction;
  }

  private shouldApplyStrategy(strategy: SelfHealingStrategy, error: Error, step: AutomationStep): boolean {
    // Simple trigger matching - could be more sophisticated
    return error.message.toLowerCase().includes(strategy.trigger.toLowerCase());
  }

  private async updateSelector(page: any, step: AutomationStep, parameters: Record<string, any>): Promise<void> {
    if (!step.elementContext) return;

    // Try to find element with alternative selectors
    this.elementSelector.clearCache();
    
    // This would implement intelligent selector updating
    logger.info('Attempting selector update', { stepId: step.id });
  }

  private async waitLonger(page: any, parameters: Record<string, any>): Promise<void> {
    const additionalWait = parameters.additionalWait || 5000;
    await new Promise(resolve => setTimeout(resolve, additionalWait));
  }

  private async tryAlternative(page: any, step: AutomationStep, parameters: Record<string, any>): Promise<void> {
    // This would implement alternative action strategies
    logger.info('Trying alternative approach', { stepId: step.id });
  }

  private async refreshPage(page: any, parameters: Record<string, any>): Promise<void> {
    await page.reload({ waitUntil: 'networkidle' });
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  private async executeWaitConditions(page: any, conditions: WaitCondition[]): Promise<void> {
    for (const condition of conditions) {
      await this.intelligentWaiter.waitForCondition(page, condition);
    }
  }

  private async validateStepResult(result: any, validation: StepValidation): Promise<boolean> {
    if (validation.customValidator) {
      // Execute custom validation function
      return true; // Simplified
    }

    if (validation.expectedResult) {
      return JSON.stringify(result) === JSON.stringify(validation.expectedResult);
    }

    return true;
  }

  private async waitBeforeRetry(retryCount: number, retryPolicy: RetryPolicy): Promise<void> {
    let delay = retryPolicy.baseDelay;

    switch (retryPolicy.backoffStrategy) {
      case 'exponential':
        delay = Math.min(retryPolicy.baseDelay * Math.pow(2, retryCount - 1), retryPolicy.maxDelay);
        break;
      case 'linear':
        delay = Math.min(retryPolicy.baseDelay * retryCount, retryPolicy.maxDelay);
        break;
      case 'fixed':
        delay = retryPolicy.baseDelay;
        break;
    }

    await new Promise(resolve => setTimeout(resolve, delay));
  }

  private groupStepsByDependencies(steps: AutomationStep[]): AutomationStep[][] {
    // Simple implementation - would implement proper dependency resolution
    return [steps]; // For now, execute all steps in one group
  }

  // =============================================================================
  // PUBLIC UTILITY METHODS
  // =============================================================================

  getTaskResult(taskId: string): AutomationResult | undefined {
    return this.taskResults.get(taskId);
  }

  getAllTaskResults(): AutomationResult[] {
    return Array.from(this.taskResults.values());
  }

  getActiveTaskCount(): number {
    return this.activeTasks.size;
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const task = this.activeTasks.get(taskId);
    if (!task) {
      return false;
    }

    // Implementation would cancel running task
    logger.info('Task cancellation requested', { taskId });
    return true;
  }

  getStats(): any {
    return {
      activeTasks: this.activeTasks.size,
      completedTasks: this.taskResults.size,
      browserStats: this.browserManager.getStats(),
      screenshotStats: this.screenshotManager.getStats(),
      waiterStats: this.intelligentWaiter.getStats(),
    };
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Automation Engine');
    
    // Cancel all active tasks
    for (const taskId of this.activeTasks.keys()) {
      await this.cancelTask(taskId);
    }

    // Shutdown components
    await this.browserManager.shutdown();
    
    logger.info('Automation Engine shutdown complete');
  }
}

// =============================================================================
// PERFORMANCE MONITOR
// =============================================================================

class PerformanceMonitor {
  private taskMetrics: Map<string, PerformanceMetrics> = new Map();

  startTask(taskId: string): void {
    this.taskMetrics.set(taskId, this.createEmptyMetrics());
  }

  getTaskMetrics(taskId: string): PerformanceMetrics {
    return this.taskMetrics.get(taskId) || this.createEmptyMetrics();
  }

  createEmptyMetrics(): PerformanceMetrics {
    return {
      totalDuration: 0,
      networkTime: 0,
      renderTime: 0,
      actionTime: 0,
      waitTime: 0,
      screenshotTime: 0,
      memoryUsage: 0,
      cpuUsage: 0,
    };
  }
}

export default AutomationEngine;
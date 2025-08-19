/**
 * AI Automation Coordinator
 * Integrates NVIDIA AI service with browser automation engine
 */

import { AIService } from '../nvidia/ai-service';
import { AutomationEngine } from '../automation/automation-engine';
import { ContextManager } from '../nvidia/context-manager';
import { IntentClassifier } from '../nvidia/intent-classifier';
import { ResponseGenerator } from '../nvidia/response-generator';
import { Logger } from '../../utils/logger';
import { 
  PageContext, 
  BrowserAction, 
  AIResponse, 
  AutomationPlan,
  AutomationResult,
  UserSession 
} from '@browser-ai-agent/shared';

export interface AIAutomationRequest {
  sessionId: string;
  message: string;
  pageContext: PageContext;
  conversationHistory?: any[];
  userPreferences?: any;
}

export interface AIAutomationResponse {
  response: AIResponse;
  automationPlan?: AutomationPlan;
  requiresConfirmation?: boolean;
  estimatedDuration?: number;
  riskLevel?: 'low' | 'medium' | 'high';
}

export interface AutomationFeedback {
  success: boolean;
  results: AutomationResult[];
  errors?: string[];
  screenshots?: string[];
  pageChanges?: any;
}

export class AIAutomationCoordinator {
  private aiService: AIService;
  private automationEngine: AutomationEngine;
  private contextManager: ContextManager;
  private intentClassifier: IntentClassifier;
  private responseGenerator: ResponseGenerator;
  private logger: Logger;

  // Active automation sessions
  private activeSessions: Map<string, {
    plan: AutomationPlan;
    currentStep: number;
    startTime: Date;
    feedback: AutomationFeedback[];
  }> = new Map();

  constructor(
    aiService: AIService,
    automationEngine: AutomationEngine,
    contextManager: ContextManager,
    intentClassifier: IntentClassifier,
    responseGenerator: ResponseGenerator,
    logger: Logger
  ) {
    this.aiService = aiService;
    this.automationEngine = automationEngine;
    this.contextManager = contextManager;
    this.intentClassifier = intentClassifier;
    this.responseGenerator = responseGenerator;
    this.logger = logger;
  }

  /**
   * Process AI automation request
   */
  async processRequest(request: AIAutomationRequest): Promise<AIAutomationResponse> {
    try {
      this.logger.info('Processing AI automation request', {
        sessionId: request.sessionId,
        message: request.message.substring(0, 100)
      });

      // Update context with current page information
      await this.contextManager.updateContext(request.sessionId, {
        pageContext: request.pageContext,
        conversationHistory: request.conversationHistory
      });

      // Classify user intent
      const intent = await this.intentClassifier.classifyIntent(
        request.message,
        request.pageContext
      );

      this.logger.debug('Classified intent', { intent });

      // Generate AI response based on intent
      const aiResponse = await this.generateAIResponse(request, intent);

      // Create automation plan if needed
      let automationPlan: AutomationPlan | undefined;
      let requiresConfirmation = false;
      let estimatedDuration = 0;
      let riskLevel: 'low' | 'medium' | 'high' = 'low';

      if (this.requiresAutomation(intent)) {
        const planResult = await this.createAutomationPlan(request, intent, aiResponse);
        automationPlan = planResult.plan;
        requiresConfirmation = planResult.requiresConfirmation;
        estimatedDuration = planResult.estimatedDuration;
        riskLevel = planResult.riskLevel;
      }

      return {
        response: aiResponse,
        automationPlan,
        requiresConfirmation,
        estimatedDuration,
        riskLevel
      };

    } catch (error) {
      this.logger.error('Error processing AI automation request', error);
      throw error;
    }
  }

  /**
   * Execute automation plan
   */
  async executeAutomation(
    sessionId: string, 
    planId: string, 
    userConfirmation?: boolean
  ): Promise<AutomationResult> {
    try {
      this.logger.info('Executing automation plan', { sessionId, planId });

      // Get automation plan from context or storage
      const plan = await this.getAutomationPlan(planId);
      if (!plan) {
        throw new Error(`Automation plan ${planId} not found`);
      }

      // Check if confirmation is required
      if (plan.requiresConfirmation && !userConfirmation) {
        throw new Error('User confirmation required for this automation');
      }

      // Start automation session
      this.activeSessions.set(sessionId, {
        plan,
        currentStep: 0,
        startTime: new Date(),
        feedback: []
      });

      // Execute automation steps
      const result = await this.executeAutomationSteps(sessionId, plan);

      // Clean up session
      this.activeSessions.delete(sessionId);

      this.logger.info('Automation execution completed', {
        sessionId,
        success: result.success,
        stepsExecuted: result.stepsExecuted
      });

      return result;

    } catch (error) {
      this.logger.error('Error executing automation', error);
      
      // Clean up failed session
      this.activeSessions.delete(sessionId);
      
      throw error;
    }
  }

  /**
   * Get automation status
   */
  getAutomationStatus(sessionId: string): {
    isActive: boolean;
    currentStep?: number;
    totalSteps?: number;
    progress?: number;
    estimatedTimeRemaining?: number;
  } {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      return { isActive: false };
    }

    const progress = session.plan.steps.length > 0 ? 
      (session.currentStep / session.plan.steps.length) * 100 : 0;

    const elapsedTime = Date.now() - session.startTime.getTime();
    const estimatedTotalTime = session.plan.estimatedDuration || 30000; // 30 seconds default
    const estimatedTimeRemaining = Math.max(0, estimatedTotalTime - elapsedTime);

    return {
      isActive: true,
      currentStep: session.currentStep,
      totalSteps: session.plan.steps.length,
      progress,
      estimatedTimeRemaining
    };
  }

  /**
   * Cancel automation
   */
  async cancelAutomation(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      this.logger.info('Cancelling automation', { sessionId });
      
      // Stop any running automation
      await this.automationEngine.stopAutomation(sessionId);
      
      // Clean up session
      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * Provide feedback to AI about automation results
   */
  async provideFeedback(
    sessionId: string, 
    feedback: AutomationFeedback
  ): Promise<AIResponse> {
    try {
      this.logger.info('Processing automation feedback', {
        sessionId,
        success: feedback.success,
        resultsCount: feedback.results.length
      });

      // Update context with automation results
      await this.contextManager.updateContext(sessionId, {
        automationFeedback: feedback,
        timestamp: new Date()
      });

      // Generate AI response based on feedback
      const response = await this.generateFeedbackResponse(sessionId, feedback);

      // If automation failed, suggest recovery actions
      if (!feedback.success && feedback.errors) {
        const recoveryPlan = await this.createRecoveryPlan(sessionId, feedback);
        if (recoveryPlan) {
          response.metadata = {
            ...response.metadata,
            recoveryPlan
          };
        }
      }

      return response;

    } catch (error) {
      this.logger.error('Error processing automation feedback', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */

  private async generateAIResponse(
    request: AIAutomationRequest, 
    intent: any
  ): Promise<AIResponse> {
    const context = await this.contextManager.getContext(request.sessionId);
    
    return this.responseGenerator.generateResponse({
      intent,
      context,
      pageContext: request.pageContext,
      message: request.message,
      conversationHistory: request.conversationHistory
    });
  }

  private requiresAutomation(intent: any): boolean {
    const automationIntents = [
      'click_element',
      'fill_form',
      'navigate',
      'extract_data',
      'automate_task',
      'interact_with_page'
    ];

    return automationIntents.includes(intent.type) || intent.confidence > 0.8;
  }

  private async createAutomationPlan(
    request: AIAutomationRequest,
    intent: any,
    aiResponse: AIResponse
  ): Promise<{
    plan: AutomationPlan;
    requiresConfirmation: boolean;
    estimatedDuration: number;
    riskLevel: 'low' | 'medium' | 'high';
  }> {
    // Analyze the request and create automation steps
    const steps = await this.generateAutomationSteps(request, intent);
    
    // Assess risk level
    const riskLevel = this.assessRiskLevel(steps, request.pageContext);
    
    // Determine if confirmation is needed
    const requiresConfirmation = riskLevel !== 'low' || this.hasDestructiveActions(steps);
    
    // Estimate duration
    const estimatedDuration = this.estimateExecutionTime(steps);

    const plan: AutomationPlan = {
      id: this.generatePlanId(),
      sessionId: request.sessionId,
      steps,
      requiresConfirmation,
      riskLevel,
      estimatedDuration,
      createdAt: new Date(),
      metadata: {
        intent,
        originalMessage: request.message,
        pageUrl: request.pageContext.url
      }
    };

    return {
      plan,
      requiresConfirmation,
      estimatedDuration,
      riskLevel
    };
  }

  private async generateAutomationSteps(
    request: AIAutomationRequest,
    intent: any
  ): Promise<BrowserAction[]> {
    const steps: BrowserAction[] = [];

    switch (intent.type) {
      case 'click_element':
        if (intent.target?.selector) {
          steps.push({
            id: this.generateActionId(),
            type: 'click',
            selector: intent.target.selector,
            description: `Click on ${intent.target.description || 'element'}`,
            waitForNavigation: intent.target.isLink || false,
            timeout: 5000
          });
        }
        break;

      case 'fill_form':
        if (intent.formData) {
          for (const [field, value] of Object.entries(intent.formData)) {
            steps.push({
              id: this.generateActionId(),
              type: 'type',
              selector: `[name="${field}"], #${field}`,
              value: value as string,
              description: `Fill ${field} with ${value}`,
              timeout: 3000
            });
          }
          
          // Add submit action if specified
          if (intent.submit) {
            steps.push({
              id: this.generateActionId(),
              type: 'click',
              selector: 'button[type="submit"], input[type="submit"]',
              description: 'Submit form',
              waitForNavigation: true,
              timeout: 10000
            });
          }
        }
        break;

      case 'navigate':
        if (intent.target?.url) {
          steps.push({
            id: this.generateActionId(),
            type: 'navigate',
            url: intent.target.url,
            description: `Navigate to ${intent.target.url}`,
            waitForLoad: true,
            timeout: 15000
          });
        }
        break;

      case 'extract_data':
        steps.push({
          id: this.generateActionId(),
          type: 'extract',
          selectors: intent.selectors || ['body'],
          description: 'Extract data from page',
          extractType: intent.extractType || 'text',
          timeout: 5000
        });
        break;

      case 'automate_task':
        // Generate complex automation sequence
        const taskSteps = await this.generateTaskAutomation(request, intent);
        steps.push(...taskSteps);
        break;

      default:
        // Fallback: try to infer actions from page context
        const inferredSteps = await this.inferAutomationSteps(request, intent);
        steps.push(...inferredSteps);
    }

    return steps;
  }

  private async generateTaskAutomation(
    request: AIAutomationRequest,
    intent: any
  ): Promise<BrowserAction[]> {
    // Use AI to generate complex automation sequences
    const prompt = `
      Based on the user's request: "${request.message}"
      And the page context: ${JSON.stringify(request.pageContext, null, 2)}
      
      Generate a sequence of browser automation steps to accomplish the task.
      Consider the available interactive elements and the user's intent.
    `;

    try {
      const aiResponse = await this.aiService.generateResponse(prompt, {
        model: 'llama-3.1-405b-instruct',
        temperature: 0.3,
        maxTokens: 1000
      });

      // Parse AI response to extract automation steps
      return this.parseAutomationStepsFromAI(aiResponse.content);
    } catch (error) {
      this.logger.error('Error generating task automation', error);
      return [];
    }
  }

  private async inferAutomationSteps(
    request: AIAutomationRequest,
    intent: any
  ): Promise<BrowserAction[]> {
    const steps: BrowserAction[] = [];
    
    // Analyze page elements and user intent to infer actions
    const interactiveElements = request.pageContext.elements.filter(el => el.interactable);
    
    // Simple heuristics for common patterns
    if (request.message.toLowerCase().includes('click')) {
      const clickableElement = this.findBestClickTarget(interactiveElements, request.message);
      if (clickableElement) {
        steps.push({
          id: this.generateActionId(),
          type: 'click',
          selector: clickableElement.selector,
          description: `Click on ${clickableElement.text || 'element'}`,
          timeout: 5000
        });
      }
    }

    if (request.message.toLowerCase().includes('fill') || request.message.toLowerCase().includes('type')) {
      const inputElement = this.findBestInputTarget(interactiveElements, request.message);
      if (inputElement) {
        const value = this.extractValueFromMessage(request.message);
        steps.push({
          id: this.generateActionId(),
          type: 'type',
          selector: inputElement.selector,
          value: value || '',
          description: `Type in ${inputElement.text || 'input field'}`,
          timeout: 3000
        });
      }
    }

    return steps;
  }

  private parseAutomationStepsFromAI(aiContent: string): BrowserAction[] {
    const steps: BrowserAction[] = [];
    
    try {
      // Try to parse JSON response
      const parsed = JSON.parse(aiContent);
      if (Array.isArray(parsed)) {
        return parsed.map(step => ({
          id: this.generateActionId(),
          ...step
        }));
      }
    } catch {
      // If not JSON, try to parse natural language instructions
      const lines = aiContent.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        const step = this.parseInstructionLine(line);
        if (step) {
          steps.push({
            id: this.generateActionId(),
            ...step
          });
        }
      }
    }

    return steps;
  }

  private parseInstructionLine(line: string): Partial<BrowserAction> | null {
    const lowerLine = line.toLowerCase();
    
    if (lowerLine.includes('click')) {
      const selector = this.extractSelectorFromLine(line);
      return {
        type: 'click',
        selector: selector || 'button',
        description: line.trim(),
        timeout: 5000
      };
    }
    
    if (lowerLine.includes('type') || lowerLine.includes('fill')) {
      const selector = this.extractSelectorFromLine(line);
      const value = this.extractValueFromLine(line);
      return {
        type: 'type',
        selector: selector || 'input',
        value: value || '',
        description: line.trim(),
        timeout: 3000
      };
    }
    
    if (lowerLine.includes('navigate') || lowerLine.includes('go to')) {
      const url = this.extractUrlFromLine(line);
      return {
        type: 'navigate',
        url: url || '',
        description: line.trim(),
        timeout: 15000
      };
    }

    return null;
  }

  private assessRiskLevel(steps: BrowserAction[], pageContext: PageContext): 'low' | 'medium' | 'high' {
    let riskScore = 0;

    for (const step of steps) {
      switch (step.type) {
        case 'click':
          // Clicking submit buttons or links is medium risk
          if (step.selector?.includes('submit') || step.waitForNavigation) {
            riskScore += 2;
          } else {
            riskScore += 1;
          }
          break;
        
        case 'type':
          // Typing in forms is low-medium risk
          riskScore += 1;
          break;
        
        case 'navigate':
          // Navigation is medium risk
          riskScore += 2;
          break;
        
        case 'extract':
          // Data extraction is low risk
          riskScore += 0;
          break;
        
        default:
          riskScore += 1;
      }
    }

    // Check page context for additional risk factors
    if (pageContext.url.includes('checkout') || pageContext.url.includes('payment')) {
      riskScore += 3;
    }
    
    if (pageContext.metadata.hasForms) {
      riskScore += 1;
    }

    if (riskScore >= 5) return 'high';
    if (riskScore >= 3) return 'medium';
    return 'low';
  }

  private hasDestructiveActions(steps: BrowserAction[]): boolean {
    const destructivePatterns = [
      'delete',
      'remove',
      'cancel',
      'submit',
      'purchase',
      'buy',
      'confirm',
      'send'
    ];

    return steps.some(step => 
      destructivePatterns.some(pattern => 
        step.description?.toLowerCase().includes(pattern) ||
        step.selector?.toLowerCase().includes(pattern)
      )
    );
  }

  private estimateExecutionTime(steps: BrowserAction[]): number {
    let totalTime = 0;

    for (const step of steps) {
      switch (step.type) {
        case 'click':
          totalTime += step.waitForNavigation ? 3000 : 1000;
          break;
        case 'type':
          totalTime += (step.value?.length || 0) * 100 + 500;
          break;
        case 'navigate':
          totalTime += 5000;
          break;
        case 'wait':
          totalTime += step.timeout || 1000;
          break;
        default:
          totalTime += 1000;
      }
    }

    return Math.max(totalTime, 2000); // Minimum 2 seconds
  }

  private async executeAutomationSteps(
    sessionId: string, 
    plan: AutomationPlan
  ): Promise<AutomationResult> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error('Automation session not found');
    }

    const results: any[] = [];
    const errors: string[] = [];

    try {
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        session.currentStep = i;

        this.logger.debug('Executing automation step', {
          sessionId,
          step: i + 1,
          total: plan.steps.length,
          action: step.type
        });

        try {
          const result = await this.automationEngine.executeAction(step);
          results.push(result);

          // Add small delay between steps
          await this.delay(500);

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Step ${i + 1}: ${errorMessage}`);
          
          this.logger.error('Automation step failed', {
            sessionId,
            step: i + 1,
            error: errorMessage
          });

          // Decide whether to continue or stop
          if (this.shouldStopOnError(step, error)) {
            break;
          }
        }
      }

      const success = errors.length === 0;
      
      return {
        success,
        planId: plan.id,
        stepsExecuted: results.length,
        totalSteps: plan.steps.length,
        results,
        errors: errors.length > 0 ? errors : undefined,
        executionTime: Date.now() - session.startTime.getTime(),
        completedAt: new Date()
      };

    } catch (error) {
      this.logger.error('Automation execution failed', error);
      throw error;
    }
  }

  private shouldStopOnError(step: BrowserAction, error: any): boolean {
    // Continue on non-critical errors
    const continuableErrors = [
      'element not found',
      'element not visible',
      'timeout'
    ];

    const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
    return !continuableErrors.some(pattern => errorMessage.includes(pattern));
  }

  private async generateFeedbackResponse(
    sessionId: string, 
    feedback: AutomationFeedback
  ): Promise<AIResponse> {
    const context = await this.contextManager.getContext(sessionId);
    
    let responseContent = '';
    
    if (feedback.success) {
      responseContent = 'Great! I successfully completed the automation task. ';
      
      if (feedback.results.length > 0) {
        responseContent += `I executed ${feedback.results.length} steps and everything worked as expected.`;
      }
      
      // Add summary of what was accomplished
      const accomplishments = feedback.results
        .map(result => result.description)
        .filter(Boolean)
        .slice(0, 3);
        
      if (accomplishments.length > 0) {
        responseContent += ` Here's what I did: ${accomplishments.join(', ')}.`;
      }
    } else {
      responseContent = 'I encountered some issues while trying to complete the automation task. ';
      
      if (feedback.errors && feedback.errors.length > 0) {
        responseContent += `The main problems were: ${feedback.errors.slice(0, 2).join(', ')}.`;
      }
      
      responseContent += ' Would you like me to try a different approach?';
    }

    return {
      content: responseContent,
      type: 'automation_feedback',
      confidence: feedback.success ? 0.9 : 0.6,
      metadata: {
        automationResults: feedback.results,
        success: feedback.success,
        errors: feedback.errors
      }
    };
  }

  private async createRecoveryPlan(
    sessionId: string, 
    feedback: AutomationFeedback
  ): Promise<AutomationPlan | null> {
    // Analyze failures and create recovery actions
    if (!feedback.errors || feedback.errors.length === 0) {
      return null;
    }

    const recoverySteps: BrowserAction[] = [];

    // Simple recovery strategies
    for (const error of feedback.errors) {
      if (error.includes('element not found')) {
        recoverySteps.push({
          id: this.generateActionId(),
          type: 'wait',
          timeout: 2000,
          description: 'Wait for page to load completely'
        });
      }
      
      if (error.includes('timeout')) {
        recoverySteps.push({
          id: this.generateActionId(),
          type: 'refresh',
          description: 'Refresh page and retry'
        });
      }
    }

    if (recoverySteps.length === 0) {
      return null;
    }

    return {
      id: this.generatePlanId(),
      sessionId,
      steps: recoverySteps,
      requiresConfirmation: false,
      riskLevel: 'low',
      estimatedDuration: this.estimateExecutionTime(recoverySteps),
      createdAt: new Date(),
      metadata: {
        isRecoveryPlan: true,
        originalErrors: feedback.errors
      }
    };
  }

  private async getAutomationPlan(planId: string): Promise<AutomationPlan | null> {
    // In a real implementation, this would fetch from database or cache
    // For now, we'll store plans in memory or context
    return null; // Placeholder
  }

  private findBestClickTarget(elements: any[], message: string): any | null {
    // Simple heuristic to find the best element to click
    const keywords = message.toLowerCase().split(' ');
    
    for (const element of elements) {
      if (element.type === 'button' || element.tagName === 'button') {
        const elementText = element.text?.toLowerCase() || '';
        if (keywords.some(keyword => elementText.includes(keyword))) {
          return element;
        }
      }
    }

    // Fallback to first clickable element
    return elements.find(el => el.type === 'button' || el.tagName === 'a') || null;
  }

  private findBestInputTarget(elements: any[], message: string): any | null {
    // Find the best input field based on message context
    const inputElements = elements.filter(el => 
      el.tagName === 'input' || el.tagName === 'textarea'
    );

    // Try to match by placeholder or label
    const keywords = message.toLowerCase().split(' ');
    
    for (const element of inputElements) {
      const placeholder = element.attributes?.placeholder?.toLowerCase() || '';
      const name = element.attributes?.name?.toLowerCase() || '';
      
      if (keywords.some(keyword => placeholder.includes(keyword) || name.includes(keyword))) {
        return element;
      }
    }

    // Fallback to first input
    return inputElements[0] || null;
  }

  private extractValueFromMessage(message: string): string {
    // Simple extraction of quoted values
    const matches = message.match(/"([^"]+)"/);
    return matches ? matches[1] : '';
  }

  private extractSelectorFromLine(line: string): string | null {
    // Extract CSS selector from instruction line
    const selectorMatch = line.match(/['"`]([^'"`]+)['"`]/);
    return selectorMatch ? selectorMatch[1] : null;
  }

  private extractValueFromLine(line: string): string | null {
    // Extract value to type from instruction line
    const valueMatch = line.match(/with ['"`]([^'"`]+)['"`]/);
    return valueMatch ? valueMatch[1] : null;
  }

  private extractUrlFromLine(line: string): string | null {
    // Extract URL from instruction line
    const urlMatch = line.match(/(https?:\/\/[^\s]+)/);
    return urlMatch ? urlMatch[1] : null;
  }

  private generatePlanId(): string {
    return `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateActionId(): string {
    return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
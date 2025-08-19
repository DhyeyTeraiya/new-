/**
 * Action Planner
 * Converts AI intents into executable browser automation plans
 */

import { 
  PageContext, 
  BrowserAction, 
  AutomationPlan,
  ElementInfo 
} from '@browser-ai-agent/shared';
import { Logger } from '../../utils/logger';

export interface PlanningContext {
  intent: any;
  pageContext: PageContext;
  userMessage: string;
  conversationHistory?: any[];
  userPreferences?: any;
}

export interface PlanningResult {
  plan: AutomationPlan;
  confidence: number;
  alternatives?: AutomationPlan[];
  warnings?: string[];
}

export class ActionPlanner {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Create automation plan from AI intent
   */
  async createPlan(context: PlanningContext): Promise<PlanningResult> {
    try {
      this.logger.debug('Creating automation plan', {
        intentType: context.intent.type,
        pageUrl: context.pageContext.url
      });

      const steps = await this.generateSteps(context);
      const riskLevel = this.assessRisk(steps, context);
      const estimatedDuration = this.estimateDuration(steps);

      const plan: AutomationPlan = {
        id: this.generatePlanId(),
        sessionId: context.intent.sessionId || 'unknown',
        steps,
        requiresConfirmation: riskLevel !== 'low',
        riskLevel,
        estimatedDuration,
        createdAt: new Date(),
        metadata: {
          intent: context.intent,
          originalMessage: context.userMessage,
          pageUrl: context.pageContext.url,
          plannerVersion: '1.0.0'
        }
      };

      const confidence = this.calculateConfidence(plan, context);
      const alternatives = await this.generateAlternatives(context, plan);
      const warnings = this.generateWarnings(plan, context);

      return {
        plan,
        confidence,
        alternatives,
        warnings: warnings.length > 0 ? warnings : undefined
      };

    } catch (error) {
      this.logger.error('Error creating automation plan', error);
      throw error;
    }
  }

  /**
   * Generate automation steps based on intent
   */
  private async generateSteps(context: PlanningContext): Promise<BrowserAction[]> {
    const { intent, pageContext } = context;
    const steps: BrowserAction[] = [];

    switch (intent.type) {
      case 'click_element':
        steps.push(...this.planClickAction(intent, pageContext));
        break;

      case 'fill_form':
        steps.push(...this.planFormFilling(intent, pageContext));
        break;

      case 'navigate':
        steps.push(...this.planNavigation(intent, pageContext));
        break;

      case 'extract_data':
        steps.push(...this.planDataExtraction(intent, pageContext));
        break;

      case 'search':
        steps.push(...this.planSearch(intent, pageContext));
        break;

      case 'scroll':
        steps.push(...this.planScrolling(intent, pageContext));
        break;

      case 'wait':
        steps.push(...this.planWaiting(intent, pageContext));
        break;

      case 'complex_task':
        steps.push(...await this.planComplexTask(intent, pageContext, context));
        break;

      default:
        steps.push(...this.planGenericAction(intent, pageContext, context));
    }

    return this.optimizeSteps(steps);
  }

  private planClickAction(intent: any, pageContext: PageContext): BrowserAction[] {
    const steps: BrowserAction[] = [];

    if (intent.target?.selector) {
      steps.push({
        id: this.generateActionId(),
        type: 'click',
        selector: intent.target.selector,
        description: `Click on ${intent.target.description || 'element'}`,
        waitForNavigation: this.shouldWaitForNavigation(intent.target),
        timeout: 5000
      });
    } else if (intent.target?.text) {
      // Find element by text content
      const element = this.findElementByText(pageContext.elements, intent.target.text);
      if (element) {
        steps.push({
          id: this.generateActionId(),
          type: 'click',
          selector: element.selector,
          description: `Click on "${intent.target.text}"`,
          waitForNavigation: element.tagName === 'a',
          timeout: 5000
        });
      }
    }

    return steps;
  }  pr
ivate planFormFilling(intent: any, pageContext: PageContext): BrowserAction[] {
    const steps: BrowserAction[] = [];

    if (intent.formData) {
      // Clear form first if specified
      if (intent.clearFirst) {
        steps.push({
          id: this.generateActionId(),
          type: 'clear_form',
          selector: intent.formSelector || 'form',
          description: 'Clear form fields',
          timeout: 2000
        });
      }

      // Fill each field
      for (const [fieldName, value] of Object.entries(intent.formData)) {
        const element = this.findFormField(pageContext.elements, fieldName);
        if (element) {
          steps.push({
            id: this.generateActionId(),
            type: 'type',
            selector: element.selector,
            value: value as string,
            description: `Fill ${fieldName} with "${value}"`,
            clearFirst: true,
            timeout: 3000
          });
        }
      }

      // Submit form if requested
      if (intent.submit) {
        const submitButton = this.findSubmitButton(pageContext.elements);
        if (submitButton) {
          steps.push({
            id: this.generateActionId(),
            type: 'click',
            selector: submitButton.selector,
            description: 'Submit form',
            waitForNavigation: true,
            timeout: 10000
          });
        }
      }
    }

    return steps;
  }

  private planNavigation(intent: any, pageContext: PageContext): BrowserAction[] {
    const steps: BrowserAction[] = [];

    if (intent.target?.url) {
      steps.push({
        id: this.generateActionId(),
        type: 'navigate',
        url: intent.target.url,
        description: `Navigate to ${intent.target.url}`,
        waitForLoad: true,
        timeout: 15000
      });
    } else if (intent.target?.linkText) {
      const link = this.findLinkByText(pageContext.elements, intent.target.linkText);
      if (link) {
        steps.push({
          id: this.generateActionId(),
          type: 'click',
          selector: link.selector,
          description: `Click link "${intent.target.linkText}"`,
          waitForNavigation: true,
          timeout: 10000
        });
      }
    }

    return steps;
  }

  private planDataExtraction(intent: any, pageContext: PageContext): BrowserAction[] {
    const steps: BrowserAction[] = [];

    const selectors = intent.selectors || this.inferExtractionSelectors(intent, pageContext);
    
    steps.push({
      id: this.generateActionId(),
      type: 'extract',
      selectors,
      description: `Extract ${intent.dataType || 'data'} from page`,
      extractType: intent.extractType || 'text',
      format: intent.format || 'json',
      timeout: 5000
    });

    return steps;
  }

  private planSearch(intent: any, pageContext: PageContext): BrowserAction[] {
    const steps: BrowserAction[] = [];

    const searchField = this.findSearchField(pageContext.elements);
    if (searchField && intent.query) {
      // Focus and clear search field
      steps.push({
        id: this.generateActionId(),
        type: 'click',
        selector: searchField.selector,
        description: 'Focus search field',
        timeout: 2000
      });

      // Type search query
      steps.push({
        id: this.generateActionId(),
        type: 'type',
        selector: searchField.selector,
        value: intent.query,
        description: `Search for "${intent.query}"`,
        clearFirst: true,
        timeout: 3000
      });

      // Submit search
      if (intent.submit !== false) {
        steps.push({
          id: this.generateActionId(),
          type: 'key',
          selector: searchField.selector,
          key: 'Enter',
          description: 'Submit search',
          waitForNavigation: true,
          timeout: 10000
        });
      }
    }

    return steps;
  }

  private planScrolling(intent: any, pageContext: PageContext): BrowserAction[] {
    const steps: BrowserAction[] = [];

    if (intent.target?.selector) {
      steps.push({
        id: this.generateActionId(),
        type: 'scroll',
        selector: intent.target.selector,
        description: `Scroll to ${intent.target.description || 'element'}`,
        behavior: intent.behavior || 'smooth',
        timeout: 3000
      });
    } else if (intent.direction) {
      steps.push({
        id: this.generateActionId(),
        type: 'scroll',
        direction: intent.direction,
        amount: intent.amount || 500,
        description: `Scroll ${intent.direction}`,
        behavior: intent.behavior || 'smooth',
        timeout: 2000
      });
    }

    return steps;
  }

  private planWaiting(intent: any, pageContext: PageContext): BrowserAction[] {
    const steps: BrowserAction[] = [];

    if (intent.waitFor === 'element') {
      steps.push({
        id: this.generateActionId(),
        type: 'wait_for_element',
        selector: intent.selector,
        description: `Wait for element ${intent.selector}`,
        timeout: intent.timeout || 10000
      });
    } else if (intent.waitFor === 'navigation') {
      steps.push({
        id: this.generateActionId(),
        type: 'wait_for_navigation',
        description: 'Wait for page navigation',
        timeout: intent.timeout || 15000
      });
    } else {
      steps.push({
        id: this.generateActionId(),
        type: 'wait',
        duration: intent.duration || 1000,
        description: `Wait for ${intent.duration || 1000}ms`,
        timeout: (intent.duration || 1000) + 1000
      });
    }

    return steps;
  }

  private async planComplexTask(
    intent: any, 
    pageContext: PageContext, 
    context: PlanningContext
  ): Promise<BrowserAction[]> {
    const steps: BrowserAction[] = [];

    // Break down complex task into simpler actions
    if (intent.subtasks && Array.isArray(intent.subtasks)) {
      for (const subtask of intent.subtasks) {
        const subtaskSteps = await this.generateSteps({
          ...context,
          intent: subtask
        });
        steps.push(...subtaskSteps);
      }
    } else {
      // Try to infer steps from task description
      const inferredSteps = this.inferStepsFromDescription(intent.description, pageContext);
      steps.push(...inferredSteps);
    }

    return steps;
  }

  private planGenericAction(
    intent: any, 
    pageContext: PageContext, 
    context: PlanningContext
  ): BrowserAction[] {
    const steps: BrowserAction[] = [];

    // Try to infer action from user message
    const message = context.userMessage.toLowerCase();

    if (message.includes('click')) {
      const element = this.findBestClickableElement(pageContext.elements, message);
      if (element) {
        steps.push({
          id: this.generateActionId(),
          type: 'click',
          selector: element.selector,
          description: `Click on ${element.text || 'element'}`,
          timeout: 5000
        });
      }
    }

    if (message.includes('type') || message.includes('fill') || message.includes('enter')) {
      const element = this.findBestInputElement(pageContext.elements, message);
      if (element) {
        const value = this.extractValueFromMessage(message);
        steps.push({
          id: this.generateActionId(),
          type: 'type',
          selector: element.selector,
          value: value || '',
          description: `Type "${value}" in ${element.text || 'input field'}`,
          timeout: 3000
        });
      }
    }

    return steps;
  }

  /**
   * Helper methods for finding elements
   */

  private findElementByText(elements: ElementInfo[], text: string): ElementInfo | null {
    return elements.find(el => 
      el.text?.toLowerCase().includes(text.toLowerCase())
    ) || null;
  }

  private findFormField(elements: ElementInfo[], fieldName: string): ElementInfo | null {
    const lowerFieldName = fieldName.toLowerCase();
    
    return elements.find(el => {
      if (el.tagName !== 'input' && el.tagName !== 'textarea' && el.tagName !== 'select') {
        return false;
      }

      const name = el.attributes.name?.toLowerCase();
      const id = el.attributes.id?.toLowerCase();
      const placeholder = el.attributes.placeholder?.toLowerCase();

      return name === lowerFieldName || 
             id === lowerFieldName || 
             placeholder?.includes(lowerFieldName) ||
             name?.includes(lowerFieldName);
    }) || null;
  }

  private findSubmitButton(elements: ElementInfo[]): ElementInfo | null {
    return elements.find(el => {
      if (el.tagName === 'button' && el.attributes.type === 'submit') {
        return true;
      }
      if (el.tagName === 'input' && el.attributes.type === 'submit') {
        return true;
      }
      if (el.tagName === 'button' && el.text?.toLowerCase().includes('submit')) {
        return true;
      }
      return false;
    }) || null;
  }

  private findLinkByText(elements: ElementInfo[], linkText: string): ElementInfo | null {
    return elements.find(el => 
      el.tagName === 'a' && 
      el.text?.toLowerCase().includes(linkText.toLowerCase())
    ) || null;
  }

  private findSearchField(elements: ElementInfo[]): ElementInfo | null {
    return elements.find(el => {
      if (el.tagName !== 'input') return false;
      
      const type = el.attributes.type?.toLowerCase();
      const name = el.attributes.name?.toLowerCase();
      const placeholder = el.attributes.placeholder?.toLowerCase();
      const id = el.attributes.id?.toLowerCase();

      return type === 'search' ||
             name?.includes('search') ||
             placeholder?.includes('search') ||
             id?.includes('search') ||
             name?.includes('query') ||
             placeholder?.includes('query');
    }) || null;
  }

  private findBestClickableElement(elements: ElementInfo[], message: string): ElementInfo | null {
    const clickableElements = elements.filter(el => 
      el.interactable && (el.tagName === 'button' || el.tagName === 'a' || el.attributes.onclick)
    );

    // Try to match by text content
    const keywords = this.extractKeywords(message);
    for (const keyword of keywords) {
      const match = clickableElements.find(el => 
        el.text?.toLowerCase().includes(keyword.toLowerCase())
      );
      if (match) return match;
    }

    // Fallback to first clickable element
    return clickableElements[0] || null;
  }

  private findBestInputElement(elements: ElementInfo[], message: string): ElementInfo | null {
    const inputElements = elements.filter(el => 
      el.tagName === 'input' || el.tagName === 'textarea'
    );

    // Try to match by context
    const keywords = this.extractKeywords(message);
    for (const keyword of keywords) {
      const match = inputElements.find(el => {
        const placeholder = el.attributes.placeholder?.toLowerCase() || '';
        const name = el.attributes.name?.toLowerCase() || '';
        return placeholder.includes(keyword) || name.includes(keyword);
      });
      if (match) return match;
    }

    // Fallback to first input element
    return inputElements[0] || null;
  }

  /**
   * Optimization and analysis methods
   */

  private optimizeSteps(steps: BrowserAction[]): BrowserAction[] {
    // Remove duplicate steps
    const optimized = steps.filter((step, index, array) => {
      return !array.slice(0, index).some(prevStep => 
        this.areStepsEquivalent(step, prevStep)
      );
    });

    // Add necessary waits between steps
    return this.addWaitSteps(optimized);
  }

  private areStepsEquivalent(step1: BrowserAction, step2: BrowserAction): boolean {
    return step1.type === step2.type &&
           step1.selector === step2.selector &&
           step1.value === step2.value;
  }

  private addWaitSteps(steps: BrowserAction[]): BrowserAction[] {
    const result: BrowserAction[] = [];

    for (let i = 0; i < steps.length; i++) {
      result.push(steps[i]);

      // Add wait after navigation or form submission
      if (steps[i].waitForNavigation || steps[i].type === 'navigate') {
        if (i < steps.length - 1) {
          result.push({
            id: this.generateActionId(),
            type: 'wait',
            duration: 1000,
            description: 'Wait for page to stabilize',
            timeout: 2000
          });
        }
      }
    }

    return result;
  }

  private assessRisk(steps: BrowserAction[], context: PlanningContext): 'low' | 'medium' | 'high' {
    let riskScore = 0;

    // Analyze each step
    for (const step of steps) {
      switch (step.type) {
        case 'click':
          if (step.waitForNavigation) riskScore += 2;
          else riskScore += 1;
          break;
        case 'type':
          riskScore += 1;
          break;
        case 'navigate':
          riskScore += 3;
          break;
        case 'extract':
          riskScore += 0;
          break;
        default:
          riskScore += 1;
      }
    }

    // Analyze page context
    const url = context.pageContext.url.toLowerCase();
    if (url.includes('checkout') || url.includes('payment') || url.includes('billing')) {
      riskScore += 5;
    }
    if (url.includes('admin') || url.includes('settings')) {
      riskScore += 3;
    }

    // Analyze form data
    if (context.intent.formData) {
      const sensitiveFields = ['password', 'credit', 'ssn', 'social'];
      const hasSensitiveData = Object.keys(context.intent.formData).some(key =>
        sensitiveFields.some(field => key.toLowerCase().includes(field))
      );
      if (hasSensitiveData) riskScore += 4;
    }

    if (riskScore >= 7) return 'high';
    if (riskScore >= 4) return 'medium';
    return 'low';
  }

  private estimateDuration(steps: BrowserAction[]): number {
    let totalTime = 0;

    for (const step of steps) {
      switch (step.type) {
        case 'click':
          totalTime += step.waitForNavigation ? 3000 : 500;
          break;
        case 'type':
          totalTime += (step.value?.length || 0) * 50 + 300;
          break;
        case 'navigate':
          totalTime += 5000;
          break;
        case 'wait':
          totalTime += step.duration || step.timeout || 1000;
          break;
        case 'extract':
          totalTime += 2000;
          break;
        default:
          totalTime += 1000;
      }
    }

    return Math.max(totalTime, 1000);
  }

  private calculateConfidence(plan: AutomationPlan, context: PlanningContext): number {
    let confidence = 0.8; // Base confidence

    // Reduce confidence for complex plans
    if (plan.steps.length > 5) {
      confidence -= 0.1;
    }

    // Reduce confidence for high-risk plans
    if (plan.riskLevel === 'high') {
      confidence -= 0.3;
    } else if (plan.riskLevel === 'medium') {
      confidence -= 0.1;
    }

    // Increase confidence if we found specific elements
    const hasSpecificSelectors = plan.steps.every(step => 
      step.selector && !step.selector.includes('*')
    );
    if (hasSpecificSelectors) {
      confidence += 0.1;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private async generateAlternatives(
    context: PlanningContext, 
    primaryPlan: AutomationPlan
  ): Promise<AutomationPlan[]> {
    // Generate alternative approaches
    const alternatives: AutomationPlan[] = [];

    // Alternative 1: More conservative approach
    if (primaryPlan.riskLevel !== 'low') {
      const conservativeSteps = primaryPlan.steps.filter(step => 
        step.type !== 'navigate' && !step.waitForNavigation
      );
      
      if (conservativeSteps.length > 0) {
        alternatives.push({
          ...primaryPlan,
          id: this.generatePlanId(),
          steps: conservativeSteps,
          riskLevel: 'low',
          metadata: {
            ...primaryPlan.metadata,
            isAlternative: true,
            alternativeType: 'conservative'
          }
        });
      }
    }

    return alternatives;
  }

  private generateWarnings(plan: AutomationPlan, context: PlanningContext): string[] {
    const warnings: string[] = [];

    if (plan.riskLevel === 'high') {
      warnings.push('This automation involves high-risk actions that may have significant consequences.');
    }

    if (plan.steps.some(step => step.waitForNavigation)) {
      warnings.push('This automation will navigate to different pages, which may take longer to complete.');
    }

    if (context.pageContext.url.includes('checkout') || context.pageContext.url.includes('payment')) {
      warnings.push('This appears to be a checkout or payment page. Please review the automation carefully.');
    }

    if (plan.estimatedDuration > 30000) {
      warnings.push('This automation may take more than 30 seconds to complete.');
    }

    return warnings;
  }

  /**
   * Utility methods
   */

  private inferExtractionSelectors(intent: any, pageContext: PageContext): string[] {
    const selectors: string[] = [];

    if (intent.dataType === 'table') {
      selectors.push('table', '.table', '[role="table"]');
    } else if (intent.dataType === 'list') {
      selectors.push('ul', 'ol', '.list', '[role="list"]');
    } else if (intent.dataType === 'text') {
      selectors.push('p', 'div', 'span', 'article', 'main');
    } else {
      selectors.push('body');
    }

    return selectors;
  }

  private inferStepsFromDescription(description: string, pageContext: PageContext): BrowserAction[] {
    const steps: BrowserAction[] = [];
    const lowerDesc = description.toLowerCase();

    // Simple pattern matching
    if (lowerDesc.includes('click')) {
      const element = this.findBestClickableElement(pageContext.elements, description);
      if (element) {
        steps.push({
          id: this.generateActionId(),
          type: 'click',
          selector: element.selector,
          description: `Click on ${element.text || 'element'}`,
          timeout: 5000
        });
      }
    }

    return steps;
  }

  private extractKeywords(message: string): string[] {
    // Extract meaningful keywords from message
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    return message.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word))
      .slice(0, 5); // Limit to 5 keywords
  }

  private extractValueFromMessage(message: string): string {
    // Extract quoted values or values after "with"
    const quotedMatch = message.match(/"([^"]+)"/);
    if (quotedMatch) return quotedMatch[1];

    const withMatch = message.match(/with\s+([^\s]+)/i);
    if (withMatch) return withMatch[1];

    return '';
  }

  private shouldWaitForNavigation(target: any): boolean {
    return target?.isLink || 
           target?.tagName === 'a' || 
           target?.type === 'submit' ||
           target?.onclick?.includes('location') ||
           target?.onclick?.includes('href');
  }

  private generatePlanId(): string {
    return `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateActionId(): string {
    return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
/**
 * Feedback Analyzer
 * Analyzes automation results and provides feedback to improve AI responses
 */

import { 
  AutomationResult, 
  AutomationPlan, 
  PageContext,
  BrowserAction 
} from '@browser-ai-agent/shared';
import { Logger } from '../../utils/logger';

export interface FeedbackAnalysis {
  success: boolean;
  confidence: number;
  improvements: string[];
  patterns: {
    successfulActions: string[];
    failedActions: string[];
    commonErrors: string[];
  };
  recommendations: {
    planOptimizations: string[];
    elementSelectors: string[];
    timingAdjustments: string[];
  };
}

export interface LearningData {
  planId: string;
  intent: any;
  pageContext: PageContext;
  executionResult: AutomationResult;
  userFeedback?: {
    rating: number; // 1-5
    comments?: string;
    wasHelpful: boolean;
  };
  timestamp: Date;
}

export class FeedbackAnalyzer {
  private logger: Logger;
  private learningHistory: LearningData[] = [];
  private successPatterns: Map<string, number> = new Map();
  private failurePatterns: Map<string, number> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Analyze automation feedback and extract insights
   */
  async analyzeFeedback(
    plan: AutomationPlan,
    result: AutomationResult,
    pageContext: PageContext,
    userFeedback?: any
  ): Promise<FeedbackAnalysis> {
    try {
      this.logger.debug('Analyzing automation feedback', {
        planId: plan.id,
        success: result.success,
        stepsExecuted: result.stepsExecuted
      });

      // Store learning data
      const learningData: LearningData = {
        planId: plan.id,
        intent: plan.metadata?.intent,
        pageContext,
        executionResult: result,
        userFeedback,
        timestamp: new Date()
      };

      this.learningHistory.push(learningData);
      this.updatePatterns(learningData);

      // Analyze the results
      const analysis = await this.performAnalysis(plan, result, pageContext);

      this.logger.info('Feedback analysis completed', {
        planId: plan.id,
        confidence: analysis.confidence,
        improvementsCount: analysis.improvements.length
      });

      return analysis;

    } catch (error) {
      this.logger.error('Error analyzing feedback', error);
      throw error;
    }
  }

  /**
   * Get learning insights for improving future automations
   */
  getLearningInsights(): {
    totalExecutions: number;
    successRate: number;
    commonFailures: Array<{ pattern: string; count: number }>;
    bestPractices: string[];
    selectorReliability: Array<{ selector: string; successRate: number }>;
  } {
    const totalExecutions = this.learningHistory.length;
    const successfulExecutions = this.learningHistory.filter(data => 
      data.executionResult.success
    ).length;

    const successRate = totalExecutions > 0 ? successfulExecutions / totalExecutions : 0;

    // Analyze common failures
    const commonFailures = Array.from(this.failurePatterns.entries())
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Generate best practices
    const bestPractices = this.generateBestPractices();

    // Analyze selector reliability
    const selectorReliability = this.analyzeSelectorReliability();

    return {
      totalExecutions,
      successRate,
      commonFailures,
      bestPractices,
      selectorReliability
    };
  }

  /**
   * Suggest improvements for a failed automation
   */
  suggestImprovements(
    plan: AutomationPlan,
    result: AutomationResult,
    pageContext: PageContext
  ): string[] {
    const suggestions: string[] = [];

    if (!result.success && result.errors) {
      for (const error of result.errors) {
        if (error.includes('element not found')) {
          suggestions.push('Consider using more robust element selectors (ID, data attributes)');
          suggestions.push('Add wait conditions before interacting with elements');
        }

        if (error.includes('timeout')) {
          suggestions.push('Increase timeout values for slow-loading elements');
          suggestions.push('Add explicit waits for dynamic content');
        }

        if (error.includes('not clickable') || error.includes('not interactable')) {
          suggestions.push('Ensure elements are visible and not covered by other elements');
          suggestions.push('Scroll elements into view before interaction');
        }

        if (error.includes('navigation')) {
          suggestions.push('Add longer waits after navigation actions');
          suggestions.push('Verify page load completion before next steps');
        }
      }
    }

    // Analyze step patterns
    const failedStepTypes = this.getFailedStepTypes(result);
    for (const stepType of failedStepTypes) {
      const typeSpecificSuggestions = this.getStepTypeImprovements(stepType);
      suggestions.push(...typeSpecificSuggestions);
    }

    return [...new Set(suggestions)]; // Remove duplicates
  }

  /**
   * Generate alternative automation approach
   */
  generateAlternativeApproach(
    originalPlan: AutomationPlan,
    failureResult: AutomationResult,
    pageContext: PageContext
  ): AutomationPlan | null {
    if (failureResult.success) return null;

    const alternativeSteps: BrowserAction[] = [];
    const failedStepIndex = failureResult.stepsExecuted || 0;

    // Copy successful steps
    alternativeSteps.push(...originalPlan.steps.slice(0, failedStepIndex));

    // Generate alternative for failed step
    if (failedStepIndex < originalPlan.steps.length) {
      const failedStep = originalPlan.steps[failedStepIndex];
      const alternativeStep = this.generateAlternativeStep(failedStep, pageContext);
      
      if (alternativeStep) {
        alternativeSteps.push(alternativeStep);
        
        // Add remaining steps
        alternativeSteps.push(...originalPlan.steps.slice(failedStepIndex + 1));
      }
    }

    if (alternativeSteps.length === 0) return null;

    return {
      ...originalPlan,
      id: this.generatePlanId(),
      steps: alternativeSteps,
      metadata: {
        ...originalPlan.metadata,
        isAlternative: true,
        originalPlanId: originalPlan.id,
        generatedFromFailure: true
      }
    };
  }

  /**
   * Private analysis methods
   */

  private async performAnalysis(
    plan: AutomationPlan,
    result: AutomationResult,
    pageContext: PageContext
  ): Promise<FeedbackAnalysis> {
    const improvements: string[] = [];
    const successfulActions: string[] = [];
    const failedActions: string[] = [];
    const commonErrors: string[] = [];

    // Analyze each step
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      const wasExecuted = i < (result.stepsExecuted || 0);
      const wasSuccessful = wasExecuted && result.success;

      if (wasSuccessful) {
        successfulActions.push(step.type);
      } else if (wasExecuted) {
        failedActions.push(step.type);
      }
    }

    // Extract common errors
    if (result.errors) {
      commonErrors.push(...result.errors);
    }

    // Generate improvements
    improvements.push(...this.suggestImprovements(plan, result, pageContext));

    // Calculate confidence based on historical data
    const confidence = this.calculateConfidence(plan, result);

    // Generate recommendations
    const recommendations = {
      planOptimizations: this.generatePlanOptimizations(plan, result),
      elementSelectors: this.generateSelectorRecommendations(plan, pageContext),
      timingAdjustments: this.generateTimingRecommendations(plan, result)
    };

    return {
      success: result.success,
      confidence,
      improvements,
      patterns: {
        successfulActions,
        failedActions,
        commonErrors
      },
      recommendations
    };
  }

  private updatePatterns(learningData: LearningData): void {
    const { executionResult, intent } = learningData;

    // Update success/failure patterns
    const patternKey = `${intent?.type || 'unknown'}_${executionResult.success ? 'success' : 'failure'}`;
    
    if (executionResult.success) {
      this.successPatterns.set(patternKey, (this.successPatterns.get(patternKey) || 0) + 1);
    } else {
      this.failurePatterns.set(patternKey, (this.failurePatterns.get(patternKey) || 0) + 1);
      
      // Track specific error patterns
      if (executionResult.errors) {
        for (const error of executionResult.errors) {
          const errorPattern = this.extractErrorPattern(error);
          this.failurePatterns.set(errorPattern, (this.failurePatterns.get(errorPattern) || 0) + 1);
        }
      }
    }
  }

  private calculateConfidence(plan: AutomationPlan, result: AutomationResult): number {
    let confidence = result.success ? 0.8 : 0.2;

    // Adjust based on historical success rate for similar intents
    const intentType = plan.metadata?.intent?.type;
    if (intentType) {
      const historicalData = this.learningHistory.filter(data => 
        data.intent?.type === intentType
      );
      
      if (historicalData.length > 0) {
        const successRate = historicalData.filter(data => 
          data.executionResult.success
        ).length / historicalData.length;
        
        confidence = confidence * 0.7 + successRate * 0.3;
      }
    }

    // Adjust based on execution completeness
    if (result.stepsExecuted && plan.steps.length > 0) {
      const completionRate = result.stepsExecuted / plan.steps.length;
      confidence *= completionRate;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private generateBestPractices(): string[] {
    const practices: string[] = [];

    // Analyze successful patterns
    const successfulIntents = this.learningHistory
      .filter(data => data.executionResult.success)
      .map(data => data.intent?.type)
      .filter(Boolean);

    const intentCounts = successfulIntents.reduce((acc, intent) => {
      acc[intent] = (acc[intent] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Generate practices based on successful patterns
    if (intentCounts.click_element > 5) {
      practices.push('Use specific selectors (ID, data attributes) for click actions');
    }

    if (intentCounts.fill_form > 3) {
      practices.push('Clear form fields before typing new values');
      practices.push('Add small delays between form field interactions');
    }

    if (intentCounts.navigate > 2) {
      practices.push('Always wait for page load completion after navigation');
    }

    // Add general best practices
    practices.push('Use explicit waits instead of fixed delays when possible');
    practices.push('Verify element visibility before interaction');
    practices.push('Handle dynamic content with appropriate wait conditions');

    return practices;
  }

  private analyzeSelectorReliability(): Array<{ selector: string; successRate: number }> {
    const selectorStats: Map<string, { total: number; successful: number }> = new Map();

    // Analyze selector usage across all executions
    for (const data of this.learningHistory) {
      // This would need access to the actual plan steps
      // For now, we'll return a placeholder
    }

    return Array.from(selectorStats.entries())
      .map(([selector, stats]) => ({
        selector,
        successRate: stats.successful / stats.total
      }))
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 20);
  }

  private getFailedStepTypes(result: AutomationResult): string[] {
    // This would need more detailed error information
    // For now, infer from error messages
    const failedTypes: string[] = [];

    if (result.errors) {
      for (const error of result.errors) {
        if (error.includes('click')) failedTypes.push('click');
        if (error.includes('type') || error.includes('input')) failedTypes.push('type');
        if (error.includes('navigate')) failedTypes.push('navigate');
        if (error.includes('wait')) failedTypes.push('wait');
      }
    }

    return [...new Set(failedTypes)];
  }

  private getStepTypeImprovements(stepType: string): string[] {
    const improvements: Record<string, string[]> = {
      click: [
        'Ensure element is visible and not covered',
        'Use more specific selectors',
        'Add scroll-into-view before clicking'
      ],
      type: [
        'Clear field before typing',
        'Verify field is focused',
        'Use slower typing speed for complex forms'
      ],
      navigate: [
        'Increase navigation timeout',
        'Wait for specific elements after navigation',
        'Handle potential redirects'
      ],
      wait: [
        'Use element-specific waits instead of fixed delays',
        'Increase timeout for slow-loading content',
        'Add multiple wait conditions'
      ]
    };

    return improvements[stepType] || [];
  }

  private generateAlternativeStep(
    failedStep: BrowserAction,
    pageContext: PageContext
  ): BrowserAction | null {
    switch (failedStep.type) {
      case 'click':
        // Try alternative selectors
        if (failedStep.selector) {
          const alternativeSelector = this.findAlternativeSelector(
            failedStep.selector,
            pageContext
          );
          if (alternativeSelector) {
            return {
              ...failedStep,
              id: this.generateActionId(),
              selector: alternativeSelector,
              description: `${failedStep.description} (alternative selector)`
            };
          }
        }
        break;

      case 'type':
        // Try with different approach (clear first, slower typing)
        return {
          ...failedStep,
          id: this.generateActionId(),
          clearFirst: true,
          typingSpeed: 'slow',
          description: `${failedStep.description} (alternative approach)`
        };

      case 'wait':
        // Increase timeout
        return {
          ...failedStep,
          id: this.generateActionId(),
          timeout: (failedStep.timeout || 5000) * 2,
          description: `${failedStep.description} (longer timeout)`
        };
    }

    return null;
  }

  private findAlternativeSelector(
    originalSelector: string,
    pageContext: PageContext
  ): string | null {
    // Find elements that might be the same target
    const elements = pageContext.elements.filter(el => el.interactable);
    
    // Try to find by text content if original was by selector
    for (const element of elements) {
      if (element.selector !== originalSelector && element.text) {
        // This is a simplified approach
        return element.selector;
      }
    }

    return null;
  }

  private generatePlanOptimizations(
    plan: AutomationPlan,
    result: AutomationResult
  ): string[] {
    const optimizations: string[] = [];

    if (!result.success) {
      optimizations.push('Add more robust error handling');
      optimizations.push('Include alternative paths for critical steps');
    }

    if (result.executionTime && result.executionTime > plan.estimatedDuration * 1.5) {
      optimizations.push('Optimize step timing and reduce unnecessary waits');
    }

    if (plan.steps.length > 10) {
      optimizations.push('Consider breaking complex plans into smaller sub-plans');
    }

    return optimizations;
  }

  private generateSelectorRecommendations(
    plan: AutomationPlan,
    pageContext: PageContext
  ): string[] {
    const recommendations: string[] = [];

    // Analyze selectors used in the plan
    const selectors = plan.steps
      .map(step => step.selector)
      .filter(Boolean);

    for (const selector of selectors) {
      if (selector?.includes('nth-child') || selector?.includes('nth-of-type')) {
        recommendations.push(`Consider using more stable selector instead of ${selector}`);
      }

      if (selector?.startsWith('.') && selector.split('.').length > 3) {
        recommendations.push(`Simplify complex class selector: ${selector}`);
      }
    }

    return recommendations;
  }

  private generateTimingRecommendations(
    plan: AutomationPlan,
    result: AutomationResult
  ): string[] {
    const recommendations: string[] = [];

    if (result.errors?.some(error => error.includes('timeout'))) {
      recommendations.push('Increase timeout values for slow-loading elements');
      recommendations.push('Add progressive wait strategies');
    }

    if (result.executionTime && result.executionTime < plan.estimatedDuration * 0.5) {
      recommendations.push('Consider reducing wait times to improve performance');
    }

    return recommendations;
  }

  private extractErrorPattern(error: string): string {
    // Extract common error patterns
    if (error.includes('element not found')) return 'element_not_found';
    if (error.includes('timeout')) return 'timeout';
    if (error.includes('not clickable')) return 'not_clickable';
    if (error.includes('navigation')) return 'navigation_error';
    
    return 'unknown_error';
  }

  private generateActionId(): string {
    return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generatePlanId(): string {
    return `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Export learning data for analysis
   */
  exportLearningData(): LearningData[] {
    return [...this.learningHistory];
  }

  /**
   * Import learning data
   */
  importLearningData(data: LearningData[]): void {
    this.learningHistory.push(...data);
    
    // Rebuild patterns
    this.successPatterns.clear();
    this.failurePatterns.clear();
    
    for (const learningData of this.learningHistory) {
      this.updatePatterns(learningData);
    }
  }

  /**
   * Clear learning history
   */
  clearLearningData(): void {
    this.learningHistory = [];
    this.successPatterns.clear();
    this.failurePatterns.clear();
  }
}
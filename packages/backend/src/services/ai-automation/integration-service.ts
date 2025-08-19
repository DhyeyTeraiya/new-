/**
 * AI Automation Integration Service
 * Main service that orchestrates AI and automation integration
 */

import { AIAutomationCoordinator } from './ai-automation-coordinator';
import { ActionPlanner } from './action-planner';
import { FeedbackAnalyzer } from './feedback-analyzer';
import { AIService } from '../nvidia/ai-service';
import { AutomationEngine } from '../automation/automation-engine';
import { ContextManager } from '../nvidia/context-manager';
import { IntentClassifier } from '../nvidia/intent-classifier';
import { ResponseGenerator } from '../nvidia/response-generator';
import { Logger } from '../../utils/logger';
import { 
  PageContext, 
  AutomationPlan, 
  AutomationResult,
  AIResponse,
  UserSession 
} from '@browser-ai-agent/shared';

export interface IntegrationConfig {
  enableLearning: boolean;
  maxRetries: number;
  defaultTimeout: number;
  riskThreshold: 'low' | 'medium' | 'high';
  requireConfirmationForRisk: boolean;
}

export class IntegrationService {
  private coordinator: AIAutomationCoordinator;
  private actionPlanner: ActionPlanner;
  private feedbackAnalyzer: FeedbackAnalyzer;
  private logger: Logger;
  private config: IntegrationConfig;

  // Service dependencies
  private aiService: AIService;
  private automationEngine: AutomationEngine;
  private contextManager: ContextManager;
  private intentClassifier: IntentClassifier;
  private responseGenerator: ResponseGenerator;

  constructor(
    aiService: AIService,
    automationEngine: AutomationEngine,
    contextManager: ContextManager,
    intentClassifier: IntentClassifier,
    responseGenerator: ResponseGenerator,
    logger: Logger,
    config: IntegrationConfig = {
      enableLearning: true,
      maxRetries: 3,
      defaultTimeout: 30000,
      riskThreshold: 'medium',
      requireConfirmationForRisk: true
    }
  ) {
    this.aiService = aiService;
    this.automationEngine = automationEngine;
    this.contextManager = contextManager;
    this.intentClassifier = intentClassifier;
    this.responseGenerator = responseGenerator;
    this.logger = logger;
    this.config = config;

    // Initialize components
    this.actionPlanner = new ActionPlanner(logger);
    this.feedbackAnalyzer = new FeedbackAnalyzer(logger);
    this.coordinator = new AIAutomationCoordinator(
      aiService,
      automationEngine,
      contextManager,
      intentClassifier,
      responseGenerator,
      logger
    );
  }

  /**
   * Process user message and generate AI response with automation
   */
  async processMessage(
    sessionId: string,
    message: string,
    pageContext: PageContext,
    conversationHistory?: any[]
  ): Promise<{
    aiResponse: AIResponse;
    automationPlan?: AutomationPlan;
    requiresConfirmation?: boolean;
    metadata?: any;
  }> {
    try {
      this.logger.info('Processing message with AI automation integration', {
        sessionId,
        messageLength: message.length,
        pageUrl: pageContext.url
      });

      // Process through coordinator
      const result = await this.coordinator.processRequest({
        sessionId,
        message,
        pageContext,
        conversationHistory
      });

      // Enhance response with learning insights if available
      if (this.config.enableLearning) {
        const insights = this.feedbackAnalyzer.getLearningInsights();
        result.response.metadata = {
          ...result.response.metadata,
          learningInsights: {
            successRate: insights.successRate,
            totalExecutions: insights.totalExecutions
          }
        };
      }

      return {
        aiResponse: result.response,
        automationPlan: result.automationPlan,
        requiresConfirmation: result.requiresConfirmation,
        metadata: {
          riskLevel: result.riskLevel,
          estimatedDuration: result.estimatedDuration
        }
      };

    } catch (error) {
      this.logger.error('Error processing message', error);
      
      // Return error response
      return {
        aiResponse: {
          content: 'I encountered an error while processing your request. Please try again.',
          type: 'error',
          confidence: 0.1,
          metadata: {
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      };
    }
  }

  /**
   * Execute automation with retry logic and feedback
   */
  async executeAutomation(
    sessionId: string,
    planId: string,
    userConfirmation?: boolean
  ): Promise<{
    result: AutomationResult;
    feedback?: any;
    alternativePlan?: AutomationPlan;
  }> {
    let lastResult: AutomationResult | null = null;
    let retryCount = 0;

    while (retryCount <= this.config.maxRetries) {
      try {
        this.logger.info('Executing automation', {
          sessionId,
          planId,
          attempt: retryCount + 1,
          maxRetries: this.config.maxRetries
        });

        // Execute automation
        const result = await this.coordinator.executeAutomation(
          sessionId,
          planId,
          userConfirmation
        );

        lastResult = result;

        // If successful, analyze feedback and return
        if (result.success) {
          if (this.config.enableLearning) {
            await this.processFeedback(sessionId, planId, result);
          }

          return { result };
        }

        // If failed and we have retries left, try to generate alternative
        if (retryCount < this.config.maxRetries) {
          const alternativePlan = await this.generateAlternativePlan(
            sessionId,
            planId,
            result
          );

          if (alternativePlan) {
            this.logger.info('Generated alternative plan, retrying', {
              sessionId,
              originalPlanId: planId,
              alternativePlanId: alternativePlan.id
            });

            // Use alternative plan for next attempt
            planId = alternativePlan.id;
          }
        }

        retryCount++;

      } catch (error) {
        this.logger.error('Automation execution error', error);
        retryCount++;

        if (retryCount > this.config.maxRetries) {
          throw error;
        }
      }
    }

    // All retries exhausted, return last result with feedback
    if (lastResult) {
      const feedback = await this.processFeedback(sessionId, planId, lastResult);
      const alternativePlan = await this.generateAlternativePlan(
        sessionId,
        planId,
        lastResult
      );

      return {
        result: lastResult,
        feedback,
        alternativePlan
      };
    }

    throw new Error('Automation execution failed after all retries');
  }

  /**
   * Get automation status
   */
  getAutomationStatus(sessionId: string): any {
    return this.coordinator.getAutomationStatus(sessionId);
  }

  /**
   * Cancel running automation
   */
  async cancelAutomation(sessionId: string): Promise<void> {
    await this.coordinator.cancelAutomation(sessionId);
  }

  /**
   * Provide user feedback on automation results
   */
  async provideUserFeedback(
    sessionId: string,
    planId: string,
    feedback: {
      rating: number;
      comments?: string;
      wasHelpful: boolean;
    }
  ): Promise<AIResponse> {
    try {
      this.logger.info('Processing user feedback', {
        sessionId,
        planId,
        rating: feedback.rating,
        wasHelpful: feedback.wasHelpful
      });

      // Store feedback for learning
      if (this.config.enableLearning) {
        // This would need access to the original plan and result
        // For now, we'll generate a response based on the feedback
      }

      // Generate AI response to feedback
      const response = await this.generateFeedbackResponse(sessionId, feedback);

      return response;

    } catch (error) {
      this.logger.error('Error processing user feedback', error);
      throw error;
    }
  }

  /**
   * Get learning insights and statistics
   */
  getLearningInsights(): any {
    if (!this.config.enableLearning) {
      return { enabled: false };
    }

    const insights = this.feedbackAnalyzer.getLearningInsights();
    
    return {
      enabled: true,
      ...insights,
      configuration: {
        maxRetries: this.config.maxRetries,
        riskThreshold: this.config.riskThreshold,
        requireConfirmationForRisk: this.config.requireConfirmationForRisk
      }
    };
  }

  /**
   * Update integration configuration
   */
  updateConfiguration(newConfig: Partial<IntegrationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    this.logger.info('Integration configuration updated', {
      newConfig: this.config
    });
  }

  /**
   * Private helper methods
   */

  private async processFeedback(
    sessionId: string,
    planId: string,
    result: AutomationResult
  ): Promise<any> {
    try {
      // Get the original plan and page context
      // This would need to be retrieved from storage or context
      const plan = await this.getAutomationPlan(planId);
      const pageContext = await this.getPageContext(sessionId);

      if (plan && pageContext) {
        const analysis = await this.feedbackAnalyzer.analyzeFeedback(
          plan,
          result,
          pageContext
        );

        this.logger.debug('Feedback analysis completed', {
          sessionId,
          planId,
          confidence: analysis.confidence,
          improvementsCount: analysis.improvements.length
        });

        return analysis;
      }

      return null;

    } catch (error) {
      this.logger.error('Error processing feedback', error);
      return null;
    }
  }

  private async generateAlternativePlan(
    sessionId: string,
    planId: string,
    failedResult: AutomationResult
  ): Promise<AutomationPlan | null> {
    try {
      const originalPlan = await this.getAutomationPlan(planId);
      const pageContext = await this.getPageContext(sessionId);

      if (originalPlan && pageContext) {
        const alternativePlan = this.feedbackAnalyzer.generateAlternativeApproach(
          originalPlan,
          failedResult,
          pageContext
        );

        if (alternativePlan) {
          this.logger.info('Generated alternative automation plan', {
            sessionId,
            originalPlanId: planId,
            alternativePlanId: alternativePlan.id
          });

          // Store the alternative plan
          await this.storeAutomationPlan(alternativePlan);
        }

        return alternativePlan;
      }

      return null;

    } catch (error) {
      this.logger.error('Error generating alternative plan', error);
      return null;
    }
  }

  private async generateFeedbackResponse(
    sessionId: string,
    feedback: any
  ): Promise<AIResponse> {
    let content = '';

    if (feedback.rating >= 4) {
      content = "I'm glad the automation was helpful! ";
      if (feedback.comments) {
        content += "Thank you for the feedback. I'll use this to improve future automations.";
      }
    } else if (feedback.rating >= 2) {
      content = "I understand the automation could have been better. ";
      if (feedback.comments) {
        content += "I'll take your feedback into account to improve next time.";
      } else {
        content += "Could you let me know what didn't work well so I can improve?";
      }
    } else {
      content = "I'm sorry the automation didn't work as expected. ";
      content += "Would you like me to try a different approach or help you with something else?";
    }

    return {
      content,
      type: 'feedback_response',
      confidence: 0.8,
      metadata: {
        userRating: feedback.rating,
        wasHelpful: feedback.wasHelpful
      }
    };
  }

  private async getAutomationPlan(planId: string): Promise<AutomationPlan | null> {
    // This would retrieve the plan from storage
    // For now, return null as placeholder
    return null;
  }

  private async getPageContext(sessionId: string): Promise<PageContext | null> {
    try {
      const context = await this.contextManager.getContext(sessionId);
      return context?.pageContext || null;
    } catch (error) {
      this.logger.error('Error getting page context', error);
      return null;
    }
  }

  private async storeAutomationPlan(plan: AutomationPlan): Promise<void> {
    // This would store the plan in database or cache
    // For now, just log it
    this.logger.debug('Storing automation plan', {
      planId: plan.id,
      stepsCount: plan.steps.length
    });
  }

  /**
   * Health check for the integration service
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: Record<string, boolean>;
    metrics?: any;
  }> {
    const components: Record<string, boolean> = {};

    try {
      // Check AI service
      components.aiService = await this.checkAIService();
      
      // Check automation engine
      components.automationEngine = await this.checkAutomationEngine();
      
      // Check context manager
      components.contextManager = await this.checkContextManager();

      const allHealthy = Object.values(components).every(status => status);
      const someHealthy = Object.values(components).some(status => status);

      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (allHealthy) {
        status = 'healthy';
      } else if (someHealthy) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }

      const metrics = this.config.enableLearning ? 
        this.feedbackAnalyzer.getLearningInsights() : 
        undefined;

      return {
        status,
        components,
        metrics
      };

    } catch (error) {
      this.logger.error('Health check failed', error);
      
      return {
        status: 'unhealthy',
        components
      };
    }
  }

  private async checkAIService(): Promise<boolean> {
    try {
      // Simple health check - try to generate a basic response
      const response = await this.aiService.generateResponse('test', {
        model: 'llama-3.3-70b-versatile',
        maxTokens: 10
      });
      return !!response;
    } catch {
      return false;
    }
  }

  private async checkAutomationEngine(): Promise<boolean> {
    try {
      // Check if automation engine is responsive
      // This would depend on the automation engine implementation
      return true; // Placeholder
    } catch {
      return false;
    }
  }

  private async checkContextManager(): Promise<boolean> {
    try {
      // Check if context manager is working
      const testContext = await this.contextManager.getContext('health-check');
      return true; // If no error, it's working
    } catch {
      return false;
    }
  }
}